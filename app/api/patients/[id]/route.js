import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, Hospital, PatientHistory } from '@/lib/db/models/index';
import { canAccessPatient, isAdmin, isStaff, hasPermission } from '@/lib/utils/rbac';
import { createAppNotif } from '@/lib/services/appNotif.service';

// GET /api/patients/[id]
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const patient = await Patient.findByPk(id, {
      include: [
        { model: PatientStage, as: 'stages', include: [{ model: StageTemplate, as: 'template' }] },
        { model: Hospital }
      ]
    });
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    // Doctors can only access patients of their care type
    if (!canAccessPatient(user, patient.patient_type))
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });
    return NextResponse.json(patient);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch patient' }, { status: 500 });
  }
}

// PATCH /api/patients/[id]  — edit patient details
export async function PATCH(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  // Check patients.edit permission
  if (!(await hasPermission(user, 'patients.edit'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to edit patient records' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const patient = await Patient.findByPk(id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const body = await request.json();

    // Whitelist of editable fields — patient_type and hospital_id are never changed here
    const allowed = ['name', 'whatsapp_number', 'age', 'address', 'notes', 'lmp_date', 'child_name', 'child_gender'];

    // Only allow EDD/source update for pregnant or both patients via this endpoint too
    if (patient.patient_type === 'pregnant' || patient.patient_type === 'both') {
      allowed.push('edd', 'edd_source');
    }

    const updates = {};
    for (const field of allowed) {
      if (body[field] !== undefined) {
        updates[field] = body[field] === '' ? null : body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    await patient.update(updates);

    // Audit log — fire-and-forget
    PatientHistory.create({
      patient_id:        patient.id,
      hospital_id:       patient.hospital_id,
      event_type:        'patient_edited',
      event_data:        { fields_changed: Object.keys(updates) },
      performed_by:      user.id,
      performed_by_role: user.role,
    }).catch(e => console.error('[History] patient_edited log failed:', e.message));

    // In-app notification
    createAppNotif({
      hospital_id:  patient.hospital_id,
      event_type:   'patient_edited',
      title:        `Patient details updated: ${patient.name}`,
      body:         `Updated by ${user.name || 'staff'}: ${Object.keys(updates).join(', ')}`,
      patient_id:   patient.id,
      patient_name: patient.name,
      actor_id:     user.id,
      actor_name:   user.name || null,
      meta:         { fields_changed: Object.keys(updates) },
    });

    // Return updated patient (without stages, for speed)
    const updated = await Patient.findByPk(id);
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH patient error:', err);
    if (err.name === 'SequelizeUniqueConstraintError') {
      return NextResponse.json({ error: 'WhatsApp number already in use by another patient' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update patient' }, { status: 500 });
  }
}
