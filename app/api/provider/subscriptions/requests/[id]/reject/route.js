import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { SubscriptionRequest, Hospital, AppNotification, sequelize } from '@/lib/db/models/index';
import { handleApiError } from '@/lib/utils/validation';

// POST /api/provider/subscriptions/requests/[id]/reject — reject request
export async function POST(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const req = await SubscriptionRequest.findByPk(id, {
      include: [{ model: Hospital }],
    });

    if (!req) {
      return NextResponse.json({ error: 'Subscription request not found' }, { status: 404 });
    }

    // Guard: do not reject a request that has already been decided.
    if (req.status === 'approved') {
      return NextResponse.json(
        { error: 'This request has already been approved and cannot be rejected. Contact support to reverse an active subscription.' },
        { status: 400 }
      );
    }
    if (req.status === 'rejected') {
      return NextResponse.json({ error: 'This request has already been rejected' }, { status: 400 });
    }

    // Wrap the status update and notification in a transaction.
    const t = await sequelize.transaction();
    try {
      req.status = 'rejected';
      req.reviewed_by = admin.id;
      req.reviewed_at = new Date();
      if (body.reason) {
        req.notes = `${req.notes || ''} [Rejection note: ${body.reason}]`.trim();
      }
      await req.save({ transaction: t });
      await t.commit();
    } catch (innerErr) {
      await t.rollback();
      throw innerErr;
    }

    // Notify tenant hospital outside the transaction (non-critical)
    try {
      await AppNotification.create({
        hospital_id: req.hospital_id,
        title: 'Subscription Request Update',
        body: body.reason
          ? `Your subscription upgrade request could not be processed: ${body.reason}`
          : 'Your subscription upgrade request could not be processed at this time. Please contact support.',
        event_type: 'subscription_rejected',
        is_read: false,
      });
    } catch (notifErr) {
      console.error('Failed to create rejection notification:', notifErr);
    }

    return NextResponse.json({
      message: 'Subscription request rejected',
      request: req,
    });
  } catch (err) {
    return handleApiError(err, 'Failed to reject request', '[POST /provider/subscriptions/requests/[id]/reject]');
  }
}
