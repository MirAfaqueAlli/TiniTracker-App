import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Hospital, Subscription, sequelize } from '@/lib/db/models/index';
import { normalizePlanKey, normalizeBillingCycle, PLAN_KEYS } from '@/lib/utils/plans';
import { handleApiError } from '@/lib/utils/validation';

// POST /api/provider/hospitals/[id]/subscriptions — create/renew a subscription for a hospital
export async function POST(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const { plan, billing_cycle = 'monthly', starts_at, ends_at, notes } = await request.json();

    if (!plan || !starts_at || !ends_at)
      return NextResponse.json({ error: 'plan, starts_at, ends_at are required' }, { status: 400 });
    if (!PLAN_KEYS.includes(plan))
      return NextResponse.json({ error: `Invalid plan. Use: ${PLAN_KEYS.join(', ')}` }, { status: 400 });

    const hospital = await Hospital.findByPk(id);
    if (!hospital) return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });

    // Wrap deactivation + creation in a transaction so the hospital is never
    // left with zero active subscriptions if the CREATE fails.
    const t = await sequelize.transaction();
    let subscription;
    try {
      // Deactivate any currently active subscriptions for this hospital
      await Subscription.update(
        { is_active: false },
        { where: { hospital_id: id, is_active: true }, transaction: t }
      );

      subscription = await Subscription.create({
        hospital_id:   id,
        plan:          normalizePlanKey(plan),
        billing_cycle: normalizeBillingCycle(billing_cycle),
        starts_at,
        ends_at,
        is_active:     true,
        notes:         notes || null,
        created_by:    admin.id,
      }, { transaction: t });

      await t.commit();
    } catch (innerErr) {
      await t.rollback();
      throw innerErr;
    }

    return NextResponse.json({
      message:         'Subscription created',
      subscription_id: subscription.id,
    }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Failed to create subscription', '[POST /provider/hospitals/[id]/subscriptions]');
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
