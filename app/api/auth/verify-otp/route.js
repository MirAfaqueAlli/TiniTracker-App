import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { verifyOtp } from '@/lib/otpStore';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, otp } = body || {};

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }

    if (!otp || !otp.toString().trim()) {
      return NextResponse.json({ error: 'Please enter the 6-digit verification code.' }, { status: 400 });
    }

    const cleanOtp = otp.toString().trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      return NextResponse.json({ error: 'Please enter a valid 6-digit numeric code.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = verifyOtp(normalizedEmail, cleanOtp);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Generate stateless cryptographic verification token valid for 2 hours.
    // Fail closed if the secret is missing — never fall back to a hardcoded value.
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
      console.error('[verify-otp] JWT_SECRET is missing or shorter than 32 characters.');
      return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });
    }
    const verificationToken = jwt.sign(
      {
        email: normalizedEmail,
        purpose: 'email_verification',
        verifiedAt: Date.now(),
      },
      jwtSecret,
      { expiresIn: '2h' }
    );

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully!',
      verificationToken,
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return NextResponse.json({ error: 'Failed to verify code. Please try again.' }, { status: 500 });
  }
}
