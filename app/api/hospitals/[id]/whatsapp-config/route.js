import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Hospital } from '@/lib/db/models/index';
import { hasPermission } from '@/lib/utils/rbac';

// GET /api/hospitals/[id]/whatsapp-config
// Real WhatsApp credentials are ONLY returned to the hospital's authorized managers.
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'settings.edit_hospital'))) {
    return NextResponse.json({ error: 'Access denied: settings.edit_hospital required' }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (String(id) !== String(user.hospital_id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const hospital = await Hospital.findByPk(id, {
      attributes: [
        'id', 'whatsapp_sender_id', 'whatsapp_api_url',
        'whatsapp_api_key', 'whatsapp_api_provider',
      ],
    });
    if (!hospital) return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });

    return NextResponse.json({
      hospital_id:           hospital.id,
      whatsapp_sender_id:    hospital.whatsapp_sender_id    || '',
      whatsapp_api_url:      hospital.whatsapp_api_url      || '',
      whatsapp_api_key:      hospital.whatsapp_api_key      || '',
      whatsapp_api_provider: hospital.whatsapp_api_provider || '',
    });
  } catch (err) {
    console.error('Fetch WhatsApp config error:', err);
    return NextResponse.json({ error: 'Failed to fetch WhatsApp configuration' }, { status: 500 });
  }
}
