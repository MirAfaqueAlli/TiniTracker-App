import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { testConnection } from '@/lib/services/whatsapp.service';
import { hasPermission } from '@/lib/utils/rbac';

// POST /api/notifications/test-whatsapp
export async function POST(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'notifications.send_manual'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to send manual messages' }, { status: 403 });
  }

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
