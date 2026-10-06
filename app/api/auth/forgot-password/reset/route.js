import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Hospital } from '@/lib/db/models/index';
import { verifyOtp } from '@/lib/otpStore';

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
      include: [{ model: Hospital, as: 'hospital', required: false }],
    });
    if (!user) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    // Hash and save new password
    const hash = await bcrypt.hash(new_password, 12);
    await user.update({ password_hash: hash, force_password_change: false });

    // Issue a JWT token so the user is automatically logged in
    const payload = {
      id: user.id,
      role: user.role,
      hospital_id: user.hospital_id,
    };
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });
    }
    const token = jwt.sign(payload, secret, { expiresIn: '7d' });

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hospital_id: user.hospital_id,
      hospital_name: user.hospital?.name || null,
      force_password_change: false,
    };

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully. You are now logged in.',
      token,
      user: userData,
    });
  } catch (err) {
    console.error('Forgot-password reset error:', err);
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 });
  }
}
