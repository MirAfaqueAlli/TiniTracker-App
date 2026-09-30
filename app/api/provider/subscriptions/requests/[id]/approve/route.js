import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { SubscriptionRequest, Subscription, Hospital, AppNotification, ProviderNotification } from '@/lib/db/models/index';

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

    if (req.status === 'approved') {
      return NextResponse.json({ error: 'This request has already been approved' }, { status: 400 });
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Calculate new expiration date based on billing cycle
    const durationDays = req.billing_cycle === 'annual' ? 365 : 30;
    const newEnd = new Date(today);
    newEnd.setDate(newEnd.getDate() + durationDays);
    const newEndStr = newEnd.toISOString().split('T')[0];

    // Find current active subscription or create one
    let activeSub = await Subscription.findOne({
      where: { hospital_id: req.hospital_id, is_active: true },
      order: [['ends_at', 'DESC']],
    });

    if (activeSub) {
      // If current ends_at is in future, extend from that date; otherwise from today
      const currentEnds = new Date(activeSub.ends_at);
      const baseDate = currentEnds > today ? currentEnds : today;
      const extendedEnd = new Date(baseDate);
      extendedEnd.setDate(extendedEnd.getDate() + durationDays);

      activeSub.plan = req.requested_plan;
      activeSub.ends_at = extendedEnd.toISOString().split('T')[0];
      activeSub.is_active = true;
      activeSub.notes = `Upgraded to ${req.requested_plan} (${req.billing_cycle}) by provider ${admin.email}. ${req.notes || ''}`.trim();
      await activeSub.save();
    } else {
      activeSub = await Subscription.create({
        hospital_id: req.hospital_id,
        plan: req.requested_plan,
        starts_at: todayStr,
        ends_at: newEndStr,
        is_active: true,
        notes: `Activated ${req.requested_plan} (${req.billing_cycle}) by provider ${admin.email}.`,
      });
    }

    // Mark request as approved
    req.status = 'approved';
    req.reviewed_by = admin.id;
    req.reviewed_at = new Date();
    await req.save();

    // Mark matching provider notification as read
    try {
      await ProviderNotification.update(
        { is_read: true },
        {
          where: {
            hospital_id: req.hospital_id,
            type: 'upgrade_request',
          },
        }
      );
    } catch {}

    // Dispatch tenant in-app notification so hospital admin sees the success!
    try {
      await AppNotification.create({
        hospital_id: req.hospital_id,
        title: '🎉 Subscription Plan Activated!',
        body: `Your hospital has been upgraded to the ${req.requested_plan.toUpperCase()} plan (${req.billing_cycle} billing). Thank you for subscribing to TiniTracker!`,
        event_type: 'subscription_upgraded',
        is_read: false,
      });
    } catch (notifErr) {
      console.error('Failed to create in-app notification:', notifErr);
    }

    return NextResponse.json({
      message: `Successfully approved and activated ${req.requested_plan} plan for ${req.Hospital?.name || 'hospital'}!`,
      subscription: activeSub,
      request: req,
    });
  } catch (err) {
    console.error('Approve subscription request error:', err);
    return NextResponse.json({ error: 'Failed to approve upgrade request', details: err.message }, { status: 500 });
  }
}
