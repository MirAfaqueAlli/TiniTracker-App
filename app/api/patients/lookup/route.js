import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, PatientHistory } from '@/lib/db/models/index';
import { isAdmin, isStaff } from '@/lib/utils/rbac';

// GET /api/patients/lookup?whatsapp=+91...
// If the number belongs to another hospital, returns transfer_candidate: true
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const whatsapp = searchParams.get('whatsapp')?.trim();
    if (!whatsapp) return NextResponse.json({ error: 'whatsapp query param required' }, { status: 400 });

    const patient = await Patient.findOne({
      where: { whatsapp_number: whatsapp },
      include: [{ model: PatientStage, as: 'stages', include: [{ model: StageTemplate, as: 'template' }] }]
    });

    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    // Patient belongs to the same hospital — return normally
    if (patient.hospital_id === user.hospital_id) {
      return NextResponse.json({ ...patient.toJSON(), transfer_candidate: false });
    }

    // Patient belongs to a DIFFERENT hospital — surface as transfer candidate
    // Only admin/staff can see cross-hospital patient info
    if (!isAdmin(user) && !isStaff(user)) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Return limited info for transfer confirmation — don't expose all clinical data cross-hospital
    return NextResponse.json({
      transfer_candidate: true,
      id:              patient.id,
      name:            patient.name,
      whatsapp_number: patient.whatsapp_number,
      patient_type:    patient.patient_type,
      status:          patient.status,
      current_hospital_id: patient.hospital_id,
    });
  } catch (err) {
    console.error('Lookup error:', err);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
