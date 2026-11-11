import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { User, Hospital, Subscription } from '@/lib/db/models/index';
import { verifyOtp, deleteOtp } from '@/lib/otpStore';

// POST /api/auth/forgot-password/reset
// Body: { email, otp, new_password }
// Verifies OTP, resets password, returns auth token so user is logged in automatically.
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, otp, new_password } = body || {};

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }
    if (!otp) {
      return NextResponse.json({ error: 'Verification code is required.' }, { status: 400 });
    }
    if (!new_password) {
      return NextResponse.json({ error: 'New password is required.' }, { status: 400 });
    }
    if (new_password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Verify the OTP (keyed with 'reset:' prefix to separate from registration OTPs)
    const otpResult = verifyOtp(`reset:${normalizedEmail}`, otp.toString().trim());
    if (!otpResult.success) {
      return NextResponse.json({ error: otpResult.error }, { status: 400 });
    }

    // Find the user
    const user = await User.findOne({
      where: { email: normalizedEmail },
      include: [{ model: Hospital, required: false }],
    });
    if (!user) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    // ── Account suspension & subscription checks (same rules as authenticate) ─
    // A password reset must never mint a session for a blocked or expired tenant.
    if (user.Hospital?.is_blocked) {
      return NextResponse.json({
        error:      'hospital_blocked',
        message:    'This hospital has been suspended by the platform administrator. Please contact support.',
      }, { status: 403 });
    }

    if (user.is_blocked) {
      return NextResponse.json({
        error:      'user_blocked',
        message:    'Your user account has been suspended by the platform administrator. Please contact support.',
      }, { status: 403 });
    }

    const today = new Date().toISOString().split('T')[0];
    const activeSub = await Subscription.findOne({
      where: {
        hospital_id: user.hospital_id,
        is_active:   true,
        ends_at:     { [Op.gte]: today },
      },
    });

    if (!activeSub) {
      return NextResponse.json({
        error:      'subscription_expired',
        message:    "Your hospital's subscription has expired or is inactive. Please contact TiniTracker support to renew.",
      }, { status: 403 });
    }

    // Hash and save new password
    const hash = await bcrypt.hash(new_password, 12);
    await user.update({ password_hash: hash, force_password_change: false });

    // Defensive cleanup: verifyOtp already consumes the code, but delete the
    // namespaced reset entry again so no stale state can be reused.
    deleteOtp(`reset:${normalizedEmail}`);

    // Issue a JWT token so the user is automatically logged in
    const payload = {
      id: user.id,
      type: 'user',
      role: user.role,
      hospital_id: user.hospital_id,
    };
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      console.error('[forgot-password/reset] JWT_SECRET is missing or shorter than 32 characters.');
      return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });
    }
    const token = jwt.sign(payload, secret, { expiresIn: '7d' });

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hospital_id: user.hospital_id,
      hospital_name: user.Hospital?.name || null,
      force_password_change: false,
    };

    const res = NextResponse.json({
      success: true,
      message: 'Password reset successfully. You are now logged in.',
      token,
      user: userData,
    });

    res.cookies.set('tinitracker_token', token, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
    });

    return res;
  } catch (err) {
    console.error('Forgot-password reset error:', err);
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 });
  }
}
