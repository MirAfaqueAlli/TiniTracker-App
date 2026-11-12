import axios from 'axios';
import { Notification, Hospital, Patient } from '../db/models/index.js';
import { isSafeOutboundUrl } from '../utils/outboundUrl.js';

// ── Phone Number Formatter ────────────────────────────────────────────────────
function formatPhone(number) {
  return number.replace(/[^0-9]/g, '');
}

// ── Message Templates ─────────────────────────────────────────────────────────
const templates = {
  reminder_7d: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Dear ${d.patient_name},\n\nThis is a reminder from *${hosp}*. Your upcoming visit for *${d.stage_name}* is scheduled for *${d.scheduled_date}*.\n\nPlease arrive on time for your appointment.\n\nRegards,\n*${hosp}*`;
  },

  reminder_1d: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Dear ${d.patient_name},\n\nThis is a reminder from *${hosp}*. Your appointment for *${d.stage_name}* is scheduled for tomorrow, *${d.scheduled_date}*.\n\nPlease ensure you arrive on time.\n\nRegards,\n*${hosp}*`;
  },

  reminder_today: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Dear ${d.patient_name},\n\nGood morning from *${hosp}*. Your appointment for *${d.stage_name}* is scheduled for today, *${d.scheduled_date}*.\n\nWe look forward to seeing you at the clinic today.\n\nRegards,\n*${hosp}*`;
  },

  stage_complete: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    const nextInfo = d.next_stage && d.next_stage !== 'Journey complete!'
      ? `\nYour next appointment is *${d.next_stage}* on *${d.next_date}*.`
      : '';
    return `Dear ${d.patient_name},\n\n*${hosp}* has recorded your completed visit for *${d.stage_name}*.${nextInfo}\n\nThank you for visiting us.\n\nRegards,\n*${hosp}*`;
  },

  stage_skipped: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    const nextInfo = d.next_stage && d.next_stage !== 'No upcoming appointments'
      ? `\nYour next appointment is *${d.next_stage}* on *${d.next_date}*.`
      : '';
    return `Dear ${d.patient_name},\n\nYour scheduled appointment for *${d.stage_name}* on *${d.scheduled_date}* at *${hosp}* has been marked as skipped by our medical team.\nReason: ${d.reason}${nextInfo}\n\nPlease contact the clinic if you have any questions.\n\nRegards,\n*${hosp}*`;
  },

  stage_rescheduled: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Dear ${d.patient_name},\n\nYour appointment for *${d.stage_name}* at *${hosp}* has been rescheduled.\nNew Date: *${d.new_date}*\nReason: ${d.reason}\n\nPlease contact us if you need any assistance with this schedule change.\n\nRegards,\n*${hosp}*`;
  },

  missed: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    const phoneInfo = d.hospital_phone ? ` at ${d.hospital_phone}` : '';
    return `Dear ${d.patient_name},\n\nWe noticed that you missed your scheduled appointment for *${d.stage_name}* on ${d.scheduled_date} at *${hosp}*.\n\nPlease contact us${phoneInfo} at your earliest convenience to reschedule your visit.\n\nRegards,\n*${hosp}*`;
  },

  edd_updated: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Dear ${d.patient_name},\n\nYour Expected Due Date (EDD) has been updated in our records at *${hosp}*.\nNew EDD: *${d.new_edd}* (based on ${d.source})\n\nYour upcoming appointment schedule has been adjusted accordingly. Please contact us if you have any questions.\n\nRegards,\n*${hosp}*`;
  },

  delivery_recorded: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    return `Dear ${d.patient_name},\n\nWarm congratulations from *${hosp}* on the birth of *${d.child_name}*.\n\nYour child's first immunization, *${d.first_imm}*, is scheduled for *${d.first_imm_date}*. We will send you a reminder closer to the date.\n\nRegards,\n*${hosp}*`;
  },

  manual: (d) => {
    const hosp = d.hospital_name || 'your hospital';
    if (d.custom_message) {
      return d.custom_message.includes(hosp)
        ? d.custom_message
        : `${d.custom_message}\n\nRegards,\n*${hosp}*`;
    }
    return `Dear ${d.patient_name},\n\nThis is a message from *${hosp}*. Please contact our clinic for further details.\n\nRegards,\n*${hosp}*`;
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
export async function sendWhatsApp(to, templateKey, data = {}, patientId = null, stageId = null, hospitalId = null, overrideCredentials = null, actor = null) {
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

    // SSRF guard — never let a stored/overridden URL reach internal services.
    if (!(await isSafeOutboundUrl(apiUrl))) {
      throw new Error('WhatsApp API URL is not allowed. It must be a public http(s) endpoint.');
    }

    const response = await axios.get(apiUrl, {
      params: {
        apikey: apiKey,
        recipient: formattedPhone,
        text: body,
      },
      timeout: 12000,
      validateStatus: () => true,
      // Do not follow redirects: a redirect could bypass the SSRF check.
      maxRedirects: 0,
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
        sent_by: actor?.id || null,
        sent_by_name: actor?.name || null,
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
    let hospName = 'TiniTraker';
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
        custom_message: `Test message from *${hospName}*. Your WhatsApp integration is connected and functioning properly.`,
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
