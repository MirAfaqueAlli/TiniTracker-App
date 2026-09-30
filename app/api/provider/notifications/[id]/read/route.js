import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { ProviderNotification } from '@/lib/db/models/index';

// PATCH /api/provider/notifications/[id]/read — mark single notification as read
export async function PATCH(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const notif = await ProviderNotification.findByPk(id);
    if (!notif) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    notif.is_read = true;
    await notif.save();

    const remainingUnread = await ProviderNotification.count({ where: { is_read: false } });

    return NextResponse.json({
      message: 'Notification marked as read',
      unread_count: remainingUnread,
    });
  } catch (err) {
    console.error('Mark notification read error:', err);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
