import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Hospital, User, Subscription, sequelize } from '@/lib/db/models/index';
import { isEmailVerified, deleteOtp } from '@/lib/otpStore';
import { seedRolesAndPermissionsForHospital } from '@/lib/seeders/roles.seed.js';

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      hospital_name,
      hospital_address,
      hospital_city,
      hospital_state,
      hospital_pincode,
      owner_name,
      email,
      email_verification_token,
      country_code,
      phone,
      password,
      confirm_password,
    } = body;

    // ── Validation ───────────────────────────────────────────────────────────
    if (!hospital_name?.trim())
      return NextResponse.json({ error: 'Hospital name is required.' }, { status: 400 });
    if (!owner_name?.trim())
      return NextResponse.json({ error: 'Owner full name is required.' }, { status: 400 });
    if (!email?.trim())
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });

    const normalizedEmail = email.trim().toLowerCase();

    // Verify email verification proof:
    let verified = false;

    // 1. Primary: Cryptographically signed verification token (stateless & persists across server reloads/lambdas)
    if (email_verification_token) {
      try {
        const jwtSecret = process.env.JWT_SECRET || 'tinitraker_jwt_secret_key_2026';
        const decoded = jwt.verify(email_verification_token, jwtSecret);
        if (
          decoded &&
          decoded.purpose === 'email_verification' &&
          decoded.email === normalizedEmail
        ) {
          verified = true;
        }
      } catch (tokenErr) {
        console.warn('Verification token validation failed:', tokenErr.message);
      }
    }

    // 2. Fallback: In-memory OTP store (for backwards compatibility)
    if (!verified && isEmailVerified(normalizedEmail)) {
      verified = true;
    }

    if (!verified) {
      return NextResponse.json({ error: 'Please verify your email address before continuing.' }, { status: 400 });
    }

    if (!phone?.trim())
      return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 });
    if (!password)
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
    if (password.length < 8)
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    if (password !== confirm_password)
      return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });

    // ── Build address string ─────────────────────────────────────────────────
    const addressParts = [
      hospital_address?.trim(),
      hospital_city?.trim(),
      hospital_state?.trim(),
      hospital_pincode?.trim(),
    ].filter(Boolean);
    const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

    // ── Build phone with country code ────────────────────────────────────────
    const fullPhone = `${country_code || '+91'}${phone.trim()}`;

    // ── Hash password ────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12);

    let createdUser = null;
    let createdHospital = null;

    // ── DB Transaction: Hospital + Subscription + Admin User ─────────────────
    await sequelize.transaction(async (t) => {
      createdHospital = await Hospital.create({
        name:    hospital_name.trim(),
        address: fullAddress,
        phone:   fullPhone,
      }, { transaction: t });

      // 14-day free trial
      const today    = new Date();
      const trialEnd = new Date(today);
      trialEnd.setDate(trialEnd.getDate() + 14);

      const toDateStr = (d) => d.toISOString().split('T')[0]; // YYYY-MM-DD

      await Subscription.create({
        hospital_id: createdHospital.id,
        plan:        'free_trial',
        starts_at:   toDateStr(today),
        ends_at:     toDateStr(trialEnd),
        is_active:   true,
        notes:       'Self-registered via Free Trial signup',
        created_by:  null,
      }, { transaction: t });

      createdUser = await User.create({
        hospital_id:           createdHospital.id,
        name:                  owner_name.trim(),
        email:                 email.toLowerCase().trim(),
        password_hash:         passwordHash,
        role:                  'admin',
        force_password_change: false,
      }, { transaction: t });
    });

    // Cleanup OTP store entry
    deleteOtp(normalizedEmail);

    // Seed default roles, permissions, and system configs for the new hospital
    try {
      await seedRolesAndPermissionsForHospital(createdHospital.id);
    } catch (seedErr) {
      console.error('Failed to seed hospital roles:', seedErr);
    }

    const token = jwt.sign(
      { id: createdUser.id, role: createdUser.role, hospital_id: createdHospital.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    console.log(`✅ Free Trial registered — Hospital: "${hospital_name}" | Owner: ${email}`);

    const res = NextResponse.json(
      {
        message: 'Registration successful! Taking you to your dashboard...',
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
      return NextResponse.json(
        { error: 'An account with that email address already exists. Please sign in instead.' },
        { status: 409 }
      );
    }
    console.error('Registration error:', err);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
