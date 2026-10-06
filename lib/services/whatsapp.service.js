import axios from 'axios';
import { Notification, Hospital, Patient } from '../db/models/index.js';

// ── Phone Number Formatter ────────────────────────────────────────────────────
function formatPhone(number) {
  return number.replace(/[^0-9]/g, '');
}

// ── Message Templates ─────────────────────────────────────────────────────────
const templates = {
  reminder_7d: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Hello ${d.patient_name} 👋\nThis is a reminder from *${hosp}*.\nYour next visit for *${d.stage_name}* is scheduled on *${d.scheduled_date}*.\nPlease be on time. We look forward to seeing you!\n\n— *${hosp}* 🏥`;
  },

  reminder_1d: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Hello ${d.patient_name} 👋\nReminder from *${hosp}*: Your appointment for *${d.stage_name}* is *TOMORROW* on *${d.scheduled_date}*.\nPlease arrive on time. See you tomorrow!\n\n— *${hosp}* 💙`;
  },

  reminder_today: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Hello ${d.patient_name} 🌅\nGood morning from *${hosp}*! Your appointment for *${d.stage_name}* is *TODAY* — ${d.scheduled_date}.\nPlease visit us today. We are expecting you!\n\n— *${hosp}* 🏥`;
  },

  stage_complete: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    const nextInfo = d.next_stage && d.next_stage !== 'Journey complete!'
      ? `Your next appointment: *${d.next_stage}* on *${d.next_date}*.\n`
      : '';
    return `Hello ${d.patient_name} ✅\n*${hosp}* has recorded your visit for *${d.stage_name}*.\n${nextInfo}Thank you for visiting!\n\n— *${hosp}* 🏥`;
  },

  stage_skipped: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    const nextInfo = d.next_stage && d.next_stage !== 'No upcoming appointments'
      ? `Your next appointment: *${d.next_stage}* on *${d.next_date}*.\n`
      : '';
    return `Hello ${d.patient_name} ℹ️\nYour appointment for *${d.stage_name}* (scheduled on *${d.scheduled_date}*) at *${hosp}* has been *skipped* by our medical team.\nReason: ${d.reason}\n${nextInfo}Please contact us if you have any questions.\n\n— *${hosp}* 🏥`;
  },

  stage_rescheduled: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Hello ${d.patient_name} 📅\nYour appointment for *${d.stage_name}* at *${hosp}* has been *rescheduled*.\nNew Date: *${d.new_date}*\nReason: ${d.reason}\nWe look forward to seeing you on the new date!\n\n— *${hosp}* 🏥`;
  },

  missed: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    const phoneInfo = d.hospital_phone ? ` at ${d.hospital_phone}` : '';
    return `Hello ${d.patient_name} ⚠️\nWe noticed you missed your appointment for *${d.stage_name}* on ${d.scheduled_date} at *${hosp}*.\nPlease call us${phoneInfo} to reschedule.\nYour health is important to us!\n\n— *${hosp}* 💙`;
  },

  edd_updated: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Hello ${d.patient_name} 📅\nYour Expected Due Date has been updated at *${hosp}*.\nNew EDD: *${d.new_edd}* (based on ${d.source}).\nYour upcoming appointment dates have been adjusted accordingly.\nContact us if you have questions!\n\n— *${hosp}* 🏥`;
  },

  delivery_recorded: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Hello ${d.patient_name} 🎉\nCongratulations on the birth of *${d.child_name}* from all of us at *${hosp}*!\nYour child's first immunization — *${d.first_imm}* — is scheduled on *${d.first_imm_date}*.\nWe'll remind you closer to the date!\n\n— *${hosp}* 💙`;
  },

  manual: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    if (d.custom_message) {
      return d.custom_message.includes(hosp)
        ? d.custom_message
        : `${d.custom_message}\n\n— *${hosp}*`;
    }
    return `Hello ${d.patient_name}, this is a message from *${hosp}*.\n\n— *${hosp}*`;
  },
};

// ── Resolve API credentials and hospital details ──────────────────────────────
// Returns { apiUrl, apiKey, hospitalName, hospitalPhone } from DB first, falls back to .env
async function resolveHospitalInfo(hospitalId) {
  if (hospitalId) {
    try {
      const hospital = await Hospital.findByPk(hospitalId, {
        attributes: ['name', 'phone', 'whatsapp_api_url', 'whatsapp_api_key'],
      });
      if (hospital) {
        return {
          apiUrl: hospital.whatsapp_api_url || process.env.WHATSAPP_API_URL,
          apiKey: hospital.whatsapp_api_key || process.env.WHATSAPP_API_KEY,
          hospitalName: hospital.name || null,
          hospitalPhone: hospital.phone || null,
        };
      }
    } catch (_) { /* fall through to env */ }
  }
  return {
    apiUrl: process.env.WHATSAPP_API_URL,
    apiKey: process.env.WHATSAPP_API_KEY,
    hospitalName: null,
    hospitalPhone: null,
  };
}

// ── Core Send Function ────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Send a WhatsApp message via GET request with query params (Rextrox v2 format):
 *   GET {apiUrl}?apikey={apiKey}&recipient={phone}&text={message}
 */
export async function sendWhatsApp(to, templateKey, data = {}, patientId = null, stageId = null, hospitalId = null, overrideCredentials = null) {
  // If hospitalId is not provided but patientId is, attempt to resolve hospital from patient
  if (!hospitalId && patientId) {
    try {
      const patient = await Patient.findByPk(patientId, { attributes: ['hospital_id'] });
      if (patient?.hospital_id) hospitalId = patient.hospital_id;
    } catch (_) {}
  }

  const hospitalInfo = await resolveHospitalInfo(hospitalId);

  // Guarantee hospital_name and hospital_phone in data if not explicitly provided
  const enrichedData = {
    ...data,
    hospital_name: data?.hospital_name || hospitalInfo.hospitalName || 'your hospital',
    hospital_phone: data?.hospital_phone || hospitalInfo.hospitalPhone || '',
  };

  const body = templates[templateKey]?.(enrichedData) ?? enrichedData.custom_message ?? '';
  const formattedPhone = formatPhone(to);

  let status = 'failed';
  let providerMessageId = null;
  let errorMessage = null;

  const apiUrl = overrideCredentials?.apiUrl || hospitalInfo.apiUrl;
  const apiKey = overrideCredentials?.apiKey || hospitalInfo.apiKey;

  try {
    if (!apiUrl || !apiKey) {
      throw new Error('WhatsApp API credentials not configured. Please set them in Hospital Settings.');
    }

    const response = await axios.get(apiUrl, {
      params: {
        apikey: apiKey,
        recipient: formattedPhone,
        text: body,
      },
      timeout: 12000,
      validateStatus: () => true,
    });

    if (isDev) {
      console.log(`[WhatsApp] ${response.status} → ${formattedPhone} | type: ${templateKey} | res: ${JSON.stringify(response.data)}`);
    }

    // Only 2xx with valid success indicator is considered sent
    const isSuccess = response.status >= 200 && response.status < 300 && response.data?.success !== false && !response.data?.error;

    if (isSuccess) {
      status = 'sent';
      providerMessageId = response.data?.waMessageId
        || response.data?.id
        || response.data?.message_id
        || response.data?.msgId
        || null;
      if (isDev) {
        console.log(`[WhatsApp] ✅ Sent to ${formattedPhone} | type: ${templateKey} | msgId: ${providerMessageId}`);
      }
    } else {
      // Failed response (5xx, 4xx, or explicit success: false)
      let rawMsg = response.data?.message || response.data?.error || response.data?.msg;
      if (typeof rawMsg !== 'string') {
        rawMsg = typeof response.data === 'string' ? response.data : `Gateway returned status ${response.status}`;
      }

      if (rawMsg.includes('detached Frame')) {
        errorMessage = `WhatsApp session disconnected on the gateway. Please re-scan the QR code or reconnect your WhatsApp session on the API provider dashboard.`;
      } else if (rawMsg.includes('Invalid API Key') || rawMsg.includes('Unauthorized')) {
        errorMessage = 'Invalid API Key. Please verify your credentials.';
      } else {
        errorMessage = rawMsg || `Gateway error (${response.status})`;
      }
      console.error(`[WhatsApp] ❌ Failed (${response.status}): ${errorMessage} | type: ${templateKey}`);
    }

  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      errorMessage = 'WhatsApp gateway timed out. The service took too long to respond.';
      console.error(`[WhatsApp] ❌ Timeout error: ${errorMessage}`);
    } else {
      const errMsg = err.code === 'ENOTFOUND'
        ? `DNS Error: Cannot reach '${apiUrl}'`
        : err.code === 'ECONNREFUSED'
          ? `Connection refused at '${apiUrl}'`
          : err.message;
      console.error(`[WhatsApp] ❌ Network error | type: ${templateKey} | ${errMsg}`);
      errorMessage = errMsg;
    }
    // Note: status remains 'failed'
  }

  // Always log to DB if patientId is provided
  if (patientId) {
    try {
      await Notification.create({
        patient_id: patientId,
        patient_stage_id: stageId || null,
        type: templateKey,
        whatsapp_number: to,
        message_body: body,
        status,
        provider_message_id: providerMessageId,
        sent_at: new Date(),
      });
    } catch (dbErr) {
      console.error('[WhatsApp] ❌ Failed to log notification:', dbErr.message);
    }
  }

  return { success: status === 'sent', error: errorMessage, providerMessageId };
}

// ── Test Connection ───────────────────────────────────────────────────────────
export async function testConnection(testNumber, hospitalId = null, overrideCredentials = null) {
  if (isDev) console.log('[WhatsApp] Running connection test...');
  try {
    let hospName = 'TiniTracker';
    if (hospitalId) {
      try {
        const hosp = await Hospital.findByPk(hospitalId, { attributes: ['name'] });
        if (hosp?.name) hospName = hosp.name;
      } catch (_) {}
    }
    const result = await sendWhatsApp(
      testNumber,
      'manual',
      {
        custom_message: `✅ Test message from *${hospName}*. WhatsApp API integration is connected and working!`,
        hospital_name: hospName
      },
      null, null, hospitalId, overrideCredentials
    );
    if (result.success) {
      return { ok: true, error: null, providerMessageId: result.providerMessageId };
    } else {
      return { ok: false, error: result.error || 'Gateway returned failure' };
    }
  } catch (err) {
    return { ok: false, error: err._friendlyMessage || err.message };
  }
}
