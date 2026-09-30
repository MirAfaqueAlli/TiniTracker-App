import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientHistory } from '@/lib/db/models/index';
import { canAccessPatient } from '@/lib/utils/rbac';

// GET /api/patients/[id]/history
// Returns the full append-only audit log for a patient.
// Accessible by admin, staff, and any doctor who can see this patient type.
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;

    const patient = await Patient.findByPk(id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!canAccessPatient(user, patient.patient_type))
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });

    const history = await PatientHistory.findAll({
      where: { patient_id: id },
      order: [['createdAt', 'DESC']],
    });

    return NextResponse.json({ history });
  } catch (err) {
    console.error('Patient history error:', err);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
