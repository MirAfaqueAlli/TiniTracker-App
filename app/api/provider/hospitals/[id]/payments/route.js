import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Hospital, Payment, Subscription } from '@/lib/db/models/index';

// POST /api/provider/hospitals/[id]/payments — record a payment for a hospital
export async function POST(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const { subscription_id, amount, currency = 'INR', payment_date, method, reference, notes } = await request.json();

    if (!amount || !payment_date)
      return NextResponse.json({ error: 'amount and payment_date are required' }, { status: 400 });

    const hospital = await Hospital.findByPk(id);
    if (!hospital) return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });

    const payment = await Payment.create({
      hospital_id:     id,
      subscription_id: subscription_id || null,
      amount,
      currency,
      payment_date,
      method:      method     || null,
      reference:   reference  || null,
      recorded_by: admin.id,
      notes:       notes      || null,
    });

    return NextResponse.json({ message: 'Payment recorded', payment_id: payment.id }, { status: 201 });
  } catch (err) {
    console.error('Record payment error:', err);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }
}

// GET /api/provider/hospitals/[id]/payments — list all payments for a hospital (provider view)
export async function GET(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const payments = await Payment.findAll({
      where:   { hospital_id: id },
      include: [{ model: Subscription, attributes: ['plan', 'starts_at', 'ends_at'] }],
      order:   [['payment_date', 'DESC']],
    });
    return NextResponse.json({ payments });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}
