import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { addDays } from 'date-fns';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate } from '@/lib/db/models/index';
import { doctorTypeFilter, doctorStageType } from '@/lib/utils/rbac';

// GET /api/patients/dashboard-stats
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const hospitalId = user.hospital_id;
    const today      = new Date();
    const in7Days    = addDays(today, 7);

    // Patient-level filter
    const doctorTypes  = doctorTypeFilter(user);
    const patientWhere = { hospital_id: hospitalId };
    if (doctorTypes) patientWhere.patient_type = { [Op.in]: doctorTypes };

    // Stage-level filter — ensures stage counts respect the doctor's phase
    const stageType     = doctorStageType(user);
    const tplWhere      = stageType ? { type: stageType } : null;
    const tplInclude    = tplWhere
      ? [{ model: StageTemplate, as: 'template', required: true, where: tplWhere }]
      : [];

    const activePatientWhere = user.role === 'doctor_pregnancy'
      ? { hospital_id: hospitalId, patient_type: 'pregnant', status: 'active' }
      : { ...patientWhere, status: 'active' };

    const [active, upcoming, missed] = await Promise.all([
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
      })
    ]);

    const dueToday = await PatientStage.findAll({
      where: {
        status:         { [Op.in]: ['pending', 'notified'] },
        scheduled_date: today.toISOString().split('T')[0]
      },
      include: [
        { model: StageTemplate, as: 'template', ...(tplWhere ? { where: tplWhere, required: true } : {}) },
        { model: Patient, required: true, where: patientWhere }
      ],
      limit: 10
    });

    return NextResponse.json({ active, upcoming, missed, dueToday });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
