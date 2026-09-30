import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, Notification, User } from '@/lib/db/models/index';
import { doctorTypeFilter, hasPermission } from '@/lib/utils/rbac';

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
    // Doctor type filter — limits which patients appear in logs
    const doctorTypes  = doctorTypeFilter(user);
    const patientBaseWhere = { hospital_id: hospitalId };
    if (doctorTypes) patientBaseWhere.patient_type = { [Op.in]: doctorTypes };

    // Helper to build date filter for a given column
    const mkDateWhere = (col) => {
      const w = {};
      if (from) w[Op.gte] = new Date(from + 'T00:00:00.000Z');
      if (to)   w[Op.lte] = new Date(to   + 'T23:59:59.999Z');
      return Object.keys(w).length ? { [col]: w } : {};
    };

    // Helper to bulk-fetch user names by IDs
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

    if (type === 'delivery') {
      const where = { ...patientBaseWhere, delivery_date: { [Op.ne]: null }, ...mkDateWhere('delivery_date') };
      const { count, rows } = await Patient.findAndCountAll({
        where, order: [['delivery_date', 'DESC']], limit, offset,
        attributes: ['id', 'name', 'delivery_date', 'child_name', 'registered_by'],
        raw: true,
      });
      const userMap = await fetchUserNames(rows.map(r => r.registered_by));
      const logs = rows.map(p => ({
        id:          `del-${p.id}`,
        type:        'delivery',
        subtype:     'delivery_recorded',
        description: `Delivery recorded${p.child_name ? ` — Child: ${p.child_name}` : ''}`,
        patient:     p.name,
        patientId:   p.id,
        performedBy: formatUser(p.registered_by, userMap),
        time:        p.delivery_date,
      }));
      return NextResponse.json({ total: count, page, limit, pages: Math.ceil(count / limit), logs });
    }

    if (type === 'stage') {
      // visited + skipped stages
      const vsWhere = {
        status: { [Op.in]: ['visited', 'skipped'] },
        ...mkDateWhere('updatedAt'),
      };
      const rsWhere = {
        date_overridden: true,
        ...mkDateWhere('updatedAt'),
      };

      const patientInclude = [
        { model: Patient, required: true, where: patientBaseWhere, attributes: ['id', 'name'] }
      ];
      const tplInclude = [
        { model: StageTemplate, as: 'template', attributes: ['stage_name'] }
      ];

      const [vsCount, vsRows, rsCount, rsRows] = await Promise.all([
        PatientStage.count({ where: vsWhere, include: patientInclude }),
        PatientStage.findAll({ where: vsWhere, include: [...patientInclude, ...tplInclude], order: [['updatedAt','DESC']], limit: 200 }),
        PatientStage.count({ where: rsWhere, include: patientInclude }),
        PatientStage.findAll({ where: rsWhere, include: [...patientInclude, ...tplInclude], order: [['updatedAt','DESC']], limit: 200 }),
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
          performedBy: formatUser(s.recorded_by, userMap),
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
          performedBy: formatUser(s.recorded_by, userMap),
          time:        s.updatedAt,
        });
      }
      allLogs.sort((a, b) => new Date(b.time) - new Date(a.time));
      const total = allLogs.length;
      const paged = allLogs.slice(offset, offset + limit);
      return NextResponse.json({ total, page, limit, pages: Math.ceil(total / limit), logs: paged });
    }

    if (type === 'notification') {
      const where = { ...mkDateWhere('sent_at') };
      const patientInclude = [
        { model: Patient, required: true, where: patientBaseWhere, attributes: ['id', 'name'] }
      ];
      const { count, rows } = await Notification.findAndCountAll({
        where, include: patientInclude, order: [['sent_at','DESC']], limit, offset,
      });
      const logs = rows.map(n => ({
        id:          `notif-${n.id}`,
        type:        'notification',
        subtype:     n.type,
        description: `WhatsApp ${n.type.replace(/_/g, ' ')} — ${n.status === 'sent' ? '✅ Sent' : '❌ Failed'}`,
        patient:     n.Patient?.name || '—',
        patientId:   n.Patient?.id,
        performedBy: 'System (Auto)',
        time:        n.sent_at,
      }));
      return NextResponse.json({ total: count, page, limit, pages: Math.ceil(count / limit), logs });
    }

    // ── ALL — combine sources with reasonable per-source limits ────────────
    const dateWhere = mkDateWhere('createdAt');
    const dateWhereUpd = mkDateWhere('updatedAt');
    const dateWhereSent = mkDateWhere('sent_at');
    const dateWhereDelivery = mkDateWhere('delivery_date');

    const patientInclude = [
      { model: Patient, required: true, where: patientBaseWhere, attributes: ['id', 'name'] }
    ];
    const tplInclude = [{ model: StageTemplate, as: 'template', attributes: ['stage_name'] }];

    const [regs, deliveries, visited, skipped, rescheduled, notifs] = await Promise.all([
      Patient.findAll({
        where: { ...patientBaseWhere, ...dateWhere },
        order: [['createdAt','DESC']], limit: 150,
        attributes: ['id', 'name', 'patient_type', 'registered_by', 'createdAt'], raw: true,
      }),
      Patient.findAll({
        where: { ...patientBaseWhere, delivery_date: { [Op.ne]: null }, ...dateWhereDelivery },
        order: [['delivery_date','DESC']], limit: 100,
        attributes: ['id', 'name', 'delivery_date', 'child_name', 'registered_by'], raw: true,
      }),
      PatientStage.findAll({
        where: { status: 'visited', ...dateWhereUpd },
        include: [...patientInclude, ...tplInclude],
        order: [['updatedAt','DESC']], limit: 200,
      }),
      PatientStage.findAll({
        where: { status: 'skipped', ...dateWhereUpd },
        include: [...patientInclude, ...tplInclude],
        order: [['updatedAt','DESC']], limit: 200,
      }),
      PatientStage.findAll({
        where: { date_overridden: true, ...dateWhereUpd },
        include: [...patientInclude, ...tplInclude],
        order: [['updatedAt','DESC']], limit: 200,
      }),
      Notification.findAll({
        where: { ...dateWhereSent },
        include: patientInclude,
        order: [['sent_at','DESC']], limit: 200,
      }),
    ]);

    const stageUserIds = [...new Set([...visited, ...skipped, ...rescheduled].map(s => s.recorded_by).filter(Boolean))];
    const regUserIds   = [...new Set([...regs, ...deliveries].map(r => r.registered_by).filter(Boolean))];
    const userMap = await fetchUserNames([...stageUserIds, ...regUserIds]);

    const logs = [
      ...regs.map(p => ({
        id: `reg-${p.id}`, type: 'registration',
        subtype: p.patient_type === 'immunization' ? 'child_registered' : 'mother_registered',
        description: p.patient_type === 'immunization' ? 'New child registered for immunization' : 'New mother registered for antenatal care',
        patient: p.name, patientId: p.id,
        performedBy: formatUser(p.registered_by, userMap),
        time: p.createdAt,
      })),
      ...deliveries.map(p => ({
        id: `del-${p.id}`, type: 'delivery', subtype: 'delivery_recorded',
        description: `Delivery recorded${p.child_name ? ` — Child: ${p.child_name}` : ''}`,
        patient: p.name, patientId: p.id,
        performedBy: formatUser(p.registered_by, userMap),
        time: p.delivery_date,
      })),
      ...visited.map(s => ({
        id: `vis-${s.id}`, type: 'stage', subtype: 'stage_visited',
        description: `${s.template?.stage_name || 'Appointment'} marked as visited`,
        patient: s.Patient?.name || '—', patientId: s.Patient?.id,
        performedBy: formatUser(s.recorded_by, userMap),
        time: s.updatedAt,
      })),
      ...skipped.map(s => ({
        id: `skip-${s.id}`, type: 'stage', subtype: 'stage_skipped',
        description: `${s.template?.stage_name || 'Appointment'} skipped${s.skip_reason ? ` — "${s.skip_reason}"` : ''}`,
        patient: s.Patient?.name || '—', patientId: s.Patient?.id,
        performedBy: formatUser(s.recorded_by, userMap),
        time: s.updatedAt,
      })),
      ...rescheduled.map(s => ({
        id: `rsch-${s.id}`, type: 'stage', subtype: 'stage_rescheduled',
        description: `${s.template?.stage_name || 'Appointment'} rescheduled to ${s.scheduled_date}${s.override_reason ? ` — "${s.override_reason}"` : ''}`,
        patient: s.Patient?.name || '—', patientId: s.Patient?.id,
        performedBy: formatUser(s.recorded_by, userMap),
        time: s.updatedAt,
      })),
      ...notifs.map(n => ({
        id: `notif-${n.id}`, type: 'notification', subtype: n.type,
        description: `WhatsApp ${n.type.replace(/_/g, ' ')} — ${n.status === 'sent' ? '✅ Sent' : '❌ Failed'}`,
        patient: n.Patient?.name || '—', patientId: n.Patient?.id,
        performedBy: 'System (Auto)',
        time: n.sent_at,
      })),
    ];

    logs.sort((a, b) => new Date(b.time) - new Date(a.time));
    const total = logs.length;
    const paged = logs.slice(offset, offset + limit);
    return NextResponse.json({ total, page, limit, pages: Math.ceil(total / limit), logs: paged });

  } catch (err) {
    console.error('Activity log error:', err);
    return NextResponse.json({ error: 'Failed to fetch activity logs' }, { status: 500 });
  }
}
