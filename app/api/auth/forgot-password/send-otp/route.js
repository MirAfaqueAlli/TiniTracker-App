import { NextResponse } from 'next/server';
import { User } from '@/lib/db/models/index';
import { createOtp } from '@/lib/otpStore';
import { sendOtpEmail } from '@/lib/email';

// POST /api/auth/forgot-password/send-otp
// Body: { email }
// Sends a password-reset OTP to the given email (only if the account exists).
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

    // User MUST exist for password reset (opposite of registration send-otp)
    const user = await User.findOne({ where: { email: normalizedEmail } });
    if (!user) {
      // Return same success message to prevent email enumeration
      return NextResponse.json({
        success: true,
        message: `If an account exists for ${normalizedEmail}, a reset code has been sent.`,
        expiresInMinutes: 5,
      });
    }

    // Generate OTP with 15-second cooldown and 5-minute validity
    const otpResult = createOtp(`reset:${normalizedEmail}`);
    if (otpResult.error) {
      return NextResponse.json(
        { error: otpResult.error, waitSeconds: otpResult.waitSeconds },
        { status: 429 }
      );
    }

    // Send OTP email
    const emailResult = await sendOtpEmail(normalizedEmail, otpResult.otp, {
      subject: 'TiniTraker – Password Reset Code',
      intro: 'Reset Your Password',
      bodyLine: 'You requested a password reset for your TiniTraker account. Please use the verification code below to reset your password:',
      instruction: 'Enter this 6-digit code on the reset password screen to proceed.',
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: emailResult.error || 'Failed to send reset code. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `A 6-digit reset code has been sent to ${normalizedEmail}.`,
      expiresInMinutes: 5,
      // Only include devOtp if SMTP is not configured (simulated mode)
      ...(emailResult.simulated ? { devOtp: otpResult.otp } : {}),
    });
  } catch (err) {
    console.error('Forgot-password send-OTP error:', err);
    return NextResponse.json({ error: 'Failed to send reset code. Please try again.' }, { status: 500 });
  }
}
