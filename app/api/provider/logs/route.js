import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import {
  Hospital,
  User,
  Patient,
  PatientStage,
  StageTemplate,
  Subscription,
  Payment,
  ProviderAdmin,
} from '@/lib/db/models/index';

const SOURCE_LIMIT = 1000;
const CAP_NOTE = `Each audit source is limited to ${SOURCE_LIMIT} rows before in-memory pagination.`;

function actor(name, role, id = null) {
  return { id, name: name || 'System', role: role || 'system' };
}

// GET /api/provider/logs — cross-hospital audit activity trail
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '30'));
    const type = searchParams.get('type') || 'all';
    const hospitalId = searchParams.get('hospital_id');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');
    const search = searchParams.get('search');
    const offset = (page - 1) * limit;

    const dateFilter = (col) => {
      const w = {};
      if (fromDate) w[Op.gte] = new Date(fromDate + 'T00:00:00.000Z');
      if (toDate) w[Op.lte] = new Date(toDate + 'T23:59:59.999Z');
      return Object.keys(w).length ? { [col]: w } : {};
    };

    // Provider-admin actors (subscriptions / payments are provider actions).
    const providerAdmins = await ProviderAdmin.findAll({ attributes: ['id', 'name', 'role'] });
    const adminMap = Object.fromEntries(providerAdmins.map(a => [a.id, a]));
    const providerActor = (id) => {
      const a = id ? adminMap[id] : null;
      return a ? actor(a.name, a.role, a.id) : actor('System', 'system');
    };

    async function userActorMap(ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (!unique.length) return {};
      const users = await User.findAll({
        where: { id: { [Op.in]: unique } },
        attributes: ['id', 'name', 'role'],
      });
      return Object.fromEntries(users.map(u => [u.id, u]));
    }

    const logs = [];

    // 1. Hospital registrations
    if (type === 'all' || type === 'hospital') {
      const where = { ...dateFilter('createdAt') };
      if (hospitalId && hospitalId !== 'ALL') where.id = hospitalId;
      const hosps = await Hospital.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit: SOURCE_LIMIT,
      });
      for (const h of hosps) {
        logs.push({
          id: `hosp-${h.id}`,
          type: 'hospital',
          subtype: 'hospital_created',
          hospital: { id: h.id, name: h.name },
          user: actor('System', 'system'),
          description: `Hospital "${h.name}" onboarded into system`,
          time: h.createdAt,
        });
      }
    }

    // 2. Subscriptions
    if (type === 'all' || type === 'subscription') {
      const where = { ...dateFilter('createdAt') };
      if (hospitalId && hospitalId !== 'ALL') where.hospital_id = hospitalId;
      const subs = await Subscription.findAll({
        where,
        include: [{ model: Hospital, attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
        limit: SOURCE_LIMIT,
      });
      for (const s of subs) {
        logs.push({
          id: `sub-${s.id}`,
          type: 'subscription',
          subtype: 'subscription_created',
          hospital: { id: s.hospital_id, name: s.Hospital?.name || `Hospital #${s.hospital_id}` },
          user: providerActor(s.created_by),
          description: `Subscription activated: ${s.plan?.replace('_', ' ')} until ${s.ends_at}`,
          time: s.createdAt,
        });
      }
    }

    // 3. Payments
    if (type === 'all' || type === 'payment') {
      const where = { ...dateFilter('createdAt') };
      if (hospitalId && hospitalId !== 'ALL') where.hospital_id = hospitalId;
      const payments = await Payment.findAll({
        where,
        include: [{ model: Hospital, attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
        limit: SOURCE_LIMIT,
      });
      for (const p of payments) {
        logs.push({
          id: `pay-${p.id}`,
          type: 'payment',
          subtype: 'payment_received',
          hospital: { id: p.hospital_id, name: p.Hospital?.name || `Hospital #${p.hospital_id}` },
          user: providerActor(p.recorded_by),
          description: `Payment recorded: ₹${Number(p.amount).toLocaleString('en-IN')} via ${p.method || 'UPI'}`,
          time: p.createdAt || p.payment_date,
        });
      }
    }

    // 4. Patient registrations
    if (type === 'all' || type === 'registration') {
      const where = { ...dateFilter('createdAt') };
      if (hospitalId && hospitalId !== 'ALL') where.hospital_id = hospitalId;
      const patients = await Patient.findAll({
        where,
        include: [{ model: Hospital, attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
        limit: SOURCE_LIMIT,
      });
      const userMap = await userActorMap(patients.map(p => p.registered_by));
      for (const pt of patients) {
        const u = pt.registered_by ? userMap[pt.registered_by] : null;
        logs.push({
          id: `pat-${pt.id}`,
          type: 'registration',
          subtype: pt.patient_type === 'immunization' ? 'child_registered' : 'mother_registered',
          hospital: { id: pt.hospital_id, name: pt.Hospital?.name || `Hospital #${pt.hospital_id}` },
          user: u ? actor(u.name, u.role, u.id) : actor('System', 'system'),
          description: `Patient "${pt.name}" registered for ${pt.patient_type === 'immunization' ? 'immunization tracking' : 'antenatal care'}`,
          time: pt.createdAt,
        });
      }
    }

    // 5. Patient Visits & Stage progression
    if (type === 'all' || type === 'stage') {
      const where = {
        status: { [Op.in]: ['visited', 'skipped'] },
        ...dateFilter('updatedAt'),
      };
      const patientWhere = hospitalId && hospitalId !== 'ALL' ? { hospital_id: hospitalId } : {};

      const stages = await PatientStage.findAll({
        where,
        include: [
          {
            model: Patient,
            where: patientWhere,
            include: [{ model: Hospital, attributes: ['id', 'name'] }],
            attributes: ['id', 'name', 'hospital_id'],
          },
          {
            model: StageTemplate,
            as: 'template',
            attributes: ['stage_name'],
          }
        ],
        order: [['updatedAt', 'DESC']],
        limit: SOURCE_LIMIT,
      });
      const userMap = await userActorMap(stages.map(s => s.recorded_by));

      for (const s of stages) {
        const hName = s.Patient?.Hospital?.name || 'Hospital';
        const stName = s.template?.stage_name || 'Care Stage';
        const u = s.recorded_by ? userMap[s.recorded_by] : null;
        logs.push({
          id: `stage-${s.id}`,
          type: 'stage',
          subtype: s.status === 'visited' ? 'stage_visited' : 'stage_skipped',
          hospital: { id: s.Patient?.hospital_id, name: hName },
          user: u ? actor(u.name, u.role, u.id) : actor('System', 'system'),
          description: s.status === 'visited'
            ? `${stName} completed for patient "${s.Patient?.name || '—'}"`
            : `${stName} skipped for patient "${s.Patient?.name || '—'}"`,
          time: s.updatedAt,
        });
      }
    }

    logs.sort((a, b) => new Date(b.time) - new Date(a.time));

    let filteredLogs = logs;
    if (search) {
      const q = search.toLowerCase();
      filteredLogs = logs.filter(l =>
        l.description?.toLowerCase().includes(q) ||
        l.hospital?.name?.toLowerCase().includes(q) ||
        l.user?.name?.toLowerCase().includes(q)
      );
    }

    const total = filteredLogs.length;
    const paged = filteredLogs.slice(offset, offset + limit);

    return NextResponse.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      logs: paged,
      capped: true,
      cap_note: CAP_NOTE,
    });
  } catch (err) {
    console.error('Provider logs error:', err);
    return NextResponse.json({ error: 'Failed to fetch audit activity logs' }, { status: 500 });
  }
}
