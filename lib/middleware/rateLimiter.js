/**
 * TiniTraker — In-Memory Sliding Window Rate Limiter
 * ═══════════════════════════════════════════════════════════════════════════
 * Edge & Node runtime compatible.
 * Defends against brute-force password guessing, OTP bombing/SMS quota drain,
 * and automated credential stuffing.
 *
 * Algorithm: Sliding Log Window
 *   Maintains timestamps of requests within the active time window for each client.
 *   Provides true sliding rate calculation (no burst at window boundaries).
 *   Self-cleaning: automatically prunes stale records to prevent memory leaks.
 */

// In-memory store: Map<key, number[]>
const requestStore = new Map();

// Track last pruning time to avoid cleaning on every single request
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60 * 1000; // prune every 60s
const MAX_STORE_SIZE = 10000;          // hard cap on tracked keys

/**
 * Route tier configurations
 */
export const RATE_LIMIT_CONFIGS = {
  // Login endpoints: 10 attempts per minute per IP
  AUTH_LOGIN: {
    windowMs: 60 * 1000,
    max: 10,
    category: 'auth_login',
    errorMessage: 'Too many login attempts. Please wait a minute before trying again.',
  },

  // OTP dispatch: strict limit of 4 requests per minute (prevents SMS/email bombing & cost drain)
  AUTH_OTP_SEND: {
    windowMs: 60 * 1000,
    max: 4,
    category: 'auth_otp_send',
    errorMessage: 'Too many OTP requests. Please wait a minute before requesting another code.',
  },

  // OTP verification: max 6 attempts per minute (prevents brute-forcing 4-6 digit codes)
  AUTH_OTP_VERIFY: {
    windowMs: 60 * 1000,
    max: 6,
    category: 'auth_otp_verify',
    errorMessage: 'Too many verification attempts. Please wait a minute before trying again.',
  },

  // Account creation & hospital setup: 5 requests per 2 minutes
  AUTH_REGISTER: {
    windowMs: 120 * 1000,
    max: 5,
    category: 'auth_register',
    errorMessage: 'Too many registration requests. Please wait before attempting again.',
  },

  // Password reset submissions: 5 requests per minute
  AUTH_RESET: {
    windowMs: 60 * 1000,
    max: 5,
    category: 'auth_reset',
    errorMessage: 'Too many password reset requests. Please wait a minute before trying again.',
  },

  // Fallback for general API traffic: 120 requests per minute
  GENERAL_API: {
    windowMs: 60 * 1000,
    max: 120,
    category: 'general_api',
    errorMessage: 'API request limit reached. Please slow down your requests.',
  },
};

/**
 * Match a pathname to its corresponding rate limit tier.
 * Returns null if the path is explicitly exempt (e.g., health check).
 */
export function getRateLimitConfig(pathname) {
  // Health checks are exempt
  if (pathname === '/api/health' || pathname.startsWith('/api/health/')) {
    return null;
  }

  // 1. Login
  if (pathname === '/api/auth/login' || pathname === '/api/provider/auth/login') {
    return RATE_LIMIT_CONFIGS.AUTH_LOGIN;
  }

  // 2. OTP Send
  if (
    pathname === '/api/auth/send-otp' ||
    pathname === '/api/auth/forgot-password/send-otp'
  ) {
    return RATE_LIMIT_CONFIGS.AUTH_OTP_SEND;
  }

  // 3. OTP Verify
  if (pathname === '/api/auth/verify-otp') {
    return RATE_LIMIT_CONFIGS.AUTH_OTP_VERIFY;
  }

  // 4. Registration & Setup
  if (pathname === '/api/auth/register' || pathname === '/api/setup/init') {
    return RATE_LIMIT_CONFIGS.AUTH_REGISTER;
  }

  // 5. Password Reset Submit
  if (pathname === '/api/auth/forgot-password/reset') {
    return RATE_LIMIT_CONFIGS.AUTH_RESET;
  }

  // 6. General API fallback
  if (pathname.startsWith('/api/')) {
    return RATE_LIMIT_CONFIGS.GENERAL_API;
  }

  return null;
}

/**
 * Internal cleanup to prevent memory leaks from accumulated IP keys.
 */
function pruneStaleEntries(now) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS && requestStore.size < MAX_STORE_SIZE) {
    return;
  }

  lastCleanup = now;

  // Purge expired entries (older than max possible window: 2 minutes)
  const maxThreshold = now - 120 * 1000;
  for (const [key, timestamps] of requestStore.entries()) {
    const valid = timestamps.filter((t) => t > maxThreshold);
    if (valid.length === 0) {
      requestStore.delete(key);
    } else {
      requestStore.set(key, valid);
    }
  }

  // If still above hard cap, evict oldest 25% of keys
  if (requestStore.size >= MAX_STORE_SIZE) {
    let count = 0;
    const target = Math.floor(MAX_STORE_SIZE * 0.25);
    for (const key of requestStore.keys()) {
      requestStore.delete(key);
      count++;
      if (count >= target) break;
    }
  }
}

/**
 * Check and record a request against the rate limiter.
 *
 * @param {string} ip - Client IP address
 * @param {object} config - Rule configuration ({ windowMs, max, category, errorMessage })
 * @returns {object} { allowed: boolean, limit: number, remaining: number, resetSeconds: number, retryAfter: number, errorMessage: string }
 */
export function checkRateLimit(ip, config) {
  if (!config) {
    return { allowed: true };
  }

  const now = Date.now();
  pruneStaleEntries(now);

  const key = `${config.category}:${ip}`;
  const windowStart = now - config.windowMs;

  let timestamps = requestStore.get(key) || [];

  // Filter to keep only requests inside active sliding window
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= config.max) {
    const oldest = timestamps[0];
    const retryAfterMs = oldest + config.windowMs - now;
    const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));

    return {
      allowed: false,
      limit: config.max,
      remaining: 0,
      resetSeconds: retryAfter,
      retryAfter,
      errorMessage: config.errorMessage,
    };
  }

  // Record this request
  timestamps.push(now);
  requestStore.set(key, timestamps);

  const remaining = config.max - timestamps.length;
  const resetSeconds = Math.ceil(config.windowMs / 1000);

  return {
    allowed: true,
    limit: config.max,
    remaining,
    resetSeconds,
    retryAfter: 0,
  };
}

/**
 * Utility helper to reset limits for a key (useful for tests or successful auth workflows)
 */
export function resetRateLimit(ip, category) {
  if (category) {
    requestStore.delete(`${category}:${ip}`);
  } else {
    for (const key of requestStore.keys()) {
      if (key.endsWith(`:${ip}`)) {
        requestStore.delete(key);
      }
    }
  }
}
