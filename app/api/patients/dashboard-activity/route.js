import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { addDays } from 'date-fns';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate } from '@/lib/db/models/index';
import { doctorTypeFilter, doctorStageType } from '@/lib/utils/rbac';

// GET /api/patients/dashboard-activity
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const hospitalId  = user.hospital_id;
    const today       = new Date();
    const todayStr    = today.toISOString().split('T')[0];
    const tomorrow    = addDays(today, 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Patient-level filter (by patient_type)
    const doctorTypes  = doctorTypeFilter(user);
    const patientWhere = { hospital_id: hospitalId };
    if (doctorTypes) patientWhere.patient_type = { [Op.in]: doctorTypes };

    // Stage-level filter (by StageTemplate.type) — prevents immunization stages
    // of 'both'-type patients leaking into a pregnancy doctor's view
    const stageType = doctorStageType(user);
    const templateWhere = stageType ? { type: stageType } : {};

    const recentRegistrations = await Patient.findAll({
      where:      patientWhere,
      order:      [['createdAt', 'DESC']],
      limit:      5,
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
      limit: 5,
    });

    const registrationEvents = recentRegistrations.map((p) => {
      const isMother = user.role === 'doctor_pregnancy' || p.patient_type === 'pregnant';
      return {
        type:        isMother ? 'mother_registered' : 'child_registered',
        description: `New ${isMother ? 'mother' : 'child'} registered`,
        patient:     p.name,
        patientId:   p.id,
        time:        p.createdAt,
      };
    });

    const visitEvents = recentVisits.map((s) => ({
      type:        'stage_visited',
      description: s.template?.stage_name || 'Checkup completed',
      patient:     s.Patient?.name || '—',
      patientId:   s.Patient?.id,
      time:        s.updatedAt,
    }));

    const allActivity = [...registrationEvents, ...visitEvents]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 6);

    // Fetch upcoming appointments — also filtered by template type
    let upcomingStages = await PatientStage.findAll({
      where: {
        status:         { [Op.in]: ['pending', 'notified'] },
        scheduled_date: { [Op.gte]: todayStr },
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
      limit:  5,
    });

    // Fallback: nearest pending stages (still filtered by template type)
    if (upcomingStages.length === 0) {
      upcomingStages = await PatientStage.findAll({
        where: {
          status:         { [Op.in]: ['pending', 'notified'] },
          scheduled_date: { [Op.ne]: null },
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
        limit:  5,
      });
    }

    const appointments = upcomingStages.map((s) => ({
      id:            s.id,
      patientId:     s.Patient?.id,
      patientName:   s.Patient?.name || '—',
      patientType:   s.Patient?.patient_type || 'pregnant',
      stageType:     s.template?.type || null,   // 'pregnancy' | 'immunization' — helps frontend color 'both' patients correctly
      stageName:     s.template?.stage_name || 'Appointment',
      scheduledDate: s.scheduled_date,
      isToday:       s.scheduled_date === todayStr,
      isTomorrow:    s.scheduled_date === tomorrowStr,
    }));

    return NextResponse.json({ recentActivity: allActivity, upcomingAppointments: appointments });
  } catch (err) {
    console.error('Dashboard activity error:', err);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }
}
