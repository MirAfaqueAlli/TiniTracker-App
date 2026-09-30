import { AppNotification } from '@/lib/db/models/index';

/**
 * Fire-and-forget in-app notification.
 * Errors are caught silently so they never block the main request.
 */
export async function createAppNotif(opts) {
  try {
    await AppNotification.create({
      hospital_id:  opts.hospital_id,
      event_type:   opts.event_type,
      title:        opts.title,
      body:         opts.body         || null,
      patient_id:   opts.patient_id   || null,
      patient_name: opts.patient_name || null,
      actor_id:     opts.actor_id     || null,
      actor_name:   opts.actor_name   || null,
      is_read:      false,
      meta:         opts.meta         || null,
    });
  } catch (err) {
    console.error('[AppNotif] Failed to create in-app notification:', err.message);
  }
}
