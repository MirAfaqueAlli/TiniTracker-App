import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Hospital, Subscription } from '@/lib/db/models/index';

// POST /api/provider/hospitals/[id]/subscriptions — create/renew a subscription for a hospital
export async function POST(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const { plan, starts_at, ends_at, notes } = await request.json();

    if (!plan || !starts_at || !ends_at)
      return NextResponse.json({ error: 'plan, starts_at, ends_at are required' }, { status: 400 });

    const hospital = await Hospital.findByPk(id);
    if (!hospital) return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });

    // Deactivate any currently active subscriptions for this hospital
    await Subscription.update(
      { is_active: false },
      { where: { hospital_id: id, is_active: true } }
    );

    const subscription = await Subscription.create({
      hospital_id: id,
      plan,
      starts_at,
      ends_at,
      is_active:  true,
      notes:      notes || null,
      created_by: admin.id,
    });

    return NextResponse.json({
      message:         'Subscription created',
      subscription_id: subscription.id,
    }, { status: 201 });
  } catch (err) {
    console.error('Create subscription error:', err);
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}

// GET /api/provider/hospitals/[id]/subscriptions — list all subscriptions for a hospital
export async function GET(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const subscriptions = await Subscription.findAll({
      where: { hospital_id: id },
      order: [['starts_at', 'DESC']],
    });
    return NextResponse.json({ subscriptions });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}
