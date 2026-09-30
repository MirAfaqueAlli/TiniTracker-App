import { NextResponse } from 'next/server';
import { Op, literal } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { Notification, Patient, PatientStage, StageTemplate } from '@/lib/db/models/index';
import { doctorTypeFilter, doctorStageType, hasPermission } from '@/lib/utils/rbac';

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
    const page   = parseInt(searchParams.get('page')  || '1');
    const limit  = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (type)   where.type   = type;

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
      where[Op.and] = [
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
      where[Op.and] = [
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

    const { count, rows } = await Notification.findAndCountAll({
      where,
      include: [
        { model: Patient, attributes: ['id', 'name', 'whatsapp_number', 'hospital_id', 'patient_type'], where: patientWhere, required: true },
        { model: PatientStage, attributes: ['id', 'scheduled_date', 'status'], include: [{ model: StageTemplate, as: 'template', attributes: ['stage_name', 'type'] }], required: false }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    // Stat counts scoped to the current doctor's purview
    const statWhere = doctorStage ? where : {};
    const totalSent = await Notification.count({
      where: statWhere,
      include: [{ model: Patient, attributes: [], where: patientWhere, required: true }]
    });
    const failedCount = await Notification.count({
      where: { ...statWhere, status: 'failed' },
      include: [{ model: Patient, attributes: [], where: patientWhere, required: true }]
    });
    const todayStr = new Date().toISOString().split('T')[0];
    const scheduledToday = await PatientStage.count({
      where: { scheduled_date: todayStr, status: { [Op.in]: ['pending', 'notified'] } },
      include: [
        { model: Patient, attributes: [], where: patientWhere, required: true },
        ...(doctorStage ? [{ model: StageTemplate, as: 'template', attributes: [], where: { type: doctorStage }, required: true }] : [])
      ]
    });

    return NextResponse.json({
      total: count, page, limit, pages: Math.ceil(count / limit) || 1,
      notifications: rows,
      stats: { totalSent, scheduledToday, failedCount }
    });
  } catch (err) {
    console.error('List notifications error:', err);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}
