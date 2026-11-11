import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientHistory } from '@/lib/db/models/index';
import { canAccessPatientAsync, hasPermission } from '@/lib/utils/rbac';

// GET /api/patients/[id]/history
// Returns a paginated page of the append-only audit log for a patient.
// Query: ?page=1&limit=20 (limit capped at 100).
// Accessible by admin, staff, and any doctor who can see this patient type.
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'patients.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view patient history' }, { status: 403 });
  }

  try {
    const { id } = await params;

    const patient = await Patient.findByPk(id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!(await canAccessPatientAsync(user, patient.patient_type)))
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const rawPage  = parseInt(searchParams.get('page') || '1', 10);
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const page  = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20;
    const offset = (page - 1) * limit;

    const { count, rows } = await PatientHistory.findAndCountAll({
      where: { patient_id: id },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit,
      offset,
    });

    return NextResponse.json({
      history: rows,
      total:   count,
      page,
      limit,
      pages:   Math.max(1, Math.ceil(count / limit)),
    });
  } catch (err) {
    console.error('Patient history error:', err);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
