import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Payment, Subscription } from '@/lib/db/models/index';
import { isAdmin } from '@/lib/utils/rbac';

// GET /api/hospitals/billing — hospital admin sees their own subscription + payment history (read-only)
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!isAdmin(user))
    return NextResponse.json({ error: 'Admin access only' }, { status: 403 });

  try {
    const subscriptions = await Subscription.findAll({
      where: { hospital_id: user.hospital_id },
      order: [['starts_at', 'DESC']],
    });

    const payments = await Payment.findAll({
      where:   { hospital_id: user.hospital_id },
      include: [{ model: Subscription, attributes: ['plan', 'starts_at', 'ends_at'] }],
      order:   [['payment_date', 'DESC']],
    });

    const today = new Date().toISOString().split('T')[0];
    const activeSub = subscriptions.find(s => s.is_active && s.ends_at >= today) || null;

    return NextResponse.json({
      active_subscription: activeSub,
      subscriptions,
      payments,
    });
  } catch (err) {
    console.error('Billing history error:', err);
    return NextResponse.json({ error: 'Failed to fetch billing info' }, { status: 500 });
  }
}
