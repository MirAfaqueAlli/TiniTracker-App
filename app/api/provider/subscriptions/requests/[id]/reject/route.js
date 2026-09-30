import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { SubscriptionRequest, Hospital, AppNotification } from '@/lib/db/models/index';

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

    req.status = 'rejected';
    req.reviewed_by = admin.id;
    req.reviewed_at = new Date();
    if (body.reason) {
      req.notes = `${req.notes || ''} [Rejection note: ${body.reason}]`.trim();
    }
    await req.save();

    // Notify tenant hospital
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
    } catch {}

    return NextResponse.json({
      message: 'Subscription request rejected',
      request: req,
    });
  } catch (err) {
    console.error('Reject subscription request error:', err);
    return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 });
  }
}
