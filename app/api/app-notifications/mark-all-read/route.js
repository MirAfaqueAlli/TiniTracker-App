import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { AppNotification } from '@/lib/db/models/index';

// PATCH /api/app-notifications/mark-all-read
export async function PATCH(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    await AppNotification.update(
      { is_read: true },
      { where: { hospital_id: user.hospital_id, is_read: false } }
    );
    return NextResponse.json({ message: 'All marked as read' });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
