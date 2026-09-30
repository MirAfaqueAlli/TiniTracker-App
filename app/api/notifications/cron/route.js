import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { runDailyJob } from '@/lib/services/cron.service';
import { createAppNotif } from '@/lib/services/appNotif.service';
import { hasPermission } from '@/lib/utils/rbac';

// POST /api/notifications/cron  — trigger daily job manually
export async function POST(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'notifications.trigger_batch'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to trigger batch runs' }, { status: 403 });
  }

  try {
    const result = await runDailyJob(user.hospital_id);

    // In-app notification — announce the batch run
    createAppNotif({
      hospital_id: user.hospital_id,
      event_type:  'batch_run',
      title:       'WhatsApp batch run completed',
      body:        `Reminders: ${(result.reminder_7d || 0) + (result.reminder_1d || 0) + (result.reminder_today || 0)} sent. Missed flagged: ${result.missed || 0}. Triggered by ${user.name || 'staff'}.`,
      actor_id:    user.id,
      actor_name:  user.name || null,
      meta:        result,
    });

    return NextResponse.json({ message: 'Cron job triggered successfully', result });
  } catch (err) {
    return NextResponse.json({ error: 'Cron trigger failed', details: err.message }, { status: 500 });
  }
}
