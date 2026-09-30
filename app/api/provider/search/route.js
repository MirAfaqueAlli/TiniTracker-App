import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import {
  Hospital,
  User,
  Subscription,
  SubscriptionRequest,
} from '@/lib/db/models/index';

// GET /api/provider/search?q=query
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();

    if (!q || q.length < 1) {
      return NextResponse.json({
        hospitals: [],
        subscriptions: [],
        requests: [],
        users: [],
      });
    }

    const likeTerm = `%${q}%`;

    // 1. Search Hospitals
    const hospitals = await Hospital.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: likeTerm } },
          { address: { [Op.like]: likeTerm } },
          { phone: { [Op.like]: likeTerm } },
        ],
      },
      attributes: ['id', 'name', 'address', 'phone', 'is_blocked', 'createdAt'],
      limit: 8,
      order: [['name', 'ASC']],
    });

    // 2. Search Subscriptions
    const subscriptions = await Subscription.findAll({
      where: {
        [Op.or]: [
          { plan: { [Op.like]: likeTerm } },
          { notes: { [Op.like]: likeTerm } },
        ],
      },
      include: [
        {
          model: Hospital,
          attributes: ['id', 'name', 'address'],
          required: false,
        },
      ],
      attributes: ['id', 'hospital_id', 'plan', 'starts_at', 'ends_at', 'is_active', 'notes'],
      limit: 6,
      order: [['updatedAt', 'DESC']],
    });

    // 3. Search Upgrade Requests
    const requests = await SubscriptionRequest.findAll({
      where: {
        [Op.or]: [
          { requested_plan: { [Op.like]: likeTerm } },
          { status: { [Op.like]: likeTerm } },
          { contact_phone: { [Op.like]: likeTerm } },
          { notes: { [Op.like]: likeTerm } },
        ],
      },
      include: [
        {
          model: Hospital,
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      attributes: ['id', 'hospital_id', 'requested_plan', 'billing_cycle', 'status', 'contact_phone', 'notes', 'createdAt'],
      limit: 6,
      order: [['createdAt', 'DESC']],
    });

    // 4. Search Hospital Users & Admins
    const users = await User.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: likeTerm } },
          { email: { [Op.like]: likeTerm } },
          { role: { [Op.like]: likeTerm } },
        ],
      },
      include: [
        {
          model: Hospital,
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      attributes: ['id', 'name', 'email', 'role', 'hospital_id', 'is_blocked'],
      limit: 8,
      order: [['name', 'ASC']],
    });

    return NextResponse.json({
      query: q,
      hospitals,
      subscriptions,
      requests,
      users,
    });
  } catch (err) {
    console.error('Provider global search error:', err);
    return NextResponse.json({ error: 'Search failed', details: err.message }, { status: 500 });
  }
}
