import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Hospital, Subscription } from '@/lib/db/models/index';

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password)
      return NextResponse.json({ error: 'Email/Username and password required' }, { status: 400 });

    const identifier = email.trim();
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { email: identifier },
          { name: identifier }
        ]
      },
      include: [Hospital]
    });
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    // ── Platform Suspension check ──────────────────────────────────────────────
    if (user.Hospital?.is_blocked) {
      return NextResponse.json({
        error:   'hospital_blocked',
        message: 'This hospital has been temporarily suspended by the platform administrator. Please contact support.',
      }, { status: 403 });
    }

    if (user.is_blocked) {
      return NextResponse.json({
        error:   'user_blocked',
        message: 'Your user account has been suspended by the platform administrator. Please contact support.',
      }, { status: 403 });
    }

    // ── Subscription gate ──────────────────────────────────────────────────────
    // Check if this hospital has an active, non-expired subscription.
    // Skip the check for admins on a grace period? No — gate all roles equally.
    const today = new Date().toISOString().split('T')[0];
    const activeSub = await Subscription.findOne({
      where: {
        hospital_id: user.hospital_id,
        is_active:   true,
        ends_at:     { [Op.gte]: today },
      }
    });

    if (!activeSub) {
      return NextResponse.json({
        error:        'subscription_expired',
        message:      'Your hospital\'s subscription has expired or is inactive. Please contact TiniTracker support to renew.',
      }, { status: 403 });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const token = jwt.sign(
      { id: user.id, role: user.role, hospital_id: user.hospital_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const res = NextResponse.json({
      token,
      user: {
        id:                    user.id,
        name:                  user.name,
        email:                 user.email,
        role:                  user.role,
        hospital_id:           user.hospital_id,
        hospital:              user.Hospital?.name,
        hospital_name:         user.Hospital?.name,
        hospital_address:      user.Hospital?.address,
        hospital_phone:        user.Hospital?.phone,
        Hospital:              user.Hospital,
        force_password_change: user.force_password_change ?? false,
      }
    });

    res.cookies.set('tinitracker_token', token, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
    });

    return res;

  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
