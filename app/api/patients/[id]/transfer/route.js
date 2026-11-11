import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientHistory } from '@/lib/db/models/index';
import { hasPermission, canAccessPatientAsync } from '@/lib/utils/rbac';

// Normalize a WhatsApp number to +91XXXXXXXXXX (last 10 digits).
// Returns null when the value does not contain a usable 10-digit number.
function normalizeWhatsapp(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return last10.length === 10 ? `+91${last10}` : null;
}

// POST /api/patients/[id]/transfer
// Body: { confirm: true, whatsapp_number: '+91XXXXXXXXXX' }
// The phone number is a second factor proving the caller knows the patient;
// an ID alone must never be enough to pull a patient across hospitals.
export async function POST(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const { confirm, whatsapp_number } = await request.json();

    if (!confirm) {
      return NextResponse.json({ error: 'Transfer must be explicitly confirmed (confirm: true)' }, { status: 400 });
    }
    if (!whatsapp_number || !String(whatsapp_number).trim()) {
      return NextResponse.json({
        error:   'whatsapp_number_required',
        message: 'The patient\'s WhatsApp number is required to confirm a transfer.',
      }, { status: 400 });
    }

    const patient = await Patient.findByPk(id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    // Prevent transferring a patient already at this hospital
    if (patient.hospital_id === user.hospital_id) {
      return NextResponse.json({ error: 'Patient is already registered at this hospital' }, { status: 409 });
    }

    // Only staff who may edit patients can perform a transfer, and only for
    // patient types their role is allowed to manage.
    if (!(await hasPermission(user, 'patients.edit'))) {
      return NextResponse.json({ error: 'Access denied: you do not have permission to transfer patients' }, { status: 403 });
    }
    if (!(await canAccessPatientAsync(user, patient.patient_type))) {
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });
    }

    // Verify the supplied phone number matches the stored record.
    const providedPhone = normalizeWhatsapp(whatsapp_number);
    const storedPhone   = normalizeWhatsapp(patient.whatsapp_number);
    if (!providedPhone || !storedPhone || providedPhone !== storedPhone) {
      return NextResponse.json({
        error:   'phone_mismatch',
        message: 'The WhatsApp number does not match this patient record. Transfer denied.',
      }, { status: 403 });
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
