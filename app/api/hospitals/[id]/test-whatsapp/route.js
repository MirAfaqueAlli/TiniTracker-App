import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { testConnection } from '@/lib/services/whatsapp.service';

// POST /api/hospitals/[id]/test-whatsapp
export async function POST(request, { params }) {
  const { user, errorResponse } = await withAuth(request, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const { test_number, whatsapp_api_url, whatsapp_api_key } = await request.json();
    if (!test_number) return NextResponse.json({ error: 'test_number is required' }, { status: 400 });

    const overrideCredentials = (whatsapp_api_url && whatsapp_api_key)
      ? { apiUrl: whatsapp_api_url, apiKey: whatsapp_api_key }
      : null;

    const { id } = await params;
    const result = await testConnection(test_number, id, overrideCredentials);
    if (result.ok) {
      return NextResponse.json({ message: 'Test message sent successfully!' });
    } else {
      return NextResponse.json({ error: result.error || 'Test message failed' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Test failed: ' + err.message }, { status: 500 });
  }
}
