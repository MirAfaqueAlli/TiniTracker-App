import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { ProviderNotification } from '@/lib/db/models/index';

// POST /api/provider/notifications/mark-all-read — mark all notifications as read
export async function POST(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    await ProviderNotification.update(
      { is_read: true },
      { where: { is_read: false } }
    );

    return NextResponse.json({
      message: 'All notifications marked as read',
      unread_count: 0,
    });
  } catch (err) {
    console.error('Mark all notifications read error:', err);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
