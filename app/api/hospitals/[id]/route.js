import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Hospital } from '@/lib/db/models/index';
import { isAdmin, hasPermission } from '@/lib/utils/rbac';
import { toHospitalSummary } from '@/lib/utils/hospital';

// GET /api/hospitals/[id]
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;

    // Owner check — users may only read their own hospital.
    if (String(id) !== String(user.hospital_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const hospital = await Hospital.findByPk(id);
    if (!hospital) return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
    return NextResponse.json(toHospitalSummary(hospital, { includeWhatsappUrl: isAdmin(user) }));
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch hospital' }, { status: 500 });
  }
}

// PUT /api/hospitals/[id]
export async function PUT(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'settings.edit_hospital'))) {
    return NextResponse.json({ error: 'Access denied: settings.edit_hospital required' }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Owner check — an admin can only edit their own hospital.
    if (String(id) !== String(user.hospital_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const hospital = await Hospital.findByPk(id);
    if (!hospital) return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });

    const body = await request.json();
    const allowed = [
      'name', 'address', 'phone',
      'whatsapp_sender_id', 'whatsapp_api_url', 'whatsapp_api_key', 'whatsapp_api_provider',
    ];
    const updates = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    await hospital.update(updates);
    return NextResponse.json(toHospitalSummary(hospital, { includeWhatsappUrl: true }));
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update hospital' }, { status: 500 });
  }
}
