import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Hospital, User, Patient, Subscription, Payment, ProviderAdmin } from '@/lib/db/models/index';

// GET /api/provider/dashboard/stats
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const today = new Date().toISOString().split('T')[0];
    const d30 = new Date();
    d30.setDate(d30.getDate() + 30);
    const in30Days = d30.toISOString().split('T')[0];

    // 1. All hospitals with latest active subscription
    const hospitals = await Hospital.findAll({
      attributes: ['id', 'name', 'address', 'phone', 'createdAt'],
      include: [{
        model: Subscription,
        required: false,
        where: { is_active: true },
        separate: true,
        order: [['ends_at', 'DESC']],
        limit: 1,
      }],
      order: [['createdAt', 'DESC']],
    });

    const totalHospitals = hospitals.length;
    let activeHospitals = 0;
    let expiredHospitals = 0;
    let expiringSoonCount = 0;

    const plansBreakdown = {
      free_trial: 0,
      monthly: 0,
      quarterly: 0,
      yearly: 0,
      custom: 0,
      none: 0,
    };

    const expiringSoonList = [];

    for (const h of hospitals) {
      const sub = h.Subscriptions?.[0] || null;
      if (!sub) {
        expiredHospitals++;
        plansBreakdown.none++;
        continue;
      }

      if (plansBreakdown[sub.plan] !== undefined) {
        plansBreakdown[sub.plan]++;
      } else {
        plansBreakdown[sub.plan] = 1;
      }

      const isExpired = sub.ends_at < today;
      if (isExpired) {
        expiredHospitals++;
      } else {
        activeHospitals++;
        if (sub.ends_at <= in30Days) {
          expiringSoonCount++;
          // Days remaining
          const diffMs = new Date(sub.ends_at) - new Date(today);
          const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          expiringSoonList.push({
            id: h.id,
            name: h.name,
            city: h.address,
            plan: sub.plan,
            ends_at: sub.ends_at,
            daysLeft,
          });
        }
      }
    }

    // Sort expiring soon by days remaining ascending
    expiringSoonList.sort((a, b) => a.daysLeft - b.daysLeft);

    // 2. Counts for Users & Patients
    const totalUsers = await User.count();
    const totalPatients = await Patient.count();

    // 3. Payments & Revenue metrics
    const payments = await Payment.findAll({
      attributes: ['amount', 'payment_date', 'currency'],
    });

    const currentMonthPrefix = today.slice(0, 7); // YYYY-MM
    const currentYearPrefix = today.slice(0, 4);   // YYYY

    let totalRevenue = 0;
    let thisMonthRevenue = 0;
    let thisYearRevenue = 0;

    for (const p of payments) {
      const amt = parseFloat(p.amount) || 0;
      totalRevenue += amt;
      if (p.payment_date && p.payment_date.startsWith(currentMonthPrefix)) {
        thisMonthRevenue += amt;
      }
      if (p.payment_date && p.payment_date.startsWith(currentYearPrefix)) {
        thisYearRevenue += amt;
      }
    }

    // 4. Recent activity feed (hospitals + payments)
    const recentHospitals = hospitals.slice(0, 6).map(h => ({
      id: `hosp-${h.id}`,
      type: 'hospital_created',
      title: `Hospital registered: ${h.name}`,
      subtitle: `${h.address ? h.address + ' · ' : ''}ID #${h.id}`,
      timestamp: h.createdAt,
    }));

    const recentPaymentsRaw = await Payment.findAll({
      limit: 6,
      order: [['createdAt', 'DESC']],
      include: [{ model: Hospital, attributes: ['id', 'name'] }],
    });

    const recentPayments = recentPaymentsRaw.map(p => ({
      id: `pay-${p.id}`,
      type: 'payment_received',
      title: `Payment received: ₹${Number(p.amount).toLocaleString('en-IN')}`,
      subtitle: `${p.Hospital?.name || 'Hospital #' + p.hospital_id} · ${p.method || 'UPI'}`,
      timestamp: p.createdAt || p.payment_date,
    }));

    const recentActivity = [...recentHospitals, ...recentPayments]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8);

    return NextResponse.json({
      kpis: {
        totalHospitals,
        activeHospitals,
        expiringSoonCount,
        expiredHospitals,
        totalUsers,
        totalPatients,
        totalRevenue,
        thisMonthRevenue,
        thisYearRevenue,
      },
      plansBreakdown,
      expiringSoon: expiringSoonList.slice(0, 5),
      recentActivity,
    });
  } catch (err) {
    console.error('Provider dashboard stats error:', err);
    return NextResponse.json({ error: 'Failed to fetch dashboard statistics' }, { status: 500 });
  }
}
