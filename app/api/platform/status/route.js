import { NextResponse } from 'next/server';
import { getPlatformSettings } from '@/lib/services/platformSettings.service';

// GET /api/platform/status — public, safe platform status for tenant UIs.
export async function GET() {
  try {
    const settings = await getPlatformSettings();
    return NextResponse.json({
      platform_name: settings.platform_name,
      maintenance_mode: Boolean(settings.maintenance_mode),
      maintenance_notice: settings.maintenance_notice || '',
      allow_hospital_registration: Boolean(settings.allow_hospital_registration),
    });
  } catch (err) {
    console.error('Platform status error:', err);
    return NextResponse.json({ error: 'Failed to load platform status' }, { status: 500 });
  }
}
