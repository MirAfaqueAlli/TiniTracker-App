import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Hospital, User } from '@/lib/db/models/index';
import { testConnection } from '@/lib/services/whatsapp.service';

// GET /api/hospitals — return own hospital
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const hospital = await Hospital.findByPk(user.hospital_id);
    if (!hospital) return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
    return NextResponse.json(hospital);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch hospital' }, { status: 500 });
  }
}

// NOTE: POST /api/hospitals (create hospital) reserved for provider panel — Phase 4
