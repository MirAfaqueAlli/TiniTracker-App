import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Subscription, Hospital } from '@/lib/db/models/index';

// PATCH /api/provider/subscriptions/[id] — modify subscription
export async function PATCH(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const subscription = await Subscription.findByPk(id, { include: [Hospital] });
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const body = await request.json();
    const { plan, starts_at, ends_at, is_active, notes, add_days } = body;

    const updates = {};
    if (plan !== undefined) updates.plan = plan;
    if (starts_at !== undefined) updates.starts_at = starts_at;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);
    if (notes !== undefined) updates.notes = notes;

    if (ends_at !== undefined) {
      updates.ends_at = ends_at;
    } else if (add_days !== undefined && Number(add_days) > 0) {
      const currentEnd = new Date(subscription.ends_at || Date.now());
      currentEnd.setDate(currentEnd.getDate() + Number(add_days));
      updates.ends_at = currentEnd.toISOString().slice(0, 10);
      updates.is_active = true;
    }

    await subscription.update(updates);

    return NextResponse.json({
      message: 'Subscription updated successfully',
      subscription,
    });
  } catch (err) {
    console.error('Update subscription error:', err);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}

// DELETE /api/provider/subscriptions/[id] — delete subscription
export async function DELETE(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const subscription = await Subscription.findByPk(id);
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    await subscription.destroy();
    return NextResponse.json({ message: 'Subscription record deleted' });
  } catch (err) {
    console.error('Delete subscription error:', err);
    return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
  }
}
