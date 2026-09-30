import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Hospital, User, Subscription, sequelize } from '@/lib/db/models/index';
import { seedRolesAndPermissionsForHospital } from '@/lib/seeders/roles.seed.js';

export async function POST(request) {
  try {
    const count = await Hospital.count();
    if (count > 0) {
      return NextResponse.json(
        { error: 'Setup already complete. This endpoint is permanently disabled.' },
        { status: 409 }
      );
    }

    const {
      hospital_name, hospital_address, hospital_phone,
      admin_name, admin_email, admin_password,
    } = await request.json();

    if (!hospital_name)  return NextResponse.json({ error: 'Hospital name is required' }, { status: 400 });
    if (!admin_name)     return NextResponse.json({ error: 'Admin name is required' }, { status: 400 });
    if (!admin_email)    return NextResponse.json({ error: 'Admin email is required' }, { status: 400 });
    if (!admin_password) return NextResponse.json({ error: 'Admin password is required' }, { status: 400 });
    if (admin_password.length < 8)
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

    const passwordHash = await bcrypt.hash(admin_password, 12);
    let createdHospital = null;
    let createdUser = null;

    await sequelize.transaction(async (t) => {
      createdHospital = await Hospital.create({
        name:    hospital_name.trim(),
        address: hospital_address?.trim() || null,
        phone:   hospital_phone?.trim()   || null,
      }, { transaction: t });

      // Create active 1-year subscription for initial setup
      const today = new Date();
      const nextYear = new Date(today);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      const toDateStr = (d) => d.toISOString().split('T')[0];

      await Subscription.create({
        hospital_id: createdHospital.id,
        plan:        'enterprise',
        starts_at:   toDateStr(today),
        ends_at:     toDateStr(nextYear),
        is_active:   true,
        notes:       'Initial hospital setup subscription',
        created_by:  null,
      }, { transaction: t });

      createdUser = await User.create({
        hospital_id:           createdHospital.id,
        name:                  admin_name.trim(),
        email:                 admin_email.toLowerCase().trim(),
        password_hash:         passwordHash,
        role:                  'admin',
        force_password_change: false,
      }, { transaction: t });
    });

    try {
      await seedRolesAndPermissionsForHospital(createdHospital.id);
    } catch (seedErr) {
      console.error('Failed to seed hospital roles:', seedErr);
    }

    console.log(`✅ Setup complete — Hospital: "${hospital_name}" | Admin: ${admin_email}`);

    const token = jwt.sign(
      { id: createdUser.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const res = NextResponse.json(
      {
        message: 'Setup complete! Taking you to your dashboard...',
        token,
        user: {
          id:                    createdUser.id,
          name:                  createdUser.name,
          email:                 createdUser.email,
          role:                  createdUser.role,
          hospital_id:           createdHospital.id,
          hospital:              createdHospital.name,
          hospital_name:         createdHospital.name,
          hospital_address:      createdHospital.address,
          hospital_phone:        createdHospital.phone,
          Hospital:              createdHospital,
          force_password_change: false,
        },
      },
      { status: 201 }
    );

    res.cookies.set('tinitracker_token', token, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
    });

    return res;
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 });
    }
    console.error('Setup error:', err);
    return NextResponse.json({ error: 'Setup failed. Please try again.' }, { status: 500 });
  }
}
