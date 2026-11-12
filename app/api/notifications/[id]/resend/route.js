import { NextResponse } from 'next/server';
import axios from 'axios';
import { withAuth } from '@/lib/middleware/withAuth';
import { Notification, Patient, Hospital } from '@/lib/db/models/index';
import { hasPermission } from '@/lib/utils/rbac';
import { isSafeOutboundUrl } from '@/lib/utils/outboundUrl';

// POST /api/notifications/[id]/resend
export async function POST(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'notifications.send_manual'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to resend notifications' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const notification = await Notification.findByPk(id, {
      include: [{ model: Patient, where: { hospital_id: user.hospital_id }, required: true }]
    });
    if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

    let apiUrl = process.env.WHATSAPP_API_URL;
    let apiKey  = process.env.WHATSAPP_API_KEY;
    let hospitalName = null;
    try {
      const hospital = await Hospital.findByPk(user.hospital_id, {
        attributes: ['name', 'whatsapp_api_url', 'whatsapp_api_key'],
      });
      if (hospital?.name) hospitalName = hospital.name;
      if (hospital?.whatsapp_api_url && hospital?.whatsapp_api_key) {
        apiUrl = hospital.whatsapp_api_url;
        apiKey  = hospital.whatsapp_api_key;
      }
    } catch (_) { /* fall through to env */ }

    if (!apiUrl || !apiKey)
      return NextResponse.json({ error: 'WhatsApp API credentials not configured' }, { status: 400 });
    if (!(await isSafeOutboundUrl(apiUrl)))
      return NextResponse.json({ error: 'WhatsApp API URL is not allowed' }, { status: 400 });

    const phone = notification.whatsapp_number.replace(/[^0-9]/g, '');
    const hosp = hospitalName || 'your hospital';
    const body  = notification.message_body || `Dear ${notification.Patient.name},\n\nThis is a follow-up message from *${hosp}*. Please contact us if you require any assistance.\n\nRegards,\n*${hosp}*`;

    let newStatus = 'failed';
    let providerMessageId = null;
    let failureMessage = null;

    try {
      const response = await axios.get(apiUrl, {
        params: { apikey: apiKey, recipient: phone, text: body },
        timeout: 45000,
        validateStatus: () => true,
        maxRedirects: 0,
      });

      // Only an explicit 2xx provider success counts as sent. 5xx responses,
      // timeouts, and network errors are failures — never optimistic.
      const isSuccess =
        response.status >= 200 &&
        response.status < 300 &&
        response.data?.success !== false &&
        !response.data?.error;

      if (isSuccess) {
        newStatus = 'sent';
        providerMessageId = response.data?.waMessageId || response.data?.id || response.data?.message_id || null;
      } else {
        const raw = response.data?.message || response.data?.error || response.data?.msg;
        failureMessage = typeof raw === 'string' ? raw : `Gateway returned status ${response.status}`;
      }
    } catch (err) {
      failureMessage = err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED'
        ? 'WhatsApp gateway timed out'
        : err.message;
    }

    await notification.update({
      status:              newStatus,
      sent_at:             newStatus === 'sent' ? new Date() : notification.sent_at,
      provider_message_id: newStatus === 'sent'
        ? (providerMessageId || notification.provider_message_id)
        : notification.provider_message_id,
      sent_by:             user.id,
      sent_by_name:        user.name || null,
    });

    return NextResponse.json({
      message: newStatus === 'sent' ? 'Notification resent successfully' : 'Resend attempted but delivery failed',
      status: newStatus,
      error: failureMessage,
    });
  } catch (err) {
    console.error('Resend notification error:', err.message);
    return NextResponse.json({ error: 'Failed to resend notification' }, { status: 500 });
  }
}
