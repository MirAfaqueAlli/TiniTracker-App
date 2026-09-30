import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Notification, Patient } from '@/lib/db/models/index';
import { isAdmin, isStaff } from '@/lib/utils/rbac';

// GET /api/notifications/[id]
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const notification = await Notification.findByPk(id, {
      include: [{ model: Patient, where: { hospital_id: user.hospital_id }, required: true }],
    });
    if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    return NextResponse.json(notification);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch notification' }, { status: 500 });
  }
}

// PATCH /api/notifications/[id]  — manually update status (admin/staff only)
// Body: { status: 'sent' | 'read' | 'failed' }
export async function PATCH(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!isAdmin(user) && !isStaff(user)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const notification = await Notification.findByPk(id, {
      include: [{ model: Patient, where: { hospital_id: user.hospital_id }, required: true }],
    });
    if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

    const body = await request.json();
    const allowed = ['sent', 'read', 'failed', 'pending'];
    if (!body.status || !allowed.includes(body.status)) {
      return NextResponse.json({ error: `Invalid status — must be one of: ${allowed.join(', ')}` }, { status: 400 });
    }

    await notification.update({ status: body.status });
    return NextResponse.json({ message: `Status updated to '${body.status}'`, status: body.status });
  } catch (err) {
    console.error('PATCH notification error:', err);
    return NextResponse.json({ error: 'Failed to update notification status' }, { status: 500 });
  }
}
