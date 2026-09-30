import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { SubscriptionRequest, Hospital } from '@/lib/db/models/index';

// GET /api/provider/subscriptions/requests — list upgrade requests
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'ALL';

    const where = {};
    if (status !== 'ALL') {
      where.status = status;
    }

    const requests = await SubscriptionRequest.findAll({
      where,
      include: [
        {
          model: Hospital,
          attributes: ['id', 'name', 'phone', 'address', 'is_blocked'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    return NextResponse.json({ requests });
  } catch (err) {
    console.error('Fetch subscription requests error:', err);
    return NextResponse.json({ error: 'Failed to fetch upgrade requests' }, { status: 500 });
  }
}
