import { NextResponse } from 'next/server';
import { User } from '@/lib/db/models/index';
import { createOtp } from '@/lib/otpStore';
import { sendOtpEmail } from '@/lib/email';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email } = body || {};

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if an account already exists with this email
    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email address already exists. Please sign in instead.' },
        { status: 409 }
      );
    }

    // Generate OTP with 15-second cooldown check and 5-minute validity
    const otpResult = createOtp(normalizedEmail);
    if (otpResult.error) {
      return NextResponse.json(
        { error: otpResult.error, waitSeconds: otpResult.waitSeconds },
        { status: 429 }
      );
    }

    // Send email via nodemailer
    const emailResult = await sendOtpEmail(normalizedEmail, otpResult.otp);

    return NextResponse.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${normalizedEmail}.`,
      expiresInMinutes: 5,
      // Provide devOtp if SMTP is not configured or in development mode for easy testing
      ...(emailResult.simulated || process.env.NODE_ENV === 'development'
        ? { devOtp: otpResult.otp }
        : {}),
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    return NextResponse.json({ error: 'Failed to send verification code. Please try again.' }, { status: 500 });
  }
}
