import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { addDays, format } from 'date-fns';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, Notification, PatientHistory } from '@/lib/db/models/index';
import { doctorTypeFilter, doctorStageType, hasPermission } from '@/lib/utils/rbac';

// GET /api/patients/dashboard-activity
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'patients.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view patient data' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const range       = searchParams.get('range') || '7';
    const hospitalId  = user.hospital_id;
    const today       = new Date();
    const todayStr    = format(today, 'yyyy-MM-dd');
    const tomorrowStr = format(addDays(today, 1), 'yyyy-MM-dd');

    // Forward schedule horizon: today, 7 days (default), 30 days, 1 year or all upcoming
    let scheduledFilter;
    if (range === 'all') {
      scheduledFilter = { [Op.gte]: todayStr };
    } else if (range === 'today') {
      scheduledFilter = todayStr;
    } else {
      const horizonDays = { '7': 7, '30': 30, '365': 365 }[range] ?? 7;
      scheduledFilter = { [Op.between]: [todayStr, format(addDays(today, horizonDays), 'yyyy-MM-dd')] };
    }

    // Patient-level filter (by patient_type)
    const seeAllTypes  = await hasPermission(user, 'patients.view_all_types');
    const doctorTypes  = seeAllTypes ? null : doctorTypeFilter(user);
    const patientWhere = { hospital_id: hospitalId };
    if (doctorTypes) patientWhere.patient_type = { [Op.in]: doctorTypes };

    // Stage-level filter (by StageTemplate.type) — prevents immunization stages
    // of 'both'-type patients leaking into a pregnancy doctor's view
    const stageType = seeAllTypes ? null : doctorStageType(user);
    const templateWhere = stageType ? { type: stageType } : {};

    const recentRegistrations = await Patient.findAll({
      where:      patientWhere,
      order:      [['createdAt', 'DESC']],
      limit:      8,
      attributes: ['id', 'name', 'patient_type', 'createdAt'],
    });

    const recentVisits = await PatientStage.findAll({
      where: { status: { [Op.in]: ['visited'] } },
      include: [
        {
          model: StageTemplate, as: 'template',
          attributes: ['stage_name', 'type'],
          ...(stageType ? { where: templateWhere, required: true } : {}),
        },
        { model: Patient, required: true, where: patientWhere, attributes: ['id', 'name', 'patient_type'] },
      ],
      order: [['updatedAt', 'DESC']],
      limit: 8,
    });

    const missedVisits = await PatientStage.findAll({
      where: { status: { [Op.in]: ['missed', 'skipped'] } },
      include: [
        {
          model: StageTemplate, as: 'template',
          attributes: ['stage_name', 'type'],
          ...(stageType ? { where: templateWhere, required: true } : {}),
        },
        { model: Patient, required: true, where: patientWhere, attributes: ['id', 'name', 'patient_type'] },
      ],
      order: [['updatedAt', 'DESC']],
      limit: 6,
    });

    const reminders = await Notification.findAll({
      where: {
        type:   { [Op.in]: ['reminder_7d', 'reminder_1d', 'reminder_today'] },
        status: { [Op.in]: ['sent', 'delivered', 'read'] },
      },
      include: [
        { model: Patient, required: true, where: patientWhere, attributes: ['id', 'name', 'patient_type'] },
        {
          model: PatientStage,
          required: false,
          attributes: ['id'],
          include: [{
            model: StageTemplate, as: 'template',
            attributes: ['stage_name'],
            ...(stageType ? { where: { type: stageType }, required: true } : {}),
          }],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: 6,
    });

    const registrationEvents = recentRegistrations.map((p) => {
      const isMother = user.role === 'doctor_pregnancy' || p.patient_type === 'pregnant';
      return {
        type:        isMother ? 'mother_registered' : 'child_registered',
        kind:        'Registration',
        lead:        'New registration',
        description: `New ${isMother ? 'mother' : 'child'} registered`,
        patient:     p.name,
        patientId:   p.id,
        time:        p.createdAt,
      };
    });

    const visitEvents = recentVisits.map((s) => ({
      type:        'stage_visited',
      kind:        'Visit',
      lead:        'Visit completed',
      description: s.template?.stage_name || 'Checkup completed',
      patient:     s.Patient?.name || '—',
      patientId:   s.Patient?.id,
      time:        s.updatedAt,
    }));

    const missedEvents = missedVisits.map((s) => ({
      type:        'stage_missed',
      kind:        'Missed',
      lead:        s.status === 'skipped' ? 'Visit skipped' : 'Missed visit',
      description: s.template?.stage_name || 'Scheduled visit',
      patient:     s.Patient?.name || '—',
      patientId:   s.Patient?.id,
      time:        s.updatedAt,
    }));

    const reminderEvents = reminders.map((n) => ({
      type:        'reminder',
      kind:        'Reminder',
      lead:        'Reminder sent',
      description: n.PatientStage?.template?.stage_name || 'Appointment reminder',
      patient:     n.Patient?.name || '—',
      patientId:   n.Patient?.id,
      time:        n.createdAt,
    }));

    const deliveryHistory = stageType === 'immunization'
      ? []
      : await PatientHistory.findAll({
        where: { hospital_id: hospitalId, event_type: 'delivery_recorded' },
        include: [
          { model: Patient, required: true, where: patientWhere, attributes: ['id', 'name', 'patient_type'] },
        ],
        order: [['createdAt', 'DESC']],
        limit: 4,
      });

    const milestoneEvents = deliveryHistory.map((h) => ({
      type:        'delivery_recorded',
      kind:        'Milestone',
      lead:        'Delivery recorded',
      description: h.event_data?.child_name
        ? `Healthy delivery · ${h.event_data.child_name}`
        : 'Healthy delivery recorded',
      patient:     h.Patient?.name || '—',
      patientId:   h.Patient?.id,
      time:        h.createdAt,
    }));

    const allActivity = [...registrationEvents, ...visitEvents, ...missedEvents, ...reminderEvents, ...milestoneEvents]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 10);

    // Fetch scheduled appointments within the selected horizon — filtered by template type
    const upcomingStages = await PatientStage.findAll({
      where: {
        status:         { [Op.in]: ['pending', 'notified'] },
        scheduled_date: scheduledFilter,
      },
      include: [
        {
          model: StageTemplate, as: 'template',
          attributes: ['stage_name', 'type'],
          ...(stageType ? { where: templateWhere, required: true } : {}),
        },
        { model: Patient, required: true, where: patientWhere, attributes: ['id', 'name', 'patient_type'] },
      ],
      order:  [['scheduled_date', 'ASC'], ['id', 'ASC']],
      limit:  500,
    });

    // Keep only each patient's NEXT upcoming stage (nearest by scheduled date)
    const seenPatients = new Set();
    const nextStages = [];
    for (const s of upcomingStages) {
      const patientId = s.Patient?.id;
      if (patientId != null) {
        if (seenPatients.has(patientId)) continue;
        seenPatients.add(patientId);
      }
      nextStages.push(s);
    }

    const appointments = nextStages.map((s) => ({
      id:            s.id,
      patientId:     s.Patient?.id,
      patientName:   s.Patient?.name || '—',
      patientType:   s.Patient?.patient_type || 'pregnant',
      stageType:     s.template?.type || null,   // 'pregnancy' | 'immunization' — helps frontend color 'both' patients correctly
      stageName:     s.template?.stage_name || 'Appointment',
      scheduledDate: s.scheduled_date,
      isToday:       String(s.scheduled_date) === todayStr,
      isTomorrow:    String(s.scheduled_date) === tomorrowStr,
    }));

    return NextResponse.json({ recentActivity: allActivity, upcomingAppointments: appointments });
  } catch (err) {
    console.error('Dashboard activity error:', err);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }
}
