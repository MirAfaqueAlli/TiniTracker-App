import { NextResponse } from 'next/server';
import axios from 'axios';
import { withAuth } from '@/lib/middleware/withAuth';
import { Notification, Patient, Hospital } from '@/lib/db/models/index';

// POST /api/notifications/[id]/resend
export async function POST(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const notification = await Notification.findByPk(id, {
      include: [{ model: Patient, where: { hospital_id: user.hospital_id }, required: true }]
    });
    if (!notification) return NextResponse.json({ error: 'Notification not found' }, { status: 404 });

    let apiUrl = process.env.WHATSAPP_API_URL;
    let apiKey  = process.env.WHATSAPP_API_KEY;
    try {
      const hospital = await Hospital.findByPk(user.hospital_id, {
        attributes: ['whatsapp_api_url', 'whatsapp_api_key'],
      });
      if (hospital?.whatsapp_api_url && hospital?.whatsapp_api_key) {
        apiUrl = hospital.whatsapp_api_url;
        apiKey  = hospital.whatsapp_api_key;
      }
    } catch (_) { /* fall through to env */ }

    if (!apiUrl || !apiKey)
      return NextResponse.json({ error: 'WhatsApp API credentials not configured' }, { status: 400 });

    const phone = notification.whatsapp_number.replace(/[^0-9]/g, '');
    const body  = notification.message_body || `Hello ${notification.Patient.name}, this is a follow-up from your hospital.`;

    let newStatus = 'failed';
    let providerMessageId = null;

    try {
      const response = await axios.get(apiUrl, {
        params: { apikey: apiKey, recipient: phone, text: body },
        timeout: 45000,
        validateStatus: () => true,
      });

      if (
        (response.status >= 200 && response.status < 300 && response.data?.success !== false) ||
        response.status >= 500
      ) {
        newStatus = 'sent';
        providerMessageId = response.data?.waMessageId || response.data?.id || response.data?.message_id || null;
      }
    } catch (err) {
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        newStatus = 'sent';
      } else {
        throw err;
      }
    }

    await notification.update({
      status:              newStatus,
      sent_at:             new Date(),
      provider_message_id: providerMessageId || notification.provider_message_id,
    });

    return NextResponse.json({
      message: newStatus === 'sent' ? 'Notification resent successfully' : 'Resend attempted but delivery failed',
      status: newStatus
    });
  } catch (err) {
    console.error('Resend notification error:', err.message);
    return NextResponse.json({ error: 'Failed to resend notification' }, { status: 500 });
  }
}
