import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { addDays, startOfWeek, format } from 'date-fns';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate } from '@/lib/db/models/index';
import { doctorTypeFilter, doctorStageType, hasPermission } from '@/lib/utils/rbac';

// GET /api/patients/dashboard-stats
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'patients.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view patient data' }, { status: 403 });
  }

  try {
    const hospitalId = user.hospital_id;
    const today      = new Date();
    const todayStr   = format(today, 'yyyy-MM-dd');
    const in7Days    = addDays(today, 7);
    const in7DaysStr = format(in7Days, 'yyyy-MM-dd');

    // Current week — Monday through Sunday
    const weekStart    = startOfWeek(today, { weekStartsOn: 1 });
    const weekEndExcl  = addDays(weekStart, 7);
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr   = format(addDays(weekStart, 6), 'yyyy-MM-dd');

    // Patient-level filter
    const seeAllTypes  = await hasPermission(user, 'patients.view_all_types');
    const doctorTypes  = seeAllTypes ? null : doctorTypeFilter(user);
    const patientWhere = { hospital_id: hospitalId };
    if (doctorTypes) patientWhere.patient_type = { [Op.in]: doctorTypes };

    // Stage-level filter — ensures stage counts respect the doctor's phase
    const stageType     = seeAllTypes ? null : doctorStageType(user);
    const tplWhere      = stageType ? { type: stageType } : null;
    const tplInclude    = tplWhere
      ? [{ model: StageTemplate, as: 'template', required: true, where: tplWhere }]
      : [];

    // Restrict a list of patient types to what the current role may see
    const scopedTypes = (types) => {
      const allowed = doctorTypes ? types.filter(t => doctorTypes.includes(t)) : types;
      return { [Op.in]: allowed.length ? allowed : [] };
    };

    const activePatientWhere = user.role === 'doctor_pregnancy'
      ? { hospital_id: hospitalId, patient_type: 'pregnant', status: 'active' }
      : { ...patientWhere, status: 'active' };

    const [active, upcoming, missed, activeMothers, activeChildren, newThisWeek, clinicTotal, clinicAttended] = await Promise.all([
      Patient.count({ where: activePatientWhere }),
      PatientStage.count({
        where: {
          status:         { [Op.in]: ['pending', 'notified'] },
          scheduled_date: { [Op.between]: [today, in7Days] }
        },
        include: [
          { model: Patient, required: true, where: patientWhere },
          ...tplInclude,
        ]
      }),
      PatientStage.count({
        where: { status: 'missed' },
        include: [
          { model: Patient, required: true, where: patientWhere },
          ...tplInclude,
        ]
      }),
      Patient.count({
        where: {
          hospital_id:  hospitalId,
          status:       'active',
          patient_type: scopedTypes(['pregnant', 'both']),
        }
      }),
      Patient.count({
        where: {
          hospital_id:  hospitalId,
          status:       'active',
          patient_type: scopedTypes(['immunization', 'both']),
        }
      }),
      Patient.count({
        where: {
          ...patientWhere,
          createdAt: { [Op.between]: [weekStart, weekEndExcl] },
        }
      }),
      PatientStage.count({
        where: {
          status:         { [Op.in]: ['pending', 'notified', 'visited'] },
          scheduled_date: todayStr,
        },
        include: [
          { model: Patient, required: true, where: patientWhere },
          ...tplInclude,
        ]
      }),
      PatientStage.count({
        where: { status: 'visited', scheduled_date: todayStr },
        include: [
          { model: Patient, required: true, where: patientWhere },
          ...tplInclude,
        ]
      }),
    ]);

    // Today's clinic demand — every stage scheduled for today
    const clinicStages = await PatientStage.findAll({
      where: {
        status:         { [Op.in]: ['pending', 'notified', 'visited'] },
        scheduled_date: todayStr,
      },
      include: [
        {
          model: StageTemplate,
          as: 'template',
          attributes: ['stage_name', 'type', 'order_index'],
          ...(tplWhere ? { where: tplWhere, required: true } : {}),
        },
        {
          model: Patient,
          required: true,
          where: patientWhere,
          attributes: ['id', 'name', 'patient_type'],
        },
      ],
      order: [['id', 'ASC']],
      limit: 40,
    });

    const clinicToday = clinicStages
      .map((s) => ({
        id:            s.id,
        patientId:     s.Patient?.id,
        name:          s.Patient?.name || '—',
        patientType:   s.Patient?.patient_type || null,
        stageName:     s.template?.stage_name || 'Visit',
        stageType:     s.template?.type || null,
        status:        s.status,
        scheduledDate: s.scheduled_date,
      }))
      .sort((a, b) => {
        const rank = { pending: 0, notified: 1, visited: 2 };
        return (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
      });

    // Forecast: milestones and doses due across the next 7 days
    const forecastEndStr = format(addDays(today, 6), 'yyyy-MM-dd');
    const dueStages = await PatientStage.findAll({
      where: {
        status:         { [Op.in]: ['pending', 'notified'] },
        scheduled_date: { [Op.between]: [todayStr, forecastEndStr] },
      },
      attributes: ['scheduled_date'],
      include: [
        { model: Patient, required: true, where: patientWhere, attributes: [] },
        ...tplInclude,
      ],
    });

    const dueByDay = {};
    dueStages.forEach((s) => {
      const key = String(s.scheduled_date).slice(0, 10);
      dueByDay[key] = (dueByDay[key] || 0) + 1;
    });

    const forecast = Array.from({ length: 7 }).map((_, i) => {
      const day = addDays(today, i);
      const key = format(day, 'yyyy-MM-dd');
      return {
        date:    key,
        label:   format(day, 'EEE'),
        full:    format(day, 'EEEE'),
        count:   dueByDay[key] || 0,
        isToday: key === todayStr,
      };
    });

    const dueToday = await PatientStage.findAll({
      where: {
        status:         { [Op.in]: ['pending', 'notified'] },
        scheduled_date: todayStr,
      },
      include: [
        { model: StageTemplate, as: 'template', ...(tplWhere ? { where: tplWhere, required: true } : {}) },
        { model: Patient, required: true, where: patientWhere }
      ],
      limit: 10
    });

    return NextResponse.json({
      active,
      upcoming,
      missed,
      dueToday,
      activeMothers,
      activeChildren,
      newThisWeek,
      clinicToday,
      clinicStats: {
        total:     clinicTotal,
        attended:  clinicAttended,
        remaining: Math.max(0, clinicTotal - clinicAttended),
      },
      forecast,
      forecastTotal: forecast.reduce((sum, d) => sum + d.count, 0),
      weekStart:     weekStartStr,
      weekEnd:       weekEndStr,
      today:         todayStr,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
