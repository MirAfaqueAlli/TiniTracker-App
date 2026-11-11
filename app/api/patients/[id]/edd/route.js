import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, Hospital } from '@/lib/db/models/index';
import { applyEddUpdate } from '@/lib/services/edd.service';
import { hasPermission, canAccessPatientAsync } from '@/lib/utils/rbac';

// PUT /api/patients/[id]/edd
export async function PUT(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { edd, edd_source, lmp_date, ultrasound_scan_date, reason } = body || {};

    const { id } = await params;
    const patient = await Patient.findByPk(id, {
      include: [{ model: Hospital, attributes: ['name', 'phone'] }],
    });
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    // ── Tenant isolation, patient-type access & permission ────────────────
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!(await canAccessPatientAsync(user, patient.patient_type)))
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });
    if (!(patient.patient_type === 'pregnant' || patient.patient_type === 'both'))
      return NextResponse.json({ error: 'EDD can only be updated for pregnant patients' }, { status: 400 });

    const canEditEdd = (await hasPermission(user, 'patients.edit'))
      || (await hasPermission(user, 'stages.reschedule'));
    if (!canEditEdd)
      return NextResponse.json({ error: 'Access denied: you do not have permission to update the EDD' }, { status: 403 });

    const result = await applyEddUpdate({
      patient,
      user,
      edd,
      edd_source,
      lmp_date,
      ultrasound_scan_date,
      reason,
    });

    if (!result) {
      return NextResponse.json({ error: 'EDD or LMP date is required' }, { status: 400 });
    }

    return NextResponse.json({
      message: 'EDD updated and stages recalculated',
      ...result,
    });
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Update EDD error:', err);
    return NextResponse.json({ error: 'Failed to update EDD' }, { status: 500 });
  }
}
