import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Announcement, Hospital, AppNotification } from '@/lib/db/models/index';

// GET /api/provider/announcements — list all broadcasts & stats
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const announcements = await Announcement.findAll({
      order: [
        ['is_pinned', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      include: [
        {
          model: Hospital,
          attributes: ['id', 'name', 'address'],
          required: false,
        },
      ],
    });

    const totalBroadcasts = announcements.length;
    const urgentCount = announcements.filter(a => a.priority === 'urgent').length;
    const pinnedCount = announcements.filter(a => a.is_pinned).length;
    const globalCount = announcements.filter(a => a.target_type === 'all').length;

    return NextResponse.json({
      announcements,
      stats: {
        totalBroadcasts,
        urgentCount,
        pinnedCount,
        globalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/provider/announcements — create broadcast & dispatch in-app notifications
export async function POST(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { title, message, priority = 'info', target_type = 'all', target_hospital_id = null, is_pinned = false } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Announcement title is required' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Announcement message is required' }, { status: 400 });
    }

    if (target_type === 'hospital' && !target_hospital_id) {
      return NextResponse.json({ error: 'Target hospital must be selected for single-hospital announcements' }, { status: 400 });
    }

    const announcement = await Announcement.create({
      title: title.trim(),
      message: message.trim(),
      priority,
      target_type,
      target_hospital_id: target_type === 'hospital' ? target_hospital_id : null,
      sender_name: admin.name || 'TiniTracker Superadmin',
      is_pinned: Boolean(is_pinned),
    });

    // Dispatch to AppNotification feed so hospitals see it in their alert bell
    let deliveredCount = 0;
    const prefix = priority === 'urgent' ? '🚨 [URGENT] ' : priority === 'warning' ? '⚠️ [NOTICE] ' : '📢 ';
    const notifTitle = `${prefix}${title.trim()}`;

    if (target_type === 'all') {
      const activeHospitals = await Hospital.findAll({
        attributes: ['id'],
        where: { is_blocked: false },
      });

      const notifRecords = activeHospitals.map(h => ({
        hospital_id: h.id,
        patient_id: null,
        actor_id: admin.id,
        actor_name: admin.name || 'TiniTracker Superadmin',
        event_type: 'platform_announcement',
        title: notifTitle,
        body: message.trim(),
        meta: {
          announcement_id: announcement.id,
          priority,
          is_pinned: Boolean(is_pinned),
          broadcast: true,
        },
      }));

      if (notifRecords.length > 0) {
        await AppNotification.bulkCreate(notifRecords);
        deliveredCount = notifRecords.length;
      }
    } else if (target_type === 'hospital' && target_hospital_id) {
      await AppNotification.create({
        hospital_id: target_hospital_id,
        patient_id: null,
        actor_id: admin.id,
        actor_name: admin.name || 'TiniTracker Superadmin',
        event_type: 'platform_announcement',
        title: notifTitle,
        body: message.trim(),
        meta: {
          announcement_id: announcement.id,
          priority,
          is_pinned: Boolean(is_pinned),
          broadcast: false,
        },
      });
      deliveredCount = 1;
    }

    return NextResponse.json({
      message: 'Announcement broadcast created successfully',
      announcement,
      delivered_count: deliveredCount,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating announcement:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
