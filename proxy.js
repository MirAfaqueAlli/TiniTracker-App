/**
 * TiniTraker — Root Next.js Edge Proxy (Migrated from Middleware)
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs on every request BEFORE any page or API route handler executes.
 * Uses the lightweight Edge runtime — no Node.js APIs, no DB roundtrips.
 * Auth is verified by checking the JWT cryptographic signature via `jose`.
 *
 * Core Responsibilities:
 *  1. Server-side page guards: unauthenticated visits to protected pages
 *     redirect to /login?next=<path> before HTML is served.
 *  2. Auth bypass pages (/login, /register, /setup): authenticated users
 *     are bounced straight to /dashboard (no login flash for signed-in users).
 *  3. Admin page guards (/hospitals, /staff, /settings, /activity): non-admins
 *     are redirected to /dashboard.
 *  4. Provider portal (/provider/dashboard): requires provider JWT.
 *  5. OPTIONS preflight: responds immediately with 204 No Content + CORS headers.
 *  6. In-Memory Sliding-Window Rate Limiting (Phase 3): prevents brute-force & OTP bombing.
 *  7. API routes: unauthenticated requests get 401 JSON (never redirects).
 *  8. Context injection: forwards x-user-id, x-user-role, x-hospital-id, and
 *     x-client-ip downstream to handlers via request headers.
 *  9. OWASP security headers: applied to all responses across the board.
 */

import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getRateLimitConfig, checkRateLimit } from './lib/middleware/rateLimiter';
import { applyCorsHeaders, isOriginAllowed, isCsrfSafe } from './lib/utils/cors';
import { getClientIp } from './lib/utils/clientIp';

// ─── Route Classification ────────────────────────────────────────────────────

/** Pages where an already authenticated app user is redirected to /dashboard */
const AUTH_BYPASS_PAGES = ['/login', '/register', '/setup'];

/** Pages requiring user authentication */
const PROTECTED_PAGE_PREFIXES = [
  '/dashboard',
  '/patients',
  '/notifications',
  '/hospitals',
  '/staff',
  '/settings',
  '/activity',
  '/stages',
  '/change-password',
];

/** Pages restricted to role=admin or role=superadmin */
const ADMIN_ONLY_PAGE_PREFIXES = ['/hospitals', '/staff', '/settings', '/activity'];

/** Provider portal protected pages */
const PROVIDER_PAGE_PREFIXES = ['/provider/dashboard'];

/** Public API routes — always allowed without credentials */
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/forgot-password',
  '/api/provider/auth/login',
  '/api/health',
  '/api/setup',
];

/** Provider-specific API routes */
const PROVIDER_API_PREFIXES = ['/api/provider'];

// ─── Security & CORS Helpers ─────────────────────────────────────────────────

function getEncodedSecret(secret) {
  return new TextEncoder().encode(secret);
}



const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

/** Attach OWASP recommended baseline security headers to any response */
function applySecurityHeaders(response) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Content-Security-Policy', CSP_POLICY);
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  return response;
}

/** Prevent intermediate proxies and browsers from caching sensitive health/auth API responses */
function applyApiCacheHeaders(response) {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}



// ─── Token Verification Helpers ──────────────────────────────────────────────

/**
 * Decode and verify the main app JWT (from cookie or Authorization Bearer header).
 * Returns payload on valid signature, null otherwise.
 */
async function verifyAppToken(request) {
  let token = request.cookies.get('tinitracker_token')?.value;

  if (!token) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const { payload } = await jwtVerify(token, getEncodedSecret(secret));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Decode and verify the provider JWT (from cookie or Authorization Bearer header).
 * Returns payload on valid signature & type=provider, null otherwise.
 */
async function verifyProviderToken(request) {
  let token = request.cookies.get('provider_token')?.value;

  if (!token) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const { payload } = await jwtVerify(token, getEncodedSecret(secret));
    if (payload.type !== 'provider') return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Response Builders ───────────────────────────────────────────────────────

function redirect(request, path, params = {}) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = '';
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = NextResponse.redirect(url);
  return applySecurityHeaders(res);
}

function apiUnauthorized(message = 'Authentication required. Please log in.', request, rateCheck = null) {
  const res = NextResponse.json({ error: message }, { status: 401 });
  if (request) applyCorsHeaders(res, request);
  applyApiCacheHeaders(res);
  if (rateCheck) applyRateLimitHeaders(res, rateCheck);
  return applySecurityHeaders(res);
}

function apiForbidden(message = 'Access denied: insufficient permissions', request, rateCheck = null) {
  const res = NextResponse.json({ error: message }, { status: 403 });
  if (request) applyCorsHeaders(res, request);
  applyApiCacheHeaders(res);
  if (rateCheck) applyRateLimitHeaders(res, rateCheck);
  return applySecurityHeaders(res);
}

function apiRateLimited(rateCheck, request) {
  const res = NextResponse.json(
    {
      error: rateCheck.errorMessage,
      retryAfter: rateCheck.retryAfter,
    },
    { status: 429 }
  );
  res.headers.set('Retry-After', String(rateCheck.retryAfter));
  res.headers.set('X-RateLimit-Limit', String(rateCheck.limit));
  res.headers.set('X-RateLimit-Remaining', '0');
  res.headers.set('X-RateLimit-Reset', String(rateCheck.resetSeconds));
  if (request) applyCorsHeaders(res, request);
  applyApiCacheHeaders(res);
  return applySecurityHeaders(res);
}

function applyRateLimitHeaders(response, rateCheck) {
  if (rateCheck && rateCheck.limit !== undefined) {
    response.headers.set('X-RateLimit-Limit', String(rateCheck.limit));
    response.headers.set('X-RateLimit-Remaining', String(rateCheck.remaining));
    response.headers.set('X-RateLimit-Reset', String(rateCheck.resetSeconds));
  }
  return response;
}

// ─── Matcher helper ───────────────────────────────────────────────────────────

function startsWith(pathname, prefixes) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// ─── Main Proxy Handler ─────────────────────────────────────────────────────────

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const clientIp = getClientIp(request);

  // ── 1. Static assets & Next.js internals — always skip ────────────────────
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/public') ||
    /\.(ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|css|js\.map|json|txt|xml)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // ── 2. Handle HTTP OPTIONS preflight requests immediately ─────────────────
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin');
    if (origin && !isOriginAllowed(origin, request)) {
      const denied = NextResponse.json(
        { error: 'CORS preflight request from untrusted origin denied.' },
        { status: 403 }
      );
      applySecurityHeaders(denied);
      return denied;
    }

    const preflight = new NextResponse(null, { status: 204 });
    applyCorsHeaders(preflight, request);
    applySecurityHeaders(preflight);
    return preflight;
  }

  // ── 3. Landing page (/) — always public ───────────────────────────────────
  if (pathname === '/') {
    return applySecurityHeaders(NextResponse.next());
  }

  const isApiRoute = pathname.startsWith('/api/');

  // ══════════════════════════════════════════════════════════════════════════
  // A. API ROUTES
  // ══════════════════════════════════════════════════════════════════════════

  if (isApiRoute) {
    // A0. CSRF Origin Guard for Mutating Requests (Phase 6)
    if (!isCsrfSafe(request)) {
      return apiForbidden('Cross-site request forgery protection: untrusted origin denied.', request);
    }

    // A1. In-Memory Sliding Window Rate Limiting (Phase 3)
    const rateLimitConfig = getRateLimitConfig(pathname);
    let rateCheck = null;
    if (rateLimitConfig) {
      rateCheck = checkRateLimit(clientIp, rateLimitConfig);
      if (!rateCheck.allowed) {
        return apiRateLimited(rateCheck, request);
      }
    }

    // A1. Public APIs — passthrough with no auth check
    if (startsWith(pathname, PUBLIC_API_PREFIXES)) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-client-ip', clientIp);
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      applyCorsHeaders(res, request);
      applyApiCacheHeaders(res);
      applyRateLimitHeaders(res, rateCheck);
      return applySecurityHeaders(res);
    }

    // A2. Provider APIs — require provider JWT
    if (startsWith(pathname, PROVIDER_API_PREFIXES)) {
      const providerPayload = await verifyProviderToken(request);
      if (!providerPayload) {
        return apiUnauthorized('Provider authentication required', request, rateCheck);
      }
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-provider-id', String(providerPayload.id));
      requestHeaders.set('x-provider-type', 'provider');
      requestHeaders.set('x-provider-role', String(providerPayload.role ?? ''));
      requestHeaders.set('x-client-ip', clientIp);
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      applyCorsHeaders(res, request);
      applyApiCacheHeaders(res);
      applyRateLimitHeaders(res, rateCheck);
      return applySecurityHeaders(res);
    }

    // A3. All other protected APIs — require app JWT
    const appPayload = await verifyAppToken(request);
    if (!appPayload) {
      return apiUnauthorized('Authentication required. Please log in.', request, rateCheck);
    }

    // Forward authenticated user identity + IP downstream via headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', String(appPayload.id));
    requestHeaders.set('x-user-role', String(appPayload.role ?? ''));
    requestHeaders.set('x-hospital-id', String(appPayload.hospital_id ?? ''));
    requestHeaders.set('x-client-ip', clientIp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    applyCorsHeaders(res, request);
    applyApiCacheHeaders(res);
    applyRateLimitHeaders(res, rateCheck);
    return applySecurityHeaders(res);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // B. PAGE ROUTES
  // ══════════════════════════════════════════════════════════════════════════

  // B1. Provider portal protected pages (/provider/dashboard)
  if (startsWith(pathname, PROVIDER_PAGE_PREFIXES)) {
    const providerPayload = await verifyProviderToken(request);
    if (!providerPayload) {
      return redirect(request, '/provider/login', { next: pathname });
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // B2. Provider login page (/provider/login)
  if (pathname === '/provider/login' || pathname.startsWith('/provider/login/')) {
    const providerPayload = await verifyProviderToken(request);
    if (providerPayload) {
      return redirect(request, '/provider/dashboard');
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // B3. Main Auth bypass pages (/login, /register, /setup)
  const isAuthBypassPage = AUTH_BYPASS_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (isAuthBypassPage) {
    const appPayload = await verifyAppToken(request);
    if (appPayload) {
      return redirect(request, '/dashboard');
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // B4. Protected app pages
  if (startsWith(pathname, PROTECTED_PAGE_PREFIXES)) {
    const appPayload = await verifyAppToken(request);

    // Not logged in or invalid token → redirect to /login
    if (!appPayload) {
      const res = redirect(request, '/login', { next: pathname });
      // Clear stale cookie if present so browser state stays clean
      if (request.cookies.has('tinitracker_token')) {
        res.cookies.delete('tinitracker_token');
      }
      return res;
    }

    // B5. Admin-only page guard (/hospitals, /staff, /settings, /activity)
    if (startsWith(pathname, ADMIN_ONLY_PAGE_PREFIXES)) {
      const role = appPayload.role;
      const isAdmin = role === 'admin' || role === 'superadmin';
      if (!isAdmin) {
        // Non-admin tried to visit an admin page — bounce to dashboard
        return redirect(request, '/dashboard');
      }
    }

    return applySecurityHeaders(NextResponse.next());
  }

  // B6. Fallthrough for any other pages
  return applySecurityHeaders(NextResponse.next());
}

// ─── Matcher Config ───────────────────────────────────────────────────────────

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image  (image optimization)
     * - favicon.ico
     * - Files with common extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|css|js\\.map|json|txt|xml)$).*)',
  ],
};

export default proxy;
