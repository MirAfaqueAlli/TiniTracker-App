import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientHistory } from '@/lib/db/models/index';
import { canAccessPatientAsync, hasPermission } from '@/lib/utils/rbac';

const ALLOWED_STATUSES = new Set(['active', 'completed', 'inactive']);

// PATCH /api/patients/[id]/status
// Body: { status: 'active'|'completed'|'inactive', reason?: string }
export async function PATCH(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const body = await request.json();
    const status = body?.status;
    const reason = body?.reason ? String(body.reason).trim() : 'not_specified';

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'status must be active, completed, or inactive' }, { status: 400 });
    }

    const patient = await Patient.findByPk(id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    if (patient.hospital_id !== user.hospital_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (!(await canAccessPatientAsync(user, patient.patient_type))) {
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });
    }

    // Deactivation requires patients.delete; other lifecycle changes need edit.
    const required = status === 'inactive' ? 'patients.delete' : 'patients.edit';
    if (!(await hasPermission(user, required))) {
      return NextResponse.json({
        error: `Access denied: '${required}' permission is required to set status to '${status}'`,
      }, { status: 403 });
    }

    const previousStatus = patient.status;
    if (previousStatus === status) {
      return NextResponse.json({
        message: `Patient is already ${status}`,
        patient_id: patient.id,
        status,
      });
    }

    await patient.update({ status });

    await PatientHistory.create({
      patient_id:        patient.id,
      hospital_id:       patient.hospital_id,
      event_type:        'patient_status_changed',
      event_data: {
        old_status: previousStatus,
        new_status: status,
        reason,
      },
      performed_by:      user.id,
      performed_by_role: user.role,
    });

    return NextResponse.json({
      message: `Patient status updated to ${status}`,
      patient_id: patient.id,
      status,
    });
  } catch (err) {
    console.error('Update patient status error:', err);
    return NextResponse.json({ error: 'Failed to update patient status' }, { status: 500 });
  }
}
