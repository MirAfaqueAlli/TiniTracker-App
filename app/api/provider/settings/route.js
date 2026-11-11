import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { getPlatformSettings } from '@/lib/services/platformSettings.service';

const UPDATABLE_KEYS = [
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
];

// GET /api/provider/settings — get current platform configuration
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const settings = await getPlatformSettings();
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

  if (admin.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden: Only superadmins can modify platform settings' }, { status: 403 });
  }

  try {
    const settings = await getPlatformSettings();
    const body = await request.json();

    for (const key of UPDATABLE_KEYS) {
      if (body[key] !== undefined) settings[key] = body[key];
    }

    // Validate values that drive real behavior.
    const trialDays = Number(settings.default_trial_days);
    if (!Number.isFinite(trialDays) || trialDays < 1 || trialDays > 3650) {
      return NextResponse.json({ error: 'default_trial_days must be between 1 and 3650' }, { status: 400 });
    }
    settings.default_trial_days = Math.round(trialDays);

    for (const key of ['starter_plan_price', 'pro_plan_price', 'enterprise_plan_price']) {
      const price = Number(settings[key]);
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: `${key} must be a non-negative number` }, { status: 400 });
      }
      settings[key] = Math.round(price);
    }

    settings.maintenance_mode = Boolean(settings.maintenance_mode);
    settings.allow_hospital_registration = Boolean(settings.allow_hospital_registration);

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
