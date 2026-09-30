import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Announcement } from '@/lib/db/models/index';

// DELETE /api/provider/announcements/[id]
export async function DELETE(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const announcement = await Announcement.findByPk(id);
    if (!announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    await announcement.destroy();
    return NextResponse.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/provider/announcements/[id] — toggle pin or update
export async function PATCH(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const announcement = await Announcement.findByPk(id);
    if (!announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    const body = await request.json();
    const allowed = ['is_pinned', 'title', 'message', 'priority'];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        announcement[key] = body[key];
      }
    }

    await announcement.save();
    return NextResponse.json({ message: 'Announcement updated successfully', announcement });
  } catch (error) {
    console.error('Error updating announcement:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
