import { NextResponse } from 'next/server';
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

    const result = verifyOtp(email, cleanOtp);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully!',
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return NextResponse.json({ error: 'Failed to verify code. Please try again.' }, { status: 500 });
  }
}
