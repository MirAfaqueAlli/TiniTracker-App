import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { getPlatformSettings } from '../services/platformSettings.service.js';
import { User, Hospital, Subscription } from '../db/models/index.js';

/**
 * Returns the request pathname in a way that works for NextRequest, Web Request,
 * and plain objects used in tests.
 */
function getPathname(request) {
  if (request?.nextUrl?.pathname) return request.nextUrl.pathname;
  try {
    return new URL(request?.url || '', 'http://localhost').pathname;
  } catch {
    return '';
  }
}

/**
 * Non-data-bearing account endpoints that remain reachable when a hospital's
 * subscription has lapsed. Rationale:
 *  - /api/auth/me lets the UI render the lapsed-subscription state and the
 *    navigation shell, instead of trapping the user on a blank screen.
 *  - /api/auth/change-password lets a user secure their own account even while
 *    the hospital subscription is being renewed.
 *  - /api/hospitals/subscription lets an expired tenant view plans and submit a
 *    renewal/upgrade request (otherwise they could never renew from the app).
 * Blocked users/hospitals are still rejected on these endpoints.
 */
const SUBSCRIPTION_EXEMPT_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/change-password',
  '/api/hospitals/subscription',
]);

/**
 * Verifies the Bearer token (or httpOnly cookie) and returns the user together
 * with any account-status failure.
 *
 * The returned object has the shape:
 *   { user, error, status?, code?, message? }
 * `error` is the human-readable fallback; `code` is a stable machine code
 * (`user_blocked`, `hospital_blocked`, `subscription_expired`). Callers should
 * prefer `code` when present.
 *
 * Usage:
 *   const { user, error, status = 401, code, message } = await authenticate(request);
 *   if (error) return NextResponse.json({ error: code || error, message }, { status });
 */
export async function authenticate(request) {
  let token = null;
  const header = request.headers.get('authorization');
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else {
    token = request.cookies?.get?.('tinitraker_token')?.value;
  }

  if (!token) {
    return { user: null, error: 'Not authenticated' };
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      console.error('[auth] JWT_SECRET is missing or shorter than 32 characters.');
      return { user: null, error: 'Server misconfiguration' };
    }

    const decoded = jwt.verify(token, secret);

    // Platform-wide maintenance barrier for tenant APIs.
    const platformSettings = await getPlatformSettings();
    if (platformSettings.maintenance_mode) {
      return {
        user: null,
        error: 'maintenance_mode',
        code: 'maintenance_mode',
        message: platformSettings.maintenance_notice || 'The platform is undergoing maintenance. Please try again shortly.',
        status: 503,
      };
    }

    // Provider tokens are signed with the same secret but MUST NEVER authenticate
    // as a hospital user. Explicitly reject them.
    if (decoded.type === 'provider') {
      return { user: null, error: 'Token invalid or expired' };
    }

    // App-user tokens must carry type: 'user'. Legacy tokens issued before the
    // type claim was introduced (no `type` field) are still accepted until they
    // expire, but any other type value is rejected.
    if (decoded.type !== undefined && decoded.type !== 'user') {
      return { user: null, error: 'Token invalid or expired' };
    }

    const user    = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password_hash'] },
      include: [{ model: Hospital }]
    });
    if (!user) {
      return { user: null, error: 'User not found', status: 401 };
    }

    // ── Account suspension (checked on EVERY request, not just login) ───────
    if (user.Hospital?.is_blocked) {
      return {
        user: null,
        error: 'hospital_blocked',
        code: 'hospital_blocked',
        message: 'This hospital has been suspended by the platform administrator. Please contact support.',
        status: 403,
      };
    }

    if (user.is_blocked) {
      return {
        user: null,
        error: 'user_blocked',
        code: 'user_blocked',
        message: 'Your user account has been suspended by the platform administrator. Please contact support.',
        status: 403,
      };
    }

    // ── Subscription expiry (checked on EVERY data request) ─────────────────
    const pathname = getPathname(request);
    if (!SUBSCRIPTION_EXEMPT_PATHS.has(pathname)) {
      const today = new Date().toISOString().split('T')[0];
      const activeSub = await Subscription.findOne({
        where: {
          hospital_id: user.hospital_id,
          is_active: true,
          ends_at: { [Op.gte]: today },
        },
      });

      if (!activeSub) {
        return {
          user: null,
          error: 'subscription_expired',
          code: 'subscription_expired',
          message: "Your hospital's subscription has expired or is inactive. Please contact TiniTraker support to renew.",
          status: 403,
        };
      }
    }

    return { user, error: null };
  } catch {
    return { user: null, error: 'Token invalid or expired' };
  }
}

/**
 * Guards a route to specific roles.
 * Returns an error string if the user's role is not in the allowed list.
 *
 * Usage:
 *   const roleError = requireRole(user, 'admin');
 *   if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });
 */
export function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) {
    return 'Forbidden — insufficient role';
  }
  return null;
}
