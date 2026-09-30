import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientHistory } from '@/lib/db/models/index';

// POST /api/patients/[id]/transfer
// Body: { confirm: true }
// Any authenticated user can transfer a cross-hospital patient to their own hospital
export async function POST(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const { confirm } = await request.json();

    if (!confirm) {
      return NextResponse.json({ error: 'Transfer must be explicitly confirmed (confirm: true)' }, { status: 400 });
    }

    const patient = await Patient.findByPk(id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    // Prevent transferring a patient already at this hospital
    if (patient.hospital_id === user.hospital_id) {
      return NextResponse.json({ error: 'Patient is already registered at this hospital' }, { status: 409 });
    }

    const fromHospitalId = patient.hospital_id;

    // Transfer: update hospital_id on the existing row — same patient_id, all stages intact
    await patient.update({ hospital_id: user.hospital_id });

    // Append-only audit entry in patient_history
    await PatientHistory.create({
      patient_id:        patient.id,
      hospital_id:       user.hospital_id,   // new hospital
      event_type:        'hospital_transferred',
      event_data:        { from_hospital_id: fromHospitalId, to_hospital_id: user.hospital_id },
      performed_by:      user.id,
      performed_by_role: user.role,
    });

    return NextResponse.json({
      message:     'Patient transferred successfully',
      patient_id:  patient.id,
      new_hospital: user.hospital_id,
    });
  } catch (err) {
    console.error('Transfer error:', err);
    return NextResponse.json({ error: 'Transfer failed' }, { status: 500 });
  }
}
