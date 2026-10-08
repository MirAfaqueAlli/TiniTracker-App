/**
 * Shared in-memory OTP storage for email verification.
 * Keyed by lowercase trimmed email.
 * OTP is valid for 5 minutes. Resend cooldown is 15 seconds.
 */

global._tinitraker_otp_store = global._tinitraker_otp_store || new Map();
const store = global._tinitraker_otp_store;

const OTP_TTL_MS = 5 * 60 * 1000;    // 5 minutes
const RESEND_COOLDOWN_MS = 15 * 1000; // 15 seconds

export function createOtp(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = store.get(normalizedEmail);

  // Check 15-second cooldown
  if (existing?.lastSentAt) {
    const elapsed = Date.now() - existing.lastSentAt;
    if (elapsed < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      return {
        error: `Please wait ${waitSeconds}s before requesting a new code.`,
        waitSeconds,
      };
    }
  }

  // Generate 6-digit numeric OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const now = Date.now();

  store.set(normalizedEmail, {
    otp,
    expiresAt: now + OTP_TTL_MS,
    lastSentAt: now,
    verified: false,
    attempts: 0,
  });

  return { otp, expiresAt: now + OTP_TTL_MS };
}

export function verifyOtp(email, inputOtp) {
  const normalizedEmail = email.trim().toLowerCase();
  const entry = store.get(normalizedEmail);

  if (!entry) {
    return {
      success: false,
      error: 'No verification code found. Please request a new code.',
    };
  }

  // Check expiration (5 minutes)
  if (Date.now() > entry.expiresAt) {
    return {
      success: false,
      error: 'Verification code has expired. Please click Resend to get a new code.',
    };
  }

  // Check attempts
  if (entry.attempts >= 5) {
    store.delete(normalizedEmail);
    return {
      success: false,
      error: 'Too many incorrect attempts. Please request a new code.',
    };
  }

  // Check OTP match
  if (entry.otp !== inputOtp.trim()) {
    entry.attempts += 1;
    const remaining = 5 - entry.attempts;
    return {
      success: false,
      error: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    };
  }

  // Marked as verified!
  entry.verified = true;
  entry.verifiedAt = Date.now();

  return { success: true };
}

export function isEmailVerified(email) {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  const entry = store.get(normalizedEmail);
  if (!entry || !entry.verified) return false;

  // Verified flag is valid for 1 hour to complete registration
  const isFresh = Date.now() - entry.verifiedAt < 60 * 60 * 1000;
  return isFresh;
}

export function getCooldownRemaining(email) {
  if (!email) return 0;
  const normalizedEmail = email.trim().toLowerCase();
  const entry = store.get(normalizedEmail);
  if (!entry?.lastSentAt) return 0;

  const elapsed = Date.now() - entry.lastSentAt;
  if (elapsed >= RESEND_COOLDOWN_MS) return 0;
  return Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
}

export function markEmailVerified(email) {
  if (!email) return;
  const normalizedEmail = email.trim().toLowerCase();
  const entry = store.get(normalizedEmail) || {};
  entry.verified = true;
  entry.verifiedAt = Date.now();
  store.set(normalizedEmail, entry);
}

export function deleteOtp(email) {
  if (!email) return;
  const normalizedEmail = email.trim().toLowerCase();
  store.delete(normalizedEmail);
}

