import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Payment, Hospital, Subscription } from '@/lib/db/models/index';

// GET /api/provider/payments — list all payments across all hospitals
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const hospitalId = searchParams.get('hospital_id');
    const method = searchParams.get('method');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');

    const where = {};
    if (hospitalId && hospitalId !== 'ALL') {
      where.hospital_id = hospitalId;
    }
    if (method && method !== 'ALL') {
      where.method = method;
    }
    if (fromDate && toDate) {
      where.payment_date = { [Op.between]: [fromDate, toDate] };
    } else if (fromDate) {
      where.payment_date = { [Op.gte]: fromDate };
    } else if (toDate) {
      where.payment_date = { [Op.lte]: toDate };
    }

    const payments = await Payment.findAll({
      where,
      include: [
        {
          model: Hospital,
          attributes: ['id', 'name', 'address', 'phone'],
        },
        {
          model: Subscription,
          attributes: ['id', 'plan', 'starts_at', 'ends_at'],
        }
      ],
      order: [['payment_date', 'DESC'], ['createdAt', 'DESC']],
    });

    return NextResponse.json({ payments });
  } catch (err) {
    console.error('List payments error:', err);
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

// POST /api/provider/payments — record payment cross-hospital
export async function POST(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const {
      hospital_id,
      subscription_id,
      amount,
      currency = 'INR',
      payment_date,
      method = 'UPI',
      reference,
      notes,
    } = await request.json();

    if (!hospital_id || !amount || !payment_date) {
      return NextResponse.json({ error: 'hospital_id, amount, and payment_date are required' }, { status: 400 });
    }

    const hospital = await Hospital.findByPk(hospital_id);
    if (!hospital) {
      return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
    }

    const payment = await Payment.create({
      hospital_id,
      subscription_id: subscription_id || null,
      amount: parseFloat(amount),
      currency,
      payment_date,
      method: method || 'UPI',
      reference: reference || null,
      recorded_by: admin.id,
      notes: notes || null,
    });

    return NextResponse.json({
      message: 'Payment recorded successfully',
      payment,
    }, { status: 201 });
  } catch (err) {
    console.error('Record payment error:', err);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}
