import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Hospital } from '@/lib/db/models/index';

// GET /api/hospitals/[id]
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const hospital = await Hospital.findByPk(id);
    if (!hospital) return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
    return NextResponse.json(hospital);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch hospital' }, { status: 500 });
  }
}

// PUT /api/hospitals/[id]
export async function PUT(request, { params }) {
  const { user, errorResponse } = await withAuth(request, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const hospital = await Hospital.findByPk(id);
    if (!hospital) return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
    const { name, address, phone, whatsapp_sender_id, whatsapp_api_url, whatsapp_api_key, whatsapp_api_provider } = await request.json();
    await hospital.update({ name, address, phone, whatsapp_sender_id, whatsapp_api_url, whatsapp_api_key, whatsapp_api_provider });
    return NextResponse.json(hospital);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update hospital' }, { status: 500 });
  }
}
