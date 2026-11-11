import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate } from '@/lib/db/models/index';
import { doctorStageType, canAccessPatientAsync, hasPermission } from '@/lib/utils/rbac';

// GET /api/patients/[id]/stages
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'patients.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view patients' }, { status: 403 });
  }

  try {
    const { id } = await params;

    // ── Tenant isolation & patient-type access ────────────────────────────
    const patient = await Patient.findByPk(id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!(await canAccessPatientAsync(user, patient.patient_type)))
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });

    const seeAllTypes = await hasPermission(user, 'patients.view_all_types');
    const stageType = seeAllTypes ? null : doctorStageType(user);
    const templateWhere = stageType ? { type: stageType } : {};

    const stages = await PatientStage.findAll({
      where:   { patient_id: id },
      include: [{
        model: StageTemplate,
        as: 'template',
        ...(stageType ? { where: templateWhere, required: true } : {})
      }],
      order:   [['template', 'order_index', 'ASC']]
    });
    return NextResponse.json(stages);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch stages' }, { status: 500 });
  }
}
