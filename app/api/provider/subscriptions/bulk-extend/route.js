import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Subscription, sequelize } from '@/lib/db/models/index';

// POST /api/provider/subscriptions/bulk-extend — extend multiple subscriptions by N days
export async function POST(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { subscription_ids, days } = await request.json();
    if (!Array.isArray(subscription_ids) || subscription_ids.length === 0 || !days || Number(days) <= 0) {
      return NextResponse.json({ error: 'subscription_ids array and positive number of days required' }, { status: 400 });
    }

    const numDays = Number(days);
    const subscriptions = await Subscription.findAll({
      where: { id: subscription_ids },
    });

    let updatedCount = 0;
    const today = new Date();

    for (const sub of subscriptions) {
      // If current ends_at is in the past, extend from today, otherwise from ends_at
      const baseDate = sub.ends_at && new Date(sub.ends_at) > today ? new Date(sub.ends_at) : new Date(today);
      baseDate.setDate(baseDate.getDate() + numDays);
      const newEndsAt = baseDate.toISOString().slice(0, 10);

      await sub.update({
        ends_at: newEndsAt,
        is_active: true,
      });
      updatedCount++;
    }

    return NextResponse.json({
      message: `Successfully extended ${updatedCount} subscription(s) by ${numDays} days.`,
      updated_count: updatedCount,
    });
  } catch (err) {
    console.error('Bulk extend error:', err);
    return NextResponse.json({ error: 'Failed to bulk extend subscriptions' }, { status: 500 });
  }
}
