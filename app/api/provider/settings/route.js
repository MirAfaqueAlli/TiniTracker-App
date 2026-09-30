import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { PlatformSetting } from '@/lib/db/models/index';

// GET /api/provider/settings — get current platform configuration
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    let [settings] = await PlatformSetting.findOrCreate({
      where: { id: 1 },
      defaults: {
        id: 1,
        platform_name: 'TiniTracker Healthcare Platform',
        support_email: 'support@tinitracker.in',
        support_phone: '+91 98765 43210',
        maintenance_mode: false,
        maintenance_notice: 'The platform is undergoing brief routine maintenance. Service will resume shortly.',
        allow_hospital_registration: true,
        default_trial_days: 14,
        starter_plan_price: 2499,
        pro_plan_price: 4999,
        enterprise_plan_price: 9999,
        enable_whatsapp_engine: true,
        enable_sms_fallback: false,
        enable_audit_logging: true,
        enable_session_timeout: true,
        session_timeout_minutes: 60,
      },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error fetching platform settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/provider/settings — update platform configuration
export async function PATCH(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  // Only superadmin can change platform settings
  if (admin.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden: Only superadmins can modify platform settings' }, { status: 403 });
  }

  try {
    let [settings] = await PlatformSetting.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1 },
    });

    const body = await request.json();
    const updatableKeys = [
      'platform_name',
      'support_email',
      'support_phone',
      'maintenance_mode',
      'maintenance_notice',
      'allow_hospital_registration',
      'default_trial_days',
      'starter_plan_price',
      'pro_plan_price',
      'enterprise_plan_price',
      'enable_whatsapp_engine',
      'enable_sms_fallback',
      'enable_audit_logging',
      'enable_session_timeout',
      'session_timeout_minutes',
    ];

    for (const key of updatableKeys) {
      if (body[key] !== undefined) {
        settings[key] = body[key];
      }
    }

    await settings.save();

    return NextResponse.json({
      message: 'Platform settings updated successfully',
      settings,
    });
  } catch (error) {
    console.error('Error updating platform settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
