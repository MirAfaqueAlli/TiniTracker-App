import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { ProviderNotification } from '@/lib/db/models/index';

// GET /api/provider/notifications — list provider notifications with unread count
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));
    const unreadOnly = searchParams.get('unread') === 'true';

    const where = {};
    if (unreadOnly) {
      where.is_read = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      ProviderNotification.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
      }),
      ProviderNotification.count({
        where: { is_read: false },
      }),
    ]);

    return NextResponse.json({
      notifications,
      unread_count: unreadCount,
    });
  } catch (err) {
    console.error('Fetch provider notifications error:', err);
    return NextResponse.json({ error: 'Failed to fetch provider notifications' }, { status: 500 });
  }
}
