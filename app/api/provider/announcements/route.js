import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { sequelize, Announcement, Hospital, AppNotification } from '@/lib/db/models/index';

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

    if (!['info', 'warning', 'urgent'].includes(priority)) {
      return NextResponse.json({ error: 'priority must be info, warning, or urgent' }, { status: 400 });
    }
    if (!['all', 'hospital'].includes(target_type)) {
      return NextResponse.json({ error: 'target_type must be all or hospital' }, { status: 400 });
    }
    if (target_type === 'hospital' && !target_hospital_id) {
      return NextResponse.json({ error: 'Target hospital must be selected for single-hospital announcements' }, { status: 400 });
    }

    // Validate the target before opening a transaction.
    if (target_type === 'hospital') {
      const targetHospital = await Hospital.findByPk(target_hospital_id);
      if (!targetHospital) {
        return NextResponse.json({ error: 'Target hospital not found' }, { status: 404 });
      }
    }

    const prefix = priority === 'urgent' ? '🚨 [URGENT] ' : priority === 'warning' ? '⚠️ [NOTICE] ' : '📢 ';
    const notifTitle = `${prefix}${title.trim()}`;

    // Announcement and all delivery records are created atomically. If the feed
    // dispatch fails, the announcement is rolled back rather than left orphaned.
    const { announcement, deliveredCount } = await sequelize.transaction(async (t) => {
      const created = await Announcement.create({
        title: title.trim(),
        message: message.trim(),
        priority,
        target_type,
        target_hospital_id: target_type === 'hospital' ? target_hospital_id : null,
        sender_name: admin.name || 'TiniTraker Superadmin',
        is_pinned: Boolean(is_pinned),
      }, { transaction: t });

      const baseNotification = {
        patient_id: null,
        actor_id: admin.id,
        actor_name: admin.name || 'TiniTraker Superadmin',
        event_type: 'platform_announcement',
        title: notifTitle,
        body: message.trim(),
      };

      let count = 0;
      if (target_type === 'all') {
        const activeHospitals = await Hospital.findAll({
          attributes: ['id'],
          where: { is_blocked: false },
          transaction: t,
        });

        const notifRecords = activeHospitals.map((h) => ({
          ...baseNotification,
          hospital_id: h.id,
          meta: {
            announcement_id: created.id,
            priority,
            is_pinned: Boolean(is_pinned),
            broadcast: true,
          },
        }));

        if (notifRecords.length > 0) {
          await AppNotification.bulkCreate(notifRecords, { transaction: t });
          count = notifRecords.length;
        }
      } else {
        await AppNotification.create({
          ...baseNotification,
          hospital_id: target_hospital_id,
          meta: {
            announcement_id: created.id,
            priority,
            is_pinned: Boolean(is_pinned),
            broadcast: false,
          },
        }, { transaction: t });
        count = 1;
      }

      return { announcement: created, deliveredCount: count };
    });

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
