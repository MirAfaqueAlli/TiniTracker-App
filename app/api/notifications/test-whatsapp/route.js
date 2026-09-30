import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { testConnection } from '@/lib/services/whatsapp.service';

// POST /api/notifications/test-whatsapp
export async function POST(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { test_number } = await request.json();
    if (!test_number)
      return NextResponse.json({ error: 'test_number is required (e.g. +919876543210)' }, { status: 400 });

    const { ok, error } = await testConnection(test_number, user?.hospital_id);
    if (ok) {
      return NextResponse.json({
        success: true,
        message: "Test message sent successfully! Check the recipient's WhatsApp for the message."
      });
    } else {
      return NextResponse.json({
        success: false,
        error: error || 'Message not sent. Check API URL and credentials.',
        message: error || 'Message not sent. Check API URL and credentials.'
      }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'WhatsApp test failed: ' + err.message }, { status: 500 });
  }
}
