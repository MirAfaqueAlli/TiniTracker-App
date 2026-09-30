import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient } from '@/lib/db/models/index';
import { sendWhatsApp } from '@/lib/services/whatsapp.service';

// POST /api/notifications/send-manual
export async function POST(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { patient_id, message } = await request.json();
    if (!patient_id || !message)
      return NextResponse.json({ error: 'patient_id and message required' }, { status: 400 });

    const patient = await Patient.findByPk(patient_id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    await sendWhatsApp(patient.whatsapp_number, 'manual', {
      patient_name:   patient.name,
      custom_message: message
    }, patient.id);

    return NextResponse.json({ message: 'Manual notification sent' });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
