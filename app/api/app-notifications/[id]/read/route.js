import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { AppNotification } from '@/lib/db/models/index';

// PATCH /api/app-notifications/[id]/read — mark one notification as read
export async function PATCH(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    await AppNotification.update(
      { is_read: true },
      { where: { id, hospital_id: user.hospital_id } }
    );
    return NextResponse.json({ message: 'Marked as read' });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
