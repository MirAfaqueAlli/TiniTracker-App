import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, Notification, User, PatientHistory } from '@/lib/db/models/index';
import { doctorTypeFilter, hasPermission } from '@/lib/utils/rbac';

const MAX_SOURCE_ROWS = 1000;
const CAP_NOTE = `Combined activity is limited to ${MAX_SOURCE_ROWS} rows per source before in-memory pagination.`;

const NOTIFICATION_STATUS_LABELS = {
  pending:   '⏳ Pending',
  sent:      '✅ Sent',
  delivered: '📬 Delivered',
  read:      '👁️ Read',
  failed:    '❌ Failed',
};

function notificationStatusLabel(status) {
  return NOTIFICATION_STATUS_LABELS[status] || status;
}

// GET /api/activity  — all authenticated users (data scoped by role & permissions)
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'activity.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view activity logs' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page    = Math.max(1, parseInt(searchParams.get('page')  || '1'));
    const limit   = Math.min(50, parseInt(searchParams.get('limit') || '20'));
    const type    = searchParams.get('type') || 'all';
    const from    = searchParams.get('from');  // YYYY-MM-DD
    const to      = searchParams.get('to');    // YYYY-MM-DD
    const offset  = (page - 1) * limit;
    const hospitalId = user.hospital_id;
    const doctorTypes  = doctorTypeFilter(user);
    const patientBaseWhere = { hospital_id: hospitalId };
    if (doctorTypes) patientBaseWhere.patient_type = { [Op.in]: doctorTypes };

    const mkDateWhere = (col) => {
      const w = {};
      if (from) w[Op.gte] = new Date(from + 'T00:00:00.000Z');
      if (to)   w[Op.lte] = new Date(to   + 'T23:59:59.999Z');
      return Object.keys(w).length ? { [col]: w } : {};
    };

    async function fetchUserNames(ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (!unique.length) return {};
      const users = await User.findAll({ where: { id: { [Op.in]: unique } }, attributes: ['id', 'name', 'role'] });
      return Object.fromEntries(users.map(u => [u.id, { name: u.name, role: u.role }]));
    }

    function formatUser(id, map) {
      if (!id || !map[id]) return null;
      const u = map[id];
      const roleLabel = {
        admin:                 'Admin',
        staff:                 'Staff',
        doctor_pregnancy:      'Doctor (Pregnancy)',
        doctor_immunization:   'Doctor (Immunization)',
      }[u.role] || u.role;
      return `${u.name} (${roleLabel})`;
    }

    const patientInclude = () => ({
      model: Patient,
      required: true,
      where: patientBaseWhere,
      attributes: ['id', 'name'],
    });

    // ── SPECIFIC TYPE — true DB-level pagination ───────────────────────────

    if (type === 'registration') {
      const where = { ...patientBaseWhere, ...mkDateWhere('createdAt') };
      const { count, rows } = await Patient.findAndCountAll({
        where, order: [['createdAt', 'DESC']], limit, offset,
        attributes: ['id', 'name', 'patient_type', 'registered_by', 'createdAt'],
        raw: true,
      });
      const userMap = await fetchUserNames(rows.map(r => r.registered_by));
      const logs = rows.map(p => ({
        id:          `reg-${p.id}`,
        type:        'registration',
        subtype:     p.patient_type === 'immunization' ? 'child_registered' : 'mother_registered',
        description: p.patient_type === 'immunization'
          ? 'New child registered for immunization'
          : 'New mother registered for antenatal care',
        patient:     p.name,
        patientId:   p.id,
        performedBy: formatUser(p.registered_by, userMap),
        time:        p.createdAt,
      }));
      return NextResponse.json({ total: count, page, limit, pages: Math.ceil(count / limit), logs });
    }

    // Delivery events come from PatientHistory so the actor is the person who
    // actually recorded the delivery, not the patient's original registrar.
    if (type === 'delivery') {
      const where = { event_type: 'delivery_recorded', ...mkDateWhere('createdAt') };
      const { count, rows } = await PatientHistory.findAndCountAll({
        where,
        include: [patientInclude()],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });
      const userMap = await fetchUserNames(rows.map(r => r.performed_by));
      const logs = rows.map(h => {
        const d = h.event_data || {};
        return {
          id:          `del-${h.id}`,
          type:        'delivery',
          subtype:     'delivery_recorded',
          description: `Delivery recorded${d.child_name ? ` — Child: ${d.child_name}` : ''}${d.delivery_mode ? ` (${d.delivery_mode})` : ''}`,
          patient:     h.Patient?.name || '—',
          patientId:   h.Patient?.id,
          performedBy: formatUser(h.performed_by, userMap) || 'System',
          time:        h.createdAt,
        };
      });
      return NextResponse.json({ total: count, page, limit, pages: Math.ceil(count / limit), logs });
    }

    if (type === 'stage') {
      const vsWhere = {
        status: { [Op.in]: ['visited', 'skipped'] },
        ...mkDateWhere('updatedAt'),
      };
      const rsWhere = {
        date_overridden: true,
        ...mkDateWhere('updatedAt'),
      };

      const patientStageInclude = [{ model: Patient, required: true, where: patientBaseWhere, attributes: ['id', 'name'] }];
      const tplInclude = [{ model: StageTemplate, as: 'template', attributes: ['stage_name'] }];

      const [vsCount, vsRows, rsCount, rsRows] = await Promise.all([
        PatientStage.count({ where: vsWhere, include: patientStageInclude }),
        PatientStage.findAll({ where: vsWhere, include: [...patientStageInclude, ...tplInclude], order: [['updatedAt','DESC']], limit: MAX_SOURCE_ROWS }),
        PatientStage.count({ where: rsWhere, include: patientStageInclude }),
        PatientStage.findAll({ where: rsWhere, include: [...patientStageInclude, ...tplInclude], order: [['updatedAt','DESC']], limit: MAX_SOURCE_ROWS }),
      ]);

      const userIds = [...new Set([...vsRows, ...rsRows].map(s => s.recorded_by).filter(Boolean))];
      const userMap = await fetchUserNames(userIds);

      const allLogs = [];
      for (const s of vsRows) {
        const stageName = s.template?.stage_name || 'Appointment';
        allLogs.push({
          id:          `${s.status === 'visited' ? 'vis' : 'skip'}-${s.id}`,
          type:        'stage',
          subtype:     s.status === 'visited' ? 'stage_visited' : 'stage_skipped',
          description: s.status === 'visited'
            ? `${stageName} marked as visited`
            : `${stageName} skipped${s.skip_reason ? ` — "${s.skip_reason}"` : ''}`,
          patient:     s.Patient?.name || '—',
          patientId:   s.Patient?.id,
          performedBy: formatUser(s.recorded_by, userMap) || 'System',
          time:        s.updatedAt,
        });
      }
      for (const s of rsRows) {
        const stageName = s.template?.stage_name || 'Appointment';
        allLogs.push({
          id:          `rsch-${s.id}`,
          type:        'stage',
          subtype:     'stage_rescheduled',
          description: `${stageName} rescheduled to ${s.scheduled_date}${s.override_reason ? ` — "${s.override_reason}"` : ''}`,
          patient:     s.Patient?.name || '—',
          patientId:   s.Patient?.id,
          performedBy: formatUser(s.recorded_by, userMap) || 'System',
          time:        s.updatedAt,
        });
      }
      allLogs.sort((a, b) => new Date(b.time) - new Date(a.time));
      const total = allLogs.length;
      const paged = allLogs.slice(offset, offset + limit);
      return NextResponse.json({ total, page, limit, pages: Math.ceil(total / limit), logs: paged, capped: total > MAX_SOURCE_ROWS, cap_note: CAP_NOTE });
    }

    if (type === 'notification') {
      const where = { ...mkDateWhere('sent_at') };
      const { count, rows } = await Notification.findAndCountAll({
        where, include: [patientInclude()], order: [['sent_at','DESC']], limit, offset,
      });
      const logs = rows.map(n => ({
        id:          `notif-${n.id}`,
        type:        'notification',
        subtype:     n.type,
        description: `WhatsApp ${n.type.replace(/_/g, ' ')} — ${notificationStatusLabel(n.status)}`,
        patient:     n.Patient?.name || '—',
        patientId:   n.Patient?.id,
        performedBy: n.sent_by_name || 'System (Auto)',
        time:        n.sent_at,
      }));
      return NextResponse.json({ total: count, page, limit, pages: Math.ceil(count / limit), logs });
    }

    // ── ALL — combine sources with documented per-source cap ───────────────
    const dateWhere = mkDateWhere('createdAt');
    const dateWhereUpd = mkDateWhere('updatedAt');
    const dateWhereSent = mkDateWhere('sent_at');
    const tplInclude = [{ model: StageTemplate, as: 'template', attributes: ['stage_name'] }];

    const [regs, deliveries, visited, skipped, rescheduled, notifs, patientEvents] = await Promise.all([
      Patient.findAll({
        where: { ...patientBaseWhere, ...dateWhere },
        order: [['createdAt','DESC']], limit: MAX_SOURCE_ROWS,
        attributes: ['id', 'name', 'patient_type', 'registered_by', 'createdAt'], raw: true,
      }),
      PatientHistory.findAll({
        where: { event_type: 'delivery_recorded', ...dateWhere },
        include: [patientInclude()],
        order: [['createdAt','DESC']],
        limit: MAX_SOURCE_ROWS,
      }),
      PatientStage.findAll({
        where: { status: 'visited', ...dateWhereUpd },
        include: [patientInclude(), ...tplInclude],
        order: [['updatedAt','DESC']], limit: MAX_SOURCE_ROWS,
      }),
      PatientStage.findAll({
        where: { status: 'skipped', ...dateWhereUpd },
        include: [patientInclude(), ...tplInclude],
        order: [['updatedAt','DESC']], limit: MAX_SOURCE_ROWS,
      }),
      PatientStage.findAll({
        where: { date_overridden: true, ...dateWhereUpd },
        include: [patientInclude(), ...tplInclude],
        order: [['updatedAt','DESC']], limit: MAX_SOURCE_ROWS,
      }),
      Notification.findAll({
        where: { ...dateWhereSent },
        include: [patientInclude()],
        order: [['sent_at','DESC']], limit: MAX_SOURCE_ROWS,
      }),
      PatientHistory.findAll({
        where: {
          event_type: { [Op.in]: ['edd_updated', 'patient_edited', 'hospital_transferred'] },
          ...dateWhere,
        },
        include: [patientInclude()],
        order: [['createdAt','DESC']],
        limit: MAX_SOURCE_ROWS,
      }),
    ]);

    const stageUserIds = [...new Set([...visited, ...skipped, ...rescheduled].map(s => s.recorded_by).filter(Boolean))];
    const regUserIds   = [...new Set(regs.map(r => r.registered_by).filter(Boolean))];
    const eventUserIds = [...new Set([
      ...deliveries.map(d => d.performed_by),
      ...patientEvents.map(e => e.performed_by),
    ].filter(Boolean))];
    const userMap = await fetchUserNames([...stageUserIds, ...regUserIds, ...eventUserIds]);

    const describePatientEvent = (h) => {
      const d = h.event_data || {};
      if (h.event_type === 'edd_updated') {
        return `EDD updated from ${d.old_edd || '—'} to ${d.new_edd || '—'}${d.source ? ` (${d.source})` : ''}${d.reason ? ` — "${d.reason}"` : ''}`;
      }
      if (h.event_type === 'patient_edited') {
        const fields = Array.isArray(d.fields_changed) ? d.fields_changed.join(', ') : 'details';
        return `Patient details updated: ${fields}${d.reason ? ` — "${d.reason}"` : ''}`;
      }
      if (h.event_type === 'hospital_transferred') {
        return `Patient transferred from hospital #${d.from_hospital_id} to #${d.to_hospital_id}`;
      }
      return h.event_type;
    };

    const logs = [
      ...regs.map(p => ({
        id: `reg-${p.id}`, type: 'registration',
        subtype: p.patient_type === 'immunization' ? 'child_registered' : 'mother_registered',
        description: p.patient_type === 'immunization' ? 'New child registered for immunization' : 'New mother registered for antenatal care',
        patient: p.name, patientId: p.id,
        performedBy: formatUser(p.registered_by, userMap) || 'System',
        time: p.createdAt,
      })),
      ...deliveries.map(h => {
        const d = h.event_data || {};
        return {
          id: `del-${h.id}`, type: 'delivery', subtype: 'delivery_recorded',
          description: `Delivery recorded${d.child_name ? ` — Child: ${d.child_name}` : ''}${d.delivery_mode ? ` (${d.delivery_mode})` : ''}`,
          patient: h.Patient?.name || '—', patientId: h.Patient?.id,
          performedBy: formatUser(h.performed_by, userMap) || 'System',
          time: h.createdAt,
        };
      }),
      ...visited.map(s => ({
        id: `vis-${s.id}`, type: 'stage', subtype: 'stage_visited',
        description: `${s.template?.stage_name || 'Appointment'} marked as visited`,
        patient: s.Patient?.name || '—', patientId: s.Patient?.id,
        performedBy: formatUser(s.recorded_by, userMap) || 'System',
        time: s.updatedAt,
      })),
      ...skipped.map(s => ({
        id: `skip-${s.id}`, type: 'stage', subtype: 'stage_skipped',
        description: `${s.template?.stage_name || 'Appointment'} skipped${s.skip_reason ? ` — "${s.skip_reason}"` : ''}`,
        patient: s.Patient?.name || '—', patientId: s.Patient?.id,
        performedBy: formatUser(s.recorded_by, userMap) || 'System',
        time: s.updatedAt,
      })),
      ...rescheduled.map(s => ({
        id: `rsch-${s.id}`, type: 'stage', subtype: 'stage_rescheduled',
        description: `${s.template?.stage_name || 'Appointment'} rescheduled to ${s.scheduled_date}${s.override_reason ? ` — "${s.override_reason}"` : ''}`,
        patient: s.Patient?.name || '—', patientId: s.Patient?.id,
        performedBy: formatUser(s.recorded_by, userMap) || 'System',
        time: s.updatedAt,
      })),
      ...patientEvents.map(h => ({
        id: `ph-${h.id}`, type: 'patient', subtype: h.event_type,
        description: describePatientEvent(h),
        patient: h.Patient?.name || '—', patientId: h.Patient?.id,
        performedBy: formatUser(h.performed_by, userMap) || 'System',
        time: h.createdAt,
      })),
      ...notifs.map(n => ({
        id: `notif-${n.id}`, type: 'notification', subtype: n.type,
        description: `WhatsApp ${n.type.replace(/_/g, ' ')} — ${notificationStatusLabel(n.status)}`,
        patient: n.Patient?.name || '—', patientId: n.Patient?.id,
        performedBy: n.sent_by_name || 'System (Auto)',
        time: n.sent_at,
      })),
    ];

    logs.sort((a, b) => new Date(b.time) - new Date(a.time));
    const total = logs.length;
    const paged = logs.slice(offset, offset + limit);
    return NextResponse.json({ total, page, limit, pages: Math.ceil(total / limit), logs: paged, capped: true, cap_note: CAP_NOTE });

  } catch (err) {
    console.error('Activity log error:', err);
    return NextResponse.json({ error: 'Failed to fetch activity logs' }, { status: 500 });
  }
}
