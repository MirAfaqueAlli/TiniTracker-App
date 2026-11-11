import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, Hospital, PatientHistory } from '@/lib/db/models/index';
import { canAccessPatientAsync, hasPermission } from '@/lib/utils/rbac';
import { createAppNotif } from '@/lib/services/appNotif.service';
import { applyEddUpdate, isValidDateOnly } from '@/lib/services/edd.service';
import { normalizeWhatsappNumber } from '@/lib/utils/phone';

// GET /api/patients/[id]
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'patients.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view patients' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const patient = await Patient.findByPk(id, {
      include: [
        { model: PatientStage, as: 'stages', include: [{ model: StageTemplate, as: 'template' }] },
        { model: Hospital, attributes: ['id', 'name', 'phone'] }
      ]
    });
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    // Doctors can only access patient types they are permitted to view.
    if (!(await canAccessPatientAsync(user, patient.patient_type)))
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });
    return NextResponse.json(patient);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch patient' }, { status: 500 });
  }
}

// PATCH /api/patients/[id]  — edit patient details
// EDD/LMP changes are NEVER applied directly here; they are routed through the
// same authoritative service used by PUT /api/patients/[id]/edd so the timeline
// is always recalculated and an EDD audit entry is always written.
export async function PATCH(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'patients.edit'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to edit patient records' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const patient = await Patient.findByPk(id, {
      include: [{ model: Hospital, attributes: ['name', 'phone'] }],
    });
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!(await canAccessPatientAsync(user, patient.patient_type)))
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });

    const body = await request.json();

    // Profile fields only — EDD/LMP are handled by the shared service below.
    const profileFields = ['name', 'whatsapp_number', 'age', 'address', 'notes', 'child_name', 'child_gender'];
    const eddFields = ['edd', 'edd_source', 'lmp_date', 'ultrasound_scan_date'];
    const hasEddChange = eddFields.some((field) => body[field] !== undefined);

    if (hasEddChange && !(patient.patient_type === 'pregnant' || patient.patient_type === 'both')) {
      return NextResponse.json({ error: 'EDD/LMP can only be updated for pregnant patients' }, { status: 400 });
    }

    // Validate dates before applying any profile changes (avoid partial writes).
    for (const field of ['edd', 'lmp_date', 'ultrasound_scan_date']) {
      const value = body[field];
      if (value !== undefined && value !== null && value !== '' && !isValidDateOnly(value)) {
        return NextResponse.json({ error: `${field} must be a valid YYYY-MM-DD date` }, { status: 400 });
      }
    }

    const updates = {};
    for (const field of profileFields) {
      if (body[field] === undefined) continue;

      if (field === 'whatsapp_number') {
        const normalized = normalizeWhatsappNumber(body.whatsapp_number);
        if (!normalized) {
          return NextResponse.json({ error: 'A valid 10-digit WhatsApp number is required' }, { status: 400 });
        }
        updates.whatsapp_number = normalized;
      } else {
        updates[field] = body[field] === '' ? null : body[field];
      }
    }

    if (Object.keys(updates).length === 0 && !hasEddChange) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    if (Object.keys(updates).length > 0) {
      await patient.update(updates);

      await PatientHistory.create({
        patient_id:        patient.id,
        hospital_id:       patient.hospital_id,
        event_type:        'patient_edited',
        event_data:        { fields_changed: Object.keys(updates), reason: body.reason || 'not_specified' },
        performed_by:      user.id,
        performed_by_role: user.role,
      });

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
    }

    // Single EDD update path: recalculates future stages + writes edd_updated history.
    let eddResult = null;
    if (hasEddChange) {
      eddResult = await applyEddUpdate({
        patient,
        user,
        edd:                  body.edd,
        edd_source:           body.edd_source,
        lmp_date:             body.lmp_date,
        ultrasound_scan_date: body.ultrasound_scan_date,
        reason:               body.reason,
      });

      if (!eddResult) {
        return NextResponse.json({ error: 'EDD or LMP date is required' }, { status: 400 });
      }
    }

    const updated = await Patient.findByPk(id);
    return NextResponse.json({
      ...updated.toJSON(),
      ...(eddResult ? { edd_update: eddResult } : {}),
    });
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('PATCH patient error:', err);
    if (err.name === 'SequelizeUniqueConstraintError') {
      return NextResponse.json({ error: 'WhatsApp number already in use by another patient' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update patient' }, { status: 500 });
  }
}
