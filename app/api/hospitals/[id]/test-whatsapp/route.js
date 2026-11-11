import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { testConnection } from '@/lib/services/whatsapp.service';
import { hasPermission } from '@/lib/utils/rbac';

// POST /api/hospitals/[id]/test-whatsapp
export async function POST(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'settings.edit_hospital'))) {
    return NextResponse.json({ error: 'Access denied: settings.edit_hospital required' }, { status: 403 });
  }

  try {
    const { test_number } = await request.json();
    if (!test_number) return NextResponse.json({ error: 'test_number is required' }, { status: 400 });

    const { id } = await params;

    // Owner check — test only your own hospital's stored configuration.
    if (String(id) !== String(user.hospital_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Arbitrary URL/key overrides from the request body are intentionally
    // ignored; only the hospital's saved configuration is used.
    const result = await testConnection(test_number, id);
    if (result.ok) {
      return NextResponse.json({ message: 'Test message sent successfully!' });
    } else {
      return NextResponse.json({ error: result.error || 'Test message failed' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Test failed: ' + err.message }, { status: 500 });
  }
}
