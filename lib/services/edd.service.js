import { addDays, format, isValid, parseISO } from 'date-fns';
import { PatientHistory } from '../db/models/index.js';
import { recalculateOnEddChange } from './stage.service.js';
import { sendWhatsApp } from './whatsapp.service.js';
import { createAppNotif } from './appNotif.service.js';

/** Validate a strict YYYY-MM-DD date-only string. */
export function isValidDateOnly(value) {
  if (!value || typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
}

/** Add days to a YYYY-MM-DD date and return a YYYY-MM-DD string. */
export function addDaysToDateOnly(value, days) {
  return format(addDays(parseISO(value), days), 'yyyy-MM-dd');
}

const VALID_EDD_SOURCES = new Set(['lmp_calculated', 'direct_entry', 'ultrasound']);

function validateProvidedDates({ edd, lmp_date, ultrasound_scan_date }) {
  if (edd !== undefined && edd !== null && edd !== '' && !isValidDateOnly(edd)) {
    const err = new Error('edd must be a valid YYYY-MM-DD date');
    err.status = 400;
    throw err;
  }
  if (lmp_date !== undefined && lmp_date !== null && lmp_date !== '' && !isValidDateOnly(lmp_date)) {
    const err = new Error('lmp_date must be a valid YYYY-MM-DD date');
    err.status = 400;
    throw err;
  }
  if (
    ultrasound_scan_date !== undefined &&
    ultrasound_scan_date !== null &&
    ultrasound_scan_date !== '' &&
    !isValidDateOnly(ultrasound_scan_date)
  ) {
    const err = new Error('ultrasound_scan_date must be a valid YYYY-MM-DD date');
    err.status = 400;
    throw err;
  }
}

/**
 * Single authoritative path for changing EDD/LMP.
 * Updates the patient, recalculates future stages, sends the patient message,
 * and writes an auditable PatientHistory entry with old/new values + reason.
 *
 * The caller is responsible for tenancy/type/permission checks.
 */
export async function applyEddUpdate({
  patient,
  user,
  edd,
  edd_source,
  lmp_date,
  ultrasound_scan_date,
  reason,
}) {
  const hasEdd  = edd !== undefined && edd !== null && edd !== '';
  const hasLmp  = lmp_date !== undefined && lmp_date !== null && lmp_date !== '';
  const hasScan = ultrasound_scan_date !== undefined && ultrasound_scan_date !== null && ultrasound_scan_date !== '';
  const hasSource = edd_source !== undefined && edd_source !== null && edd_source !== '';

  if (!hasEdd && !hasLmp && !hasScan && !hasSource) return null;

  validateProvidedDates({ edd, lmp_date, ultrasound_scan_date });
  if (hasSource && !VALID_EDD_SOURCES.has(edd_source)) {
    const err = new Error('edd_source must be lmp_calculated, direct_entry, or ultrasound');
    err.status = 400;
    throw err;
  }

  const previousEdd = patient.edd || null;
  const previousLmp = patient.lmp_date || null;
  const source      = hasSource ? edd_source : (patient.edd_source || 'direct_entry');
  const nextLmp     = hasLmp ? lmp_date : patient.lmp_date;

  let finalEdd = hasEdd ? edd : patient.edd;

  // LMP is the source of truth for lmp_calculated pregnancies.
  if (source === 'lmp_calculated' && nextLmp && (hasLmp || !hasEdd)) {
    finalEdd = addDaysToDateOnly(nextLmp, 280);
  }

  if (!finalEdd) {
    const err = new Error('EDD or LMP date is required to update the timeline');
    err.status = 400;
    throw err;
  }

  await patient.update({
    edd:                  finalEdd,
    edd_source:           source,
    lmp_date:             nextLmp || null,
    ultrasound_scan_date: hasScan ? ultrasound_scan_date : patient.ultrasound_scan_date,
    edd_last_updated:     new Date(),
  });

  await recalculateOnEddChange(patient);

  const auditReason = reason && String(reason).trim() ? String(reason).trim() : 'not_specified';

  try {
    await sendWhatsApp(patient.whatsapp_number, 'edd_updated', {
      patient_name:  patient.name,
      new_edd:       finalEdd,
      source:        source,
      hospital_name: patient.Hospital?.name,
    }, patient.id, null, patient.hospital_id);
  } catch (waErr) {
    console.error('[EDD] WhatsApp notify failed:', waErr.message);
  }

  await PatientHistory.create({
    patient_id:        patient.id,
    hospital_id:       patient.hospital_id,
    event_type:        'edd_updated',
    event_data: {
      old_edd: previousEdd,
      new_edd: finalEdd,
      old_lmp: previousLmp,
      new_lmp: patient.lmp_date,
      source,
      reason: auditReason,
    },
    performed_by:      user.id,
    performed_by_role: user.role,
  });

  createAppNotif({
    hospital_id:  patient.hospital_id,
    event_type:   'edd_updated',
    title:        `EDD updated: ${patient.name}`,
    body:         `Expected delivery date updated to ${finalEdd} by ${user.name || 'staff'} (reason: ${auditReason})`,
    patient_id:   patient.id,
    patient_name: patient.name,
    actor_id:     user.id,
    actor_name:   user.name || null,
    meta:         { old_edd: previousEdd, new_edd: finalEdd, source, reason: auditReason },
  });

  return {
    previous_edd: previousEdd,
    edd:          finalEdd,
    lmp_date:     patient.lmp_date,
    source,
    reason:       auditReason,
  };
}
