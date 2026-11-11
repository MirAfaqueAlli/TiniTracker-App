import { NextResponse } from 'next/server';
import { Op, literal } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { Notification, Patient, PatientStage, StageTemplate } from '@/lib/db/models/index';
import { doctorTypeFilter, doctorStageType, hasPermission } from '@/lib/utils/rbac';
import { parsePagination } from '@/lib/utils/validation';

// GET /api/notifications
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'notifications.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view notifications' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type   = searchParams.get('type');
    const search = searchParams.get('search');
    const { page, limit, offset } = parsePagination(searchParams, 10, 100);

    const baseWhere = {};
    if (type) baseWhere.type = type;

    const patientWhere = { hospital_id: user.hospital_id };
    // Doctors only see notifications for their patient type
    const doctorTypes = doctorTypeFilter(user);
    if (doctorTypes) patientWhere.patient_type = { [Op.in]: doctorTypes };
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      patientWhere[Op.or] = [
        { name:            { [Op.like]: q } },
        { whatsapp_number: { [Op.like]: q } }
      ];
    }

    // Role-based notification stage-type scoping:
    // Pregnancy doctor only sees pregnancy checkup notifications.
    // Immunization doctor only sees immunization checkup notifications.
    const doctorStage = doctorStageType(user);
    if (doctorStage === 'pregnancy') {
      baseWhere[Op.and] = [
        literal(`(
          \`Notification\`.\`patient_stage_id\` IN (
            SELECT ps.id FROM patient_stages ps
            JOIN stage_templates st ON ps.stage_template_id = st.id
            WHERE st.type = 'pregnancy'
          )
          OR (
            \`Notification\`.\`patient_stage_id\` IS NULL
            AND \`Notification\`.\`type\` IN ('edd_updated', 'delivery_recorded', 'manual')
          )
        )`)
      ];
    } else if (doctorStage === 'immunization') {
      baseWhere[Op.and] = [
        literal(`(
          \`Notification\`.\`patient_stage_id\` IN (
            SELECT ps.id FROM patient_stages ps
            JOIN stage_templates st ON ps.stage_template_id = st.id
            WHERE st.type = 'immunization'
          )
          OR (
            \`Notification\`.\`patient_stage_id\` IS NULL
            AND \`Notification\`.\`type\` IN ('delivery_recorded', 'manual')
          )
        )`),
        { type: { [Op.ne]: 'edd_updated' } }
      ];
    }

    const where = { ...baseWhere };
    if (status) where.status = status;

    const patientScope = () => ({ model: Patient, attributes: [], where: patientWhere, required: true });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    cutoff.setHours(0, 0, 0, 0);
    const last7d = { [Op.gte]: cutoff };

    const todayStr = new Date().toISOString().split('T')[0];

    const [
      { count, rows },
      statusRows,
      totalRecords,
      failedCount,
      scheduledToday,
      sent7d,
      delivered7d,
      failed7d,
      awaiting,
      sentOpen,
      queuedOpen,
      patientGroups,
    ] = await Promise.all([
      Notification.findAndCountAll({
        where,
        include: [
          {
            model: Patient,
            attributes: ['id', 'name', 'whatsapp_number', 'hospital_id', 'patient_type', 'age', 'child_name', 'status'],
            where: patientWhere,
            required: true,
          },
          {
            model: PatientStage,
            attributes: ['id', 'scheduled_date', 'status', 'actual_visit_date'],
            include: [{ model: StageTemplate, as: 'template', attributes: ['stage_name', 'type'] }],
            required: false,
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      }),
      Notification.findAll({
        attributes: ['status', [literal('COUNT(*)'), 'count']],
        where: baseWhere,
        include: [patientScope()],
        group: ['Notification.status'],
        raw: true,
      }),
      Notification.count({ where: baseWhere, include: [patientScope()] }),
      Notification.count({ where: { ...baseWhere, status: 'failed' }, include: [patientScope()] }),
      PatientStage.count({
        where: { scheduled_date: todayStr, status: { [Op.in]: ['pending', 'notified'] } },
        include: [
          { model: Patient, attributes: [], where: patientWhere, required: true },
          ...(doctorStage ? [{ model: StageTemplate, as: 'template', attributes: [], where: { type: doctorStage }, required: true }] : []),
        ],
      }),
      Notification.count({
        where: { ...baseWhere, createdAt: last7d, status: { [Op.in]: ['sent', 'delivered', 'read'] } },
        include: [patientScope()],
      }),
      Notification.count({
        where: { ...baseWhere, createdAt: last7d, status: { [Op.in]: ['delivered', 'read'] } },
        include: [patientScope()],
      }),
      Notification.count({ where: { ...baseWhere, createdAt: last7d, status: 'failed' }, include: [patientScope()] }),
      Notification.count({ where: { ...baseWhere, status: { [Op.in]: ['pending', 'sent'] } }, include: [patientScope()] }),
      Notification.count({ where: { ...baseWhere, status: 'sent' }, include: [patientScope()] }),
      Notification.count({ where: { ...baseWhere, status: 'pending' }, include: [patientScope()] }),
      Notification.findAll({
        attributes: ['patient_id'],
        where: { ...baseWhere, createdAt: last7d, status: { [Op.in]: ['sent', 'delivered', 'failed', 'read'] } },
        include: [patientScope()],
        group: ['Notification.patient_id'],
        raw: true,
      }),
    ]);

    const statusCounts = { all: 0, pending: 0, sent: 0, delivered: 0, failed: 0, read: 0 };
    statusRows.forEach((row) => {
      const amount = Number(row.count) || 0;
      if (statusCounts[row.status] !== undefined) statusCounts[row.status] = amount;
      statusCounts.all += amount;
    });

    // "Sent" means the gateway accepted/delivered/read it. Failed/pending are
    // reported separately and must never inflate this metric.
    const totalSent = statusCounts.sent + statusCounts.delivered + statusCounts.read;

    return NextResponse.json({
      total: count,
      page,
      limit,
      pages: Math.ceil(count / limit) || 1,
      notifications: rows,
      statusCounts,
      stats: {
        totalRecords,
        totalSent,
        scheduledToday,
        failedCount,
        sent7d,
        delivered7d,
        failed7d,
        awaiting,
        sentOpen,
        queuedOpen,
        patientCount7d: patientGroups.length,
        totalAll: statusCounts.all,
      },
    });
  } catch (err) {
    console.error('List notifications error:', err);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}
