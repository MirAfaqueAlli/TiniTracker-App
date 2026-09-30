import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Hospital } from '@/lib/db/models/index';

// POST /api/provider/hospitals/[id]/block — suspend or unsuspend a hospital
export async function POST(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const hospital = await Hospital.findByPk(id);
    if (!hospital) {
      return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
    }

    let targetBlocked;
    try {
      const body = await request.json();
      targetBlocked = body.is_blocked !== undefined ? Boolean(body.is_blocked) : !hospital.is_blocked;
    } catch {
      targetBlocked = !hospital.is_blocked;
    }

    await hospital.update({ is_blocked: targetBlocked });

    return NextResponse.json({
      message: targetBlocked
        ? `Hospital "${hospital.name}" has been blocked. All staff logins are now restricted.`
        : `Hospital "${hospital.name}" has been unblocked and restored.`,
      hospital_id: hospital.id,
      is_blocked: targetBlocked,
    });
  } catch (err) {
    console.error('Toggle block error:', err);
    return NextResponse.json({ error: 'Failed to update hospital status' }, { status: 500 });
  }
}
