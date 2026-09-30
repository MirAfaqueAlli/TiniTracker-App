import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { AppNotification } from '@/lib/db/models/index';

// ── GET /api/app-notifications — last 40 notifications for the logged-in hospital
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const items = await AppNotification.findAll({
      where:  { hospital_id: user.hospital_id },
      order:  [['createdAt', 'DESC']],
      limit:  40,
    });
    return NextResponse.json({ notifications: items });
  } catch (err) {
    console.error('AppNotif list error:', err);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}
