import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { AppNotification } from '@/lib/db/models/index';

// GET /api/app-notifications/unread-count
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const count = await AppNotification.count({
      where: { hospital_id: user.hospital_id, is_read: false },
    });
    return NextResponse.json({ count });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to count unread' }, { status: 500 });
  }
}
