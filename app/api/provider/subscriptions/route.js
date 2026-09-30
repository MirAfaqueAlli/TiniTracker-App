import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Subscription, Hospital, ProviderAdmin } from '@/lib/db/models/index';

// GET /api/provider/subscriptions — list all subscriptions across all hospitals
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const plan = searchParams.get('plan');
    const status = searchParams.get('status');
    const hospitalId = searchParams.get('hospital_id');

    const where = {};
    if (plan && plan !== 'ALL') {
      where.plan = plan;
    }
    if (hospitalId) {
      where.hospital_id = hospitalId;
    }

    const today = new Date().toISOString().slice(0, 10);
    const d30 = new Date();
    d30.setDate(d30.getDate() + 30);
    const in30Days = d30.toISOString().slice(0, 10);

    if (status === 'ACTIVE') {
      where.is_active = true;
      where.ends_at = { [Op.gte]: today };
    } else if (status === 'EXPIRED') {
      where[Op.or] = [
        { is_active: false },
        { ends_at: { [Op.lt]: today } }
      ];
    } else if (status === 'EXPIRING_SOON') {
      where.is_active = true;
      where.ends_at = { [Op.between]: [today, in30Days] };
    } else if (status === 'INACTIVE') {
      where.is_active = false;
    }

    const subscriptions = await Subscription.findAll({
      where,
      include: [
        {
          model: Hospital,
          attributes: ['id', 'name', 'address', 'phone', 'is_blocked'],
        }
      ],
      order: [['ends_at', 'ASC'], ['createdAt', 'DESC']],
    });

    const rows = subscriptions.map((s) => {
      const isExp = s.ends_at < today;
      let daysLeft = 0;
      if (s.ends_at) {
        const diff = (new Date(s.ends_at) - new Date(today)) / (1000 * 60 * 60 * 24);
        daysLeft = Math.ceil(diff);
      }

      return {
        id:          s.id,
        hospital_id: s.hospital_id,
        hospital:    s.Hospital,
        plan:        s.plan,
        starts_at:   s.starts_at,
        ends_at:     s.ends_at,
        is_active:   s.is_active,
        expired:     isExp,
        days_left:   daysLeft,
        notes:       s.notes,
        created_by:  s.created_by,
        createdAt:   s.createdAt,
      };
    });

    return NextResponse.json({ subscriptions: rows });
  } catch (err) {
    console.error('List subscriptions error:', err);
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}
