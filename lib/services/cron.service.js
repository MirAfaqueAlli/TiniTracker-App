import cron from 'node-cron';
import { Op } from 'sequelize';
import { addDays, format, parseISO } from 'date-fns';
import {
  PatientStage,
  Patient,
  StageTemplate,
  Hospital,
  SystemConfig,
  Notification,
} from '../db/models/index.js';
import { sendWhatsApp } from './whatsapp.service.js';

// Documented fallback used only when a hospital has no timezone configured.
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Return the wall-clock date/time parts for a timezone. */
function getZonedParts(date, timeZone = DEFAULT_TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const map = {};
    for (const p of parts) map[p.type] = p.value;

    // Some ICU builds emit "24" for midnight.
    const hour = map.hour === '24' ? '00' : map.hour;

    return {
      dateStr: `${map.year}-${map.month}-${map.day}`,
      hh: hour,
      mm: map.minute,
    };
  } catch {
    // Invalid timezone: fall back to server local time.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return { dateStr: `${y}-${m}-${d}`, hh, mm };
  }
}

async function hasExistingNotification(patientId, stageId, type) {
  // Only a non-failed delivery suppresses a retry. Failed attempts are allowed
  // to retry, but successful duplicate reminders are always prevented.
  const existing = await Notification.findOne({
    where: {
      patient_id: patientId,
      patient_stage_id: stageId,
      type,
      status: { [Op.in]: ['pending', 'sent', 'delivered', 'read'] },
    },
    attributes: ['id'],
  });
  return Boolean(existing);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sendRemindersForDaysAhead(daysAhead, type, hospitalId, todayStr) {
  const targetDate = format(addDays(parseISO(todayStr), daysAhead), 'yyyy-MM-dd');

  const patientWhere = { status: 'active' };
  if (hospitalId) patientWhere.hospital_id = hospitalId;

  const stages = await PatientStage.findAll({
    where: {
      status: { [Op.in]: ['pending', 'notified'] },
      scheduled_date: targetDate,
    },
    include: [
      { model: StageTemplate, as: 'template' },
      {
        model: Patient,
        where: patientWhere,
        required: true,
        include: [{ model: Hospital, attributes: ['name', 'phone'] }],
      },
    ],
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const stage of stages) {
    const patient = stage.Patient;
    if (!patient) continue;

    if (await hasExistingNotification(patient.id, stage.id, type)) {
      skipped++;
      continue;
    }

    const result = await sendWhatsApp(
      patient.whatsapp_number,
      type,
      {
        patient_name:   patient.name,
        stage_name:     stage.template.stage_name,
        scheduled_date: stage.scheduled_date,
        hospital_name:  patient.Hospital?.name,
        hospital_phone: patient.Hospital?.phone,
      },
      patient.id,
      stage.id,
      patient.hospital_id
    );

    // Only a confirmed gateway success advances the stage.
    if (result.success) {
      await stage.update({ status: 'notified' });
      processed++;
    } else {
      failed++;
    }
  }

  console.log(
    `[CRON] ${type}${hospitalId ? ` (Hospital ${hospitalId})` : ''}: ` +
    `sent ${processed}, skipped ${skipped}, failed ${failed}`
  );
  return processed;
}

async function flagMissed(hospitalId, todayStr) {
  const patientWhere = { status: 'active' };
  if (hospitalId) patientWhere.hospital_id = hospitalId;

  // Catch up ALL overdue stages, not just yesterday's.
  const missed = await PatientStage.findAll({
    where: {
      status: { [Op.in]: ['pending', 'notified'] },
      scheduled_date: { [Op.lt]: todayStr },
    },
    include: [
      { model: StageTemplate, as: 'template' },
      {
        model: Patient,
        where: patientWhere,
        required: true,
        include: [{ model: Hospital, attributes: ['name', 'phone'] }],
      },
    ],
  });

  let flagged = 0;

  for (const stage of missed) {
    const patient = stage.Patient;
    if (!patient) continue;

    await stage.update({ status: 'missed' });

    await sendWhatsApp(
      patient.whatsapp_number,
      'missed',
      {
        patient_name:   patient.name,
        stage_name:     stage.template.stage_name,
        scheduled_date: stage.scheduled_date,
        hospital_phone: patient.Hospital?.phone || '',
        hospital_name:  patient.Hospital?.name,
      },
      patient.id,
      stage.id,
      patient.hospital_id
    );

    flagged++;
  }

  console.log(`[CRON] flagMissed${hospitalId ? ` (Hospital ${hospitalId})` : ''}: ${flagged} stages marked`);
  return flagged;
}

// ── Exports for manual or scheduled trigger ──────────────────────────────────
export const runDailyJob = async (hospitalId = null, { timezone } = {}) => {
  let config = null;
  if (hospitalId) {
    config = await SystemConfig.findOne({ where: { hospital_id: hospitalId } });
  }

  const zone = timezone || config?.timezone || DEFAULT_TIMEZONE;
  const { dateStr: todayStr } = getZonedParts(new Date(), zone);

  console.log(
    `[CRON] Running daily notification job${hospitalId ? ` for hospital ${hospitalId}` : ''} ` +
    `(timezone ${zone}, date ${todayStr})...`
  );

  let r7 = 0, r1 = 0, r0 = 0, mis = 0;

  if (!config || config.reminder_7d_enabled) {
    r7 = await sendRemindersForDaysAhead(7, 'reminder_7d', hospitalId, todayStr);
  }
  if (!config || config.reminder_1d_enabled) {
    r1 = await sendRemindersForDaysAhead(1, 'reminder_1d', hospitalId, todayStr);
  }
  if (!config || config.reminder_today_enabled) {
    r0 = await sendRemindersForDaysAhead(0, 'reminder_today', hospitalId, todayStr);
  }
  if (!config || config.missed_flag_enabled) {
    mis = await flagMissed(hospitalId, todayStr);
  }

  return { reminder_7d: r7, reminder_1d: r1, reminder_today: r0, missed: mis, timezone: zone, date: todayStr };
};

// ── Register dynamic cron check: runs every minute to evaluate hospital schedules ────
export function registerCronJobs() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      const configs = await SystemConfig.findAll({
        where: { batch_auto_run: true },
      });

      for (const cfg of configs) {
        const zone = cfg.timezone || DEFAULT_TIMEZONE;
        const { dateStr, hh, mm } = getZonedParts(now, zone);
        const configuredTime = (cfg.batch_cron_time || '08:00').trim();
        const currentTimeStr = `${hh}:${mm}`;

        if (configuredTime !== currentTimeStr) continue;
        if (cfg.last_batch_run_date === dateStr) continue;

        // Atomic DB claim: only one instance can move the date marker.
        const [affected] = await SystemConfig.update(
          { last_batch_run_date: dateStr, last_batch_run_at: new Date() },
          {
            where: {
              id: cfg.id,
              [Op.or]: [
                { last_batch_run_date: null },
                { last_batch_run_date: { [Op.ne]: dateStr } },
              ],
            },
          }
        );

        if (!affected) continue;

        console.log(`⏰ [CRON MATCH] Running scheduled batch for hospital ${cfg.hospital_id} at ${currentTimeStr} (${zone})`);

        runDailyJob(cfg.hospital_id, { timezone: zone }).catch(async (err) => {
          console.error(`❌ Scheduled batch job failed for hospital ${cfg.hospital_id}:`, err);
          // Allow a retry on the next matching minute after a failed run.
          await SystemConfig.update(
            { last_batch_run_date: null },
            { where: { id: cfg.id } }
          ).catch(() => {});
        });
      }
    } catch (err) {
      console.error('Error in dynamic cron checker:', err.message);
    }
  });

  console.log('✅ Dynamic cron runner registered (timezone-aware, DB-backed last run)');
}
