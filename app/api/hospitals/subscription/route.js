import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Subscription, SubscriptionRequest, ProviderNotification, Hospital, Patient, Notification, User } from '@/lib/db/models/index';
import { isAdmin } from '@/lib/utils/rbac';
import { Op } from 'sequelize';
import { getPlatformSettings, getPlanPrices } from '@/lib/services/platformSettings.service';
import { buildPlanCatalog, normalizeBillingCycle, BILLING_CYCLE_KEYS } from '@/lib/utils/plans';

// GET /api/hospitals/subscription — get current subscription details & available plans
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const today = new Date().toISOString().split('T')[0];

    // Find active subscription
    const activeSub = await Subscription.findOne({
      where: {
        hospital_id: user.hospital_id,
        is_active: true,
      },
      order: [['ends_at', 'DESC']],
    });

    let daysRemaining = 0;
    let isExpired = false;
    if (activeSub && activeSub.ends_at) {
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      const endsDate = new Date(activeSub.ends_at);
      endsDate.setHours(0, 0, 0, 0);
      const diffTime = endsDate - todayDate;
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      isExpired = activeSub.ends_at < today;
    }

    // Check for pending upgrade request
    const pendingRequest = await SubscriptionRequest.findOne({
      where: {
        hospital_id: user.hospital_id,
        status: 'pending',
      },
      order: [['createdAt', 'DESC']],
    });

    // Query live usage metrics
    const [patientCount, reminderCount, staffCount] = await Promise.all([
      Patient.count({ where: { hospital_id: user.hospital_id } }),
      Notification.count({
        include: [{ model: Patient, required: true, where: { hospital_id: user.hospital_id } }],
      }),
      User.count({ where: { hospital_id: user.hospital_id } }),
    ]);

    const settings = await getPlatformSettings();
    const availablePlans = buildPlanCatalog(await getPlanPrices(settings));

    return NextResponse.json({
      subscription: activeSub ? {
        id: activeSub.id,
        plan: activeSub.plan,
        is_active: activeSub.is_active,
        starts_at: activeSub.starts_at,
        ends_at: activeSub.ends_at,
        notes: activeSub.notes,
        is_trial: activeSub.plan === 'free_trial',
        days_remaining: daysRemaining,
        is_expired: isExpired,
      } : null,
      usage: {
        patients: patientCount,
        reminders_sent: reminderCount,
        staff_count: staffCount,
      },
      pending_request: pendingRequest,
      available_plans: availablePlans,
      billing_cycles: BILLING_CYCLE_KEYS,
    });
  } catch (err) {
    console.error('Fetch subscription error:', err);
    return NextResponse.json({ error: 'Failed to fetch subscription information' }, { status: 500 });
  }
}

// POST /api/hospitals/subscription — submit an upgrade request to provider admins
export async function POST(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Only hospital administrators can request subscription upgrades' }, { status: 403 });
  }

  try {
    const { requested_plan, billing_cycle = 'monthly', notes, contact_phone } = await request.json();

    if (billing_cycle && !['monthly', 'quarterly', 'yearly', 'annual'].includes(String(billing_cycle).toLowerCase())) {
      return NextResponse.json({ error: 'billing_cycle must be monthly, quarterly, or yearly' }, { status: 400 });
    }

    const availablePlans = buildPlanCatalog(await getPlanPrices());
    const validPlan = availablePlans.find((p) => p.key === requested_plan);
    if (!validPlan) {
      return NextResponse.json({ error: 'Please select a valid subscription plan' }, { status: 400 });
    }
    const normalizedCycle = normalizeBillingCycle(billing_cycle);

    // Get current subscription
    const currentSub = await Subscription.findOne({
      where: { hospital_id: user.hospital_id, is_active: true },
      order: [['ends_at', 'DESC']],
    });

    const hospital = await Hospital.findByPk(user.hospital_id);

    // Create SubscriptionRequest
    const newRequest = await SubscriptionRequest.create({
      hospital_id: user.hospital_id,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      hospital_name: hospital?.name || user.Hospital?.name || 'Hospital',
      current_plan: currentSub?.plan || 'free_trial',
      requested_plan: validPlan.key,
      billing_cycle: normalizedCycle,
      notes: notes?.trim() || null,
      contact_phone: contact_phone?.trim() || hospital?.phone || null,
      status: 'pending',
    });

    // Create ProviderNotification so provider admins see it immediately
    await ProviderNotification.create({
      type: 'upgrade_request',
      title: `Plan Upgrade Request: ${hospital?.name || 'Hospital'}`,
      message: `${user.name} (${user.email}) requested an upgrade from ${currentSub?.plan || 'Free Trial'} to the ${validPlan.name} (${normalizedCycle} billing).`,
      hospital_id: user.hospital_id,
      hospital_name: hospital?.name || 'Hospital',
      action_url: `/subscriptions`,
      meta: {
        requestId: newRequest.id,
        requestedPlan: validPlan.key,
        planName: validPlan.name,
        billingCycle: normalizedCycle,
        userEmail: user.email,
        phone: contact_phone?.trim() || hospital?.phone || null,
      },
      is_read: false,
    });

    console.log(`⭐ Upgrade request dispatched: Hospital "${hospital?.name}" -> ${validPlan.name}`);

    return NextResponse.json({
      message: `Your request to upgrade to ${validPlan.name} has been sent to the TiniTracker provider team. Our team will review and activate your subscription shortly.`,
      request: newRequest,
    }, { status: 201 });

  } catch (err) {
    console.error('Request upgrade error:', err);
    return NextResponse.json({ error: 'Failed to submit upgrade request. Please try again.' }, { status: 500 });
  }
}
