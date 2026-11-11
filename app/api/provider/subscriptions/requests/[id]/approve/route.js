import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { SubscriptionRequest, Subscription, Hospital, AppNotification, ProviderNotification, sequelize } from '@/lib/db/models/index';
import { normalizePlanKey, normalizeBillingCycle } from '@/lib/utils/plans';
import { handleApiError } from '@/lib/utils/validation';

// POST /api/provider/subscriptions/requests/[id]/approve — approve and activate plan
export async function POST(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const req = await SubscriptionRequest.findByPk(id, {
      include: [{ model: Hospital }],
    });

    if (!req) {
      return NextResponse.json({ error: 'Subscription request not found' }, { status: 404 });
    }

    // Guard: do not re-process a request that has already been decided.
    if (req.status === 'approved') {
      return NextResponse.json({ error: 'This request has already been approved' }, { status: 400 });
    }
    if (req.status === 'rejected') {
      return NextResponse.json({ error: 'This request was already rejected and cannot be approved' }, { status: 400 });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const requestedPlan = normalizePlanKey(req.requested_plan);
    const billingCycle = normalizeBillingCycle(req.billing_cycle);

    // Calculate new expiration date based on billing cycle
    const durationDays = billingCycle === 'yearly' ? 365 : billingCycle === 'quarterly' ? 90 : 30;

    // Wrap all mutations in a transaction so partial state is never committed.
    const t = await sequelize.transaction();
    let activeSub;
    try {
      // Find current active subscription or create one
      activeSub = await Subscription.findOne({
        where: { hospital_id: req.hospital_id, is_active: true },
        order: [['ends_at', 'DESC']],
        transaction: t,
      });

      if (activeSub) {
        // If current ends_at is in future, extend from that date; otherwise from today
        const currentEnds = new Date(activeSub.ends_at);
        const baseDate = currentEnds > today ? currentEnds : today;
        const extendedEnd = new Date(baseDate);
        extendedEnd.setDate(extendedEnd.getDate() + durationDays);

        activeSub.plan = requestedPlan;
        activeSub.billing_cycle = billingCycle;
        activeSub.ends_at = extendedEnd.toISOString().split('T')[0];
        activeSub.is_active = true;
        activeSub.notes = `Upgraded to ${requestedPlan} (${billingCycle}) by provider ${admin.email}. ${req.notes || ''}`.trim();
        await activeSub.save({ transaction: t });
      } else {
        const newEnd = new Date(today);
        newEnd.setDate(newEnd.getDate() + durationDays);
        activeSub = await Subscription.create({
          hospital_id:   req.hospital_id,
          plan:          requestedPlan,
          billing_cycle: billingCycle,
          starts_at:     todayStr,
          ends_at:       newEnd.toISOString().split('T')[0],
          is_active:     true,
          notes:         `Activated ${requestedPlan} (${billingCycle}) by provider ${admin.email}.`,
        }, { transaction: t });
      }

      // Mark request as approved
      req.status = 'approved';
      req.reviewed_by = admin.id;
      req.reviewed_at = new Date();
      await req.save({ transaction: t });

      // Mark matching provider notification as read (within the transaction)
      await ProviderNotification.update(
        { is_read: true },
        {
          where: { hospital_id: req.hospital_id, type: 'upgrade_request' },
          transaction: t,
        }
      ).catch(() => {}); // non-critical — do not fail the transaction

      await t.commit();
    } catch (innerErr) {
      await t.rollback();
      throw innerErr;
    }

    // Dispatch tenant in-app notification so hospital admin sees the success!
    // This is outside the transaction deliberately — notification failure should NOT
    // roll back the subscription upgrade.
    try {
      await AppNotification.create({
        hospital_id: req.hospital_id,
        title: '🎉 Subscription Plan Activated!',
        body: `Your hospital has been upgraded to the ${requestedPlan.toUpperCase()} plan (${billingCycle} billing). Thank you for subscribing to TiniTracker!`,
        event_type: 'subscription_upgraded',
        is_read: false,
      });
    } catch (notifErr) {
      console.error('Failed to create in-app notification:', notifErr);
    }

    return NextResponse.json({
      message: `Successfully approved and activated ${requestedPlan} plan for ${req.Hospital?.name || 'hospital'}!`,
      subscription: activeSub,
      request: req,
    });
  } catch (err) {
    return handleApiError(err, 'Failed to approve upgrade request', '[POST /provider/subscriptions/requests/[id]/approve]');
  }
}
