import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { Hospital, User, Patient, Subscription, sequelize } from '@/lib/db/models/index';
import { seedRolesAndPermissionsForHospital } from '@/lib/seeders/roles.seed.js';
import { getDefaultTrialDays } from '@/lib/services/platformSettings.service';
import { normalizePlanKey, normalizeBillingCycle, PLAN_KEYS } from '@/lib/utils/plans';
import { handleApiError } from '@/lib/utils/validation';

// GET /api/provider/hospitals — list all hospitals with active subscription status and metrics
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const hospitals = await Hospital.findAll({
      include: [
        {
          model: Subscription,
          required: false,
          where: { is_active: true },
          separate: true,
          order: [['ends_at', 'DESC']],
          limit: 1,
        },
        {
          model: User,
          required: false,
          attributes: ['id', 'name', 'email', 'role'],
          where: { role: 'admin' },
          limit: 1,
        }
      ],
      order: [['createdAt', 'DESC']],
    });

    // Counts for users and patients per hospital
    const userCounts = await User.findAll({
      attributes: ['hospital_id', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
      group: ['hospital_id'],
      raw: true,
    });
    const userCountMap = {};
    userCounts.forEach(u => { userCountMap[u.hospital_id] = Number(u.cnt); });

    const patientCounts = await Patient.findAll({
      attributes: ['hospital_id', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
      group: ['hospital_id'],
      raw: true,
    });
    const patientCountMap = {};
    patientCounts.forEach(p => { patientCountMap[p.hospital_id] = Number(p.cnt); });

    const today = new Date().toISOString().split('T')[0];
    const rows = hospitals.map(h => {
      const sub = h.Subscriptions?.[0] || null;
      const adminUser = h.Users?.[0] || null;
      return {
        id:               h.id,
        name:             h.name,
        address:          h.address,
        city:             h.address, // alias for frontend convenience
        phone:            h.phone,
        is_blocked:       Boolean(h.is_blocked),
        createdAt:        h.createdAt,
        user_count:       userCountMap[h.id] || 0,
        patient_count:    patientCountMap[h.id] || 0,
        admin_name:       adminUser?.name || null,
        admin_email:      adminUser?.email || null,
        subscription: sub ? {
          id:        sub.id,
          plan:      sub.plan,
          starts_at: sub.starts_at,
          ends_at:   sub.ends_at,
          is_active: sub.is_active,
          expired:   sub.ends_at < today,
        } : null,
      };
    });

    return NextResponse.json({ hospitals: rows });
  } catch (err) {
    console.error('List hospitals error:', err);
    return NextResponse.json({ error: 'Failed to fetch hospitals' }, { status: 500 });
  }
}

// POST /api/provider/hospitals — create a new hospital + its first admin user
export async function POST(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const {
      hospital_name, address, city, phone, whatsapp_gateway_url, whatsapp_api_key,
      admin_name, admin_email, admin_password,
      plan = 'free_trial', billing_cycle = 'monthly', trial_days = null,
    } = await request.json();

    if (!hospital_name || !admin_name || !admin_email || !admin_password)
      return NextResponse.json({ error: 'hospital_name, admin_name, admin_email, admin_password are required' }, { status: 400 });
    if (admin_password.length < 8)
      return NextResponse.json({ error: 'Admin password must be at least 8 characters' }, { status: 400 });
    if (!PLAN_KEYS.includes(plan))
      return NextResponse.json({ error: `Invalid plan. Use: ${PLAN_KEYS.join(', ')}` }, { status: 400 });

    const normalizedPlan = normalizePlanKey(plan);
    const normalizedCycle = normalizeBillingCycle(billing_cycle);
    const trialDays = Number(trial_days) > 0 ? Number(trial_days) : await getDefaultTrialDays();

    // Wrap hospital + admin user + subscription creation in a single transaction.
    // If any step fails (e.g. duplicate email), the entire operation is rolled back
    // so there are no orphaned hospital rows.
    const t = await sequelize.transaction();
    let hospital, subscription;
    try {
      hospital = await Hospital.create({
        name:             hospital_name,
        address:          address || city || null,
        phone:            phone || null,
        whatsapp_api_url: whatsapp_gateway_url || null,
        whatsapp_api_key: whatsapp_api_key || null,
        is_blocked:       false,
      }, { transaction: t });

      // Create first admin user for this hospital
      const hash = await bcrypt.hash(admin_password, 10);
      await User.create({
        hospital_id:           hospital.id,
        name:                  admin_name,
        email:                 admin_email,
        password_hash:         hash,
        role:                  'admin',
        force_password_change: true,   // must change on first login
      }, { transaction: t });

      // Create initial subscription (free trial by default)
      const starts_at = new Date().toISOString().split('T')[0];
      const ends = new Date();
      ends.setDate(ends.getDate() + trialDays);
      const ends_at = ends.toISOString().split('T')[0];

      subscription = await Subscription.create({
        hospital_id:   hospital.id,
        plan:          normalizedPlan,
        billing_cycle: normalizedCycle,
        starts_at,
        ends_at,
        is_active:     true,
        created_by:    admin.id,
      }, { transaction: t });

      await t.commit();
    } catch (innerErr) {
      await t.rollback();
      throw innerErr;
    }

    // Seed roles outside the transaction (safe to fail independently — not critical)
    try {
      await seedRolesAndPermissionsForHospital(hospital.id);
    } catch (seedErr) {
      console.error('Failed to seed hospital roles:', seedErr);
    }

    return NextResponse.json({
      message:         'Hospital created successfully',
      hospital_id:     hospital.id,
      subscription_id: subscription.id,
    }, { status: 201 });
  } catch (err) {
    return handleApiError(err, 'Failed to create hospital', '[POST /provider/hospitals]');
  }
}
