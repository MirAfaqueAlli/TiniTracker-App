import { addWeeks, addDays, isBefore, startOfDay } from 'date-fns';
import { StageTemplate, PatientStage } from '../db/models/index.js';

/**
 * Calculate the scheduled date for a stage based on patient data.
 * For pregnancy stages: derives date from EDD (EDD = LMP + 280 days, i.e. week 40).
 * For immunization stages: derives date from child DOB + trigger_value days.
 */
export function calcStageDate(patient, template) {
  if (template.trigger_basis === 'lmp_week') {
    // EDD is week 40. Stage at week W = EDD - (40 - W) weeks
    const weeksFromEdd = template.trigger_value - 40;
    return addWeeks(new Date(patient.edd), weeksFromEdd);
  }
  if (template.trigger_basis === 'child_age_days') {
    return addDays(new Date(patient.child_dob), template.trigger_value);
  }
  return null;
}

/**
 * Generate patient_stages rows for a patient.
 * Automatically skips stages whose scheduled date is in the past (pre-registration).
 */
export async function generateStages(patient, type) {
  const templates = await StageTemplate.findAll({
    where: { type },
    order: [['order_index', 'ASC']]
  });

  const today = startOfDay(new Date());

  const rows = templates.map(t => {
    const scheduledDate = calcStageDate(patient, t);
    const isPast = scheduledDate ? isBefore(scheduledDate, today) : false;

    return {
      patient_id:        patient.id,
      stage_template_id: t.id,
      scheduled_date:    scheduledDate,
      status:            isPast ? 'skipped' : 'pending',
      skip_reason:       isPast ? 'pre_registration' : null
    };
  });

  await PatientStage.bulkCreate(rows);
  return rows;
}

/**
 * Recalculate all pending/notified stages when EDD changes.
 * Skips stages where date_overridden = true or status = visited.
 */
export async function recalculateOnEddChange(patient) {
  const stages = await PatientStage.findAll({
    where: {
      patient_id:      patient.id,
      status:          ['pending', 'notified'],
      date_overridden: false
    },
    include: [{ model: StageTemplate, as: 'template' }]
  });

  const today = startOfDay(new Date());

  for (const stage of stages) {
    const newDate = calcStageDate(patient, stage.template);
    if (!newDate) continue;

    if (isBefore(newDate, today)) {
      await stage.update({
        status:         'skipped',
        skip_reason:    'date_revised',
        scheduled_date: newDate
      });
    } else {
      await stage.update({ scheduled_date: newDate });
    }
  }
}
