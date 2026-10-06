import cron from 'node-cron';
import { Op } from 'sequelize';
import { addDays, subDays, startOfDay, endOfDay, format } from 'date-fns';
import { PatientStage, Patient, StageTemplate, Hospital, SystemConfig } from '../db/models/index.js';
import { sendWhatsApp } from './whatsapp.service.js';

// Track last run date per hospital to prevent multiple runs in the same minute
const lastRunDateByHospital = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sendRemindersForDaysAhead(daysAhead, type, hospitalId = null) {
  const targetDate = addDays(startOfDay(new Date()), daysAhead);

  const patientWhere = hospitalId ? { hospital_id: hospitalId } : {};

  const stages = await PatientStage.findAll({
    where: {
      status:         { [Op.in]: ['pending', 'notified'] },
      scheduled_date: {
        [Op.between]: [startOfDay(targetDate), endOfDay(targetDate)]
      }
    },
    include: [
      { model: StageTemplate, as: 'template' },
      {
        model: Patient,
        where: patientWhere,
        required: true,
        include: [{ model: Hospital, attributes: ['name', 'phone'] }]
      }
    ]
  });

  for (const stage of stages) {
    const patient = stage.Patient;
    if (!patient) continue;

    await sendWhatsApp(
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

    await stage.update({ status: 'notified' });
  }

  console.log(`[CRON] ${type}${hospitalId ? ` (Hospital ${hospitalId})` : ''}: processed ${stages.length} stages`);
  return stages.length;
}

async function flagMissed(hospitalId = null) {
  const yesterday = subDays(startOfDay(new Date()), 1);
  const patientWhere = hospitalId ? { hospital_id: hospitalId } : {};

  const missed = await PatientStage.findAll({
    where: {
      status:         { [Op.in]: ['pending', 'notified'] },
      scheduled_date: {
        [Op.between]: [startOfDay(yesterday), endOfDay(yesterday)]
      }
    },
    include: [
      { model: StageTemplate, as: 'template' },
      { model: Patient, where: patientWhere, required: true, include: [{ model: Hospital, attributes: ['name', 'phone'] }] }
    ]
  });

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
  }

  console.log(`[CRON] flagMissed${hospitalId ? ` (Hospital ${hospitalId})` : ''}: ${missed.length} stages marked`);
  return missed.length;
}

// ── Exports for manual or scheduled trigger ──────────────────────────────────
export const runDailyJob = async (hospitalId = null) => {
  console.log(`[CRON] Running daily notification job${hospitalId ? ` for hospital ${hospitalId}` : ''}...`);

  let config = null;
  if (hospitalId) {
    config = await SystemConfig.findOne({ where: { hospital_id: hospitalId } });
  }

  let r7 = 0, r1 = 0, r0 = 0, mis = 0;

  // 7-day reminder
  if (!config || config.reminder_7d_enabled) {
    r7 = await sendRemindersForDaysAhead(7, 'reminder_7d', hospitalId);
  }

  // 1-day reminder
  if (!config || config.reminder_1d_enabled) {
    r1 = await sendRemindersForDaysAhead(1, 'reminder_1d', hospitalId);
  }

  // Same-day reminder
  if (!config || config.reminder_today_enabled) {
    r0 = await sendRemindersForDaysAhead(0, 'reminder_today', hospitalId);
  }

  // Flag missed stages
  if (!config || config.missed_flag_enabled) {
    mis = await flagMissed(hospitalId);
  }

  return { reminder_7d: r7, reminder_1d: r1, reminder_today: r0, missed: mis };
};

// ── Register dynamic cron check: runs every minute to evaluate hospital schedules ────
export function registerCronJobs() {
  // Check every minute if any hospital has scheduled its batch run at current time
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const currentHH = String(now.getHours()).padStart(2, '0');
      const currentMM = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHH}:${currentMM}`;
      const todayStr = format(now, 'yyyy-MM-dd');

      // Fetch all system configs with auto_run enabled
      const configs = await SystemConfig.findAll({
        where: { batch_auto_run: true }
      });

      for (const cfg of configs) {
        const configuredTime = (cfg.batch_cron_time || '08:00').trim();
        const lastRunKey = `${cfg.hospital_id}:${todayStr}`;

        if (configuredTime === currentTimeStr && lastRunDateByHospital.get(cfg.hospital_id) !== todayStr) {
          console.log(`⏰ [CRON MATCH] Running scheduled batch for hospital ${cfg.hospital_id} at ${currentTimeStr}`);
          lastRunDateByHospital.set(cfg.hospital_id, todayStr);

          runDailyJob(cfg.hospital_id).catch(err => {
            console.error(`❌ Scheduled batch job failed for hospital ${cfg.hospital_id}:`, err);
          });
        }
      }
    } catch (err) {
      console.error('Error in dynamic cron checker:', err.message);
    }
  });

  console.log('✅ Dynamic cron runner registered (evaluates hospital batch times every minute)');
}
