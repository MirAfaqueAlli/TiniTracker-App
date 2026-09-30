import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Payment, Hospital, Subscription, sequelize } from '@/lib/db/models/index';

// GET /api/provider/revenue — revenue intelligence and analytics
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7); // YYYY-MM
    const currentYear = today.slice(0, 4);   // YYYY

    const allPayments = await Payment.findAll({
      include: [
        { model: Hospital, attributes: ['id', 'name', 'address'] },
      ],
      order: [['payment_date', 'ASC']],
    });

    let totalRevenue = 0;
    let thisMonthRevenue = 0;
    let thisYearRevenue = 0;

    const monthlyMap = {};
    const methodMap = {};
    const hospitalMap = {};

    // Initialize last 12 months in monthlyMap
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const mKey = d.toISOString().slice(0, 7);
      const mLabel = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      monthlyMap[mKey] = { month: mKey, label: mLabel, total: 0, count: 0 };
    }

    for (const p of allPayments) {
      const amt = parseFloat(p.amount) || 0;
      totalRevenue += amt;

      const dateStr = p.payment_date || (p.createdAt ? p.createdAt.toISOString().slice(0, 10) : '');
      const mKey = dateStr.slice(0, 7);

      if (dateStr.startsWith(currentMonth)) {
        thisMonthRevenue += amt;
      }
      if (dateStr.startsWith(currentYear)) {
        thisYearRevenue += amt;
      }

      // Monthly Trend
      if (monthlyMap[mKey]) {
        monthlyMap[mKey].total += amt;
        monthlyMap[mKey].count += 1;
      }

      // Method breakdown
      const method = p.method || 'Other';
      if (!methodMap[method]) {
        methodMap[method] = { method, total: 0, count: 0 };
      }
      methodMap[method].total += amt;
      methodMap[method].count += 1;

      // Hospital breakdown
      const hId = p.hospital_id;
      const hName = p.Hospital?.name || `Hospital #${hId}`;
      if (!hospitalMap[hId]) {
        hospitalMap[hId] = {
          hospital_id: hId,
          hospital_name: hName,
          total_paid: 0,
          count: 0,
          last_payment_date: dateStr,
        };
      }
      hospitalMap[hId].total_paid += amt;
      hospitalMap[hId].count += 1;
      if (dateStr > hospitalMap[hId].last_payment_date) {
        hospitalMap[hId].last_payment_date = dateStr;
      }
    }

    // Overdue hospitals: hospitals with expired subscription
    const hospitals = await Hospital.findAll({
      where: { is_blocked: false },
      include: [{
        model: Subscription,
        required: false,
        where: { is_active: true },
        separate: true,
        order: [['ends_at', 'DESC']],
        limit: 1,
      }],
    });

    const overdueHospitals = [];
    for (const h of hospitals) {
      const sub = h.Subscriptions?.[0];
      if (!sub || sub.ends_at < today) {
        overdueHospitals.push({
          id: h.id,
          name: h.name,
          address: h.address,
          plan: sub ? sub.plan : 'None',
          ends_at: sub ? sub.ends_at : null,
          total_paid: hospitalMap[h.id]?.total_paid || 0,
        });
      }
    }

    return NextResponse.json({
      totalRevenue,
      thisMonthRevenue,
      thisYearRevenue,
      monthlyTrend: Object.values(monthlyMap),
      methodBreakdown: Object.values(methodMap),
      hospitalRevenue: Object.values(hospitalMap).sort((a, b) => b.total_paid - a.total_paid),
      overdueHospitals,
    });
  } catch (err) {
    console.error('Revenue analytics error:', err);
    return NextResponse.json({ error: 'Failed to fetch revenue analytics' }, { status: 500 });
  }
}
