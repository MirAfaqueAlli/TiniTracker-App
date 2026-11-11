import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { SystemConfig } from '@/lib/db/models/index';
import { hasPermission } from '@/lib/utils/rbac';

// GET /api/settings/system-config — Fetch hospital system & batch configuration
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  const canRead = (await hasPermission(user, 'settings.edit_system')) ||
                  (await hasPermission(user, 'settings.view'));
  if (!canRead) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    let [config] = await SystemConfig.findOrCreate({
      where: { hospital_id: user.hospital_id },
      defaults: {
        hospital_id: user.hospital_id,
        timezone: 'Asia/Kolkata',
        batch_cron_time: '08:00',
        batch_auto_run: true,
        reminder_7d_enabled: true,
        reminder_1d_enabled: true,
        reminder_today_enabled: true,
        missed_flag_enabled: true,
      }
    });

    return NextResponse.json(config);
  } catch (err) {
    console.error('Fetch system config error:', err);
    return NextResponse.json({ error: 'Failed to fetch system config' }, { status: 500 });
  }
}

// PUT /api/settings/system-config — Update hospital system & batch configuration
export async function PUT(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'settings.edit_system'))) {
    return NextResponse.json({ error: 'Access denied: settings.edit_system required' }, { status: 403 });
  }

  try {
    const {
      timezone,
      batch_cron_time,
      batch_auto_run,
      reminder_7d_enabled,
      reminder_1d_enabled,
      reminder_today_enabled,
      missed_flag_enabled,
    } = await request.json();

    let [config] = await SystemConfig.findOrCreate({
      where: { hospital_id: user.hospital_id },
      defaults: {
        hospital_id: user.hospital_id,
        timezone: 'Asia/Kolkata',
        batch_cron_time: '08:00',
        batch_auto_run: true,
        reminder_7d_enabled: true,
        reminder_1d_enabled: true,
        reminder_today_enabled: true,
        missed_flag_enabled: true,
      }
    });

    if (timezone !== undefined) {
      try {
        // Throws for invalid IANA timezone names.
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        config.timezone = timezone;
      } catch {
        return NextResponse.json({ error: 'Invalid timezone. Use an IANA name such as Asia/Kolkata.' }, { status: 400 });
      }
    }

    // Validate batch_cron_time format HH:MM
    if (batch_cron_time) {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(batch_cron_time.trim())) {
        return NextResponse.json({ error: 'Invalid time format. Please provide time as HH:MM (e.g. 08:30)' }, { status: 400 });
      }
      config.batch_cron_time = batch_cron_time.trim();
    }

    if (batch_auto_run !== undefined) config.batch_auto_run = Boolean(batch_auto_run);
    if (reminder_7d_enabled !== undefined) config.reminder_7d_enabled = Boolean(reminder_7d_enabled);
    if (reminder_1d_enabled !== undefined) config.reminder_1d_enabled = Boolean(reminder_1d_enabled);
    if (reminder_today_enabled !== undefined) config.reminder_today_enabled = Boolean(reminder_today_enabled);
    if (missed_flag_enabled !== undefined) config.missed_flag_enabled = Boolean(missed_flag_enabled);

    await config.save();

    return NextResponse.json({
      message: 'System configuration updated successfully',
      config
    });
  } catch (err) {
    console.error('Update system config error:', err);
    return NextResponse.json({ error: 'Failed to update system config' }, { status: 500 });
  }
}
