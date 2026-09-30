import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import {
  sequelize,
  Hospital,
  User,
  Patient,
  PatientStage,
  Subscription,
  Payment,
} from '@/lib/db/models/index';

// GET /api/provider/reports/summary — consolidated cross-tenant executive intelligence
export async function GET(request) {
  const { errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const d30 = new Date();
    d30.setDate(d30.getDate() + 30);
    const in30Days = d30.toISOString().slice(0, 10);

    // 1. Overall Platform KPIs
    const [
      totalHospitals,
      activeHospitals,
      totalUsers,
      totalPatients,
      totalStages,
      completedStages,
      totalRevenueResult,
      activeSubscriptionsCount,
      expiringSoonCount,
      expiredCount,
    ] = await Promise.all([
      Hospital.count(),
      Hospital.count({ where: { is_blocked: false } }),
      User.count({ where: { is_blocked: false } }),
      Patient.count(),
      PatientStage.count(),
      PatientStage.count({ where: { status: 'completed' } }),
      Payment.findOne({
        attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount')), 0), 'totalRevenue']],
        raw: true,
      }),
      Subscription.count({
        where: {
          is_active: true,
          ends_at: { [Op.gte]: today },
        },
      }),
      Subscription.count({
        where: {
          is_active: true,
          ends_at: { [Op.between]: [today, in30Days] },
        },
      }),
      Subscription.count({
        where: {
          [Op.or]: [
            { is_active: false },
            { ends_at: { [Op.lt]: today } },
          ],
        },
      }),
    ]);

    const totalRevenue = Number(totalRevenueResult?.totalRevenue || 0);

    // 2. Hospital Tenant Performance & Adoption Breakdown
    const hospitals = await Hospital.findAll({
      attributes: ['id', 'name', 'address', 'phone', 'is_blocked', 'createdAt'],
      include: [
        {
          model: Subscription,
          attributes: ['id', 'plan', 'is_active', 'starts_at', 'ends_at'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    // Query counts per hospital
    const [patientCounts, [stageCounts], userCounts, revenueCounts] = await Promise.all([
      Patient.findAll({
        attributes: ['hospital_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['hospital_id'],
        raw: true,
      }),
      sequelize.query(`
        SELECT p.hospital_id,
               COUNT(ps.id) AS total_stages,
               COALESCE(SUM(CASE WHEN ps.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_stages
        FROM patient_stages ps
        JOIN patients p ON ps.patient_id = p.id
        GROUP BY p.hospital_id
      `),
      User.findAll({
        attributes: ['hospital_id', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['hospital_id'],
        raw: true,
      }),
      Payment.findAll({
        attributes: ['hospital_id', [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount')), 0), 'total_paid']],
        group: ['hospital_id'],
        raw: true,
      }),
    ]);

    const patientMap = Object.fromEntries(patientCounts.map(p => [p.hospital_id, Number(p.count)]));
    const stageTotalMap = Object.fromEntries(stageCounts.map(s => [s.hospital_id, Number(s.total_stages || 0)]));
    const stageCompletedMap = Object.fromEntries(stageCounts.map(s => [s.hospital_id, Number(s.completed_stages || 0)]));
    const userMap = Object.fromEntries(userCounts.map(u => [u.hospital_id, Number(u.count)]));
    const revenueMap = Object.fromEntries(revenueCounts.map(r => [r.hospital_id, Number(r.total_paid || 0)]));

    const hospitalPerformance = hospitals.map(h => {
      const sub = h.Subscriptions?.find(s => s.is_active) || h.Subscriptions?.[0];
      let daysRemaining = null;
      let computedStatus = 'none';

      if (sub && sub.ends_at) {
        const endDate = new Date(sub.ends_at);
        const diffMs = endDate.getTime() - new Date(today).getTime();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        computedStatus = daysRemaining <= 0 || !sub.is_active ? 'expired' : 'active';
      }

      const totalP = patientMap[h.id] || 0;
      const totalS = stageTotalMap[h.id] || 0;
      const compS = stageCompletedMap[h.id] || 0;
      const completionRate = totalS > 0 ? Math.round((compS / totalS) * 100) : 0;

      return {
        id: h.id,
        name: h.name,
        address: h.address,
        phone: h.phone,
        email: h.email,
        is_blocked: Boolean(h.is_blocked),
        createdAt: h.createdAt,
        plan: sub?.plan ? sub.plan.toUpperCase() : 'NO PLAN',
        subscriptionStatus: computedStatus,
        daysRemaining,
        endDate: sub?.ends_at || null,
        patientCount: totalP,
        totalStages: totalS,
        completedStages: compS,
        stageCompletionRate: completionRate,
        staffCount: userMap[h.id] || 0,
        totalRevenuePaid: revenueMap[h.id] || 0,
      };
    });

    // 3. Payment Methods Breakdown
    const paymentMethodsResult = await Payment.findAll({
      attributes: [
        'method',
        [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount')), 0), 'total_amount'],
      ],
      group: ['method'],
      raw: true,
    });

    // 4. Plan Distribution
    const planDistributionResult = await Subscription.findAll({
      attributes: [
        'plan',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      ],
      group: ['plan'],
      raw: true,
    });

    return NextResponse.json({
      kpis: {
        totalRevenue,
        totalHospitals,
        activeHospitals,
        suspendedHospitals: totalHospitals - activeHospitals,
        totalUsers,
        totalPatients,
        totalStages,
        completedStages,
        stageCompletionRate: totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0,
        activeSubscriptions: activeSubscriptionsCount,
        expiringSoonSubscriptions: expiringSoonCount,
        expiredSubscriptions: expiredCount,
      },
      hospitalPerformance,
      paymentMethods: paymentMethodsResult.map(pm => ({
        method: pm.method || 'other',
        count: Number(pm.transaction_count),
        total: Number(pm.total_amount),
      })),
      planDistribution: planDistributionResult.map(pd => ({
        plan: pd.plan ? pd.plan.toUpperCase() : 'UNKNOWN',
        count: Number(pd.count),
      })),
    });
  } catch (error) {
    console.error('Error compiling reports summary:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
