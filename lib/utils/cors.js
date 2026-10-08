/**
 * TiniTraker — Production CORS Policy & Origin Resolver
 * ═══════════════════════════════════════════════════════════════════════════
 * Edge & Node runtime compatible.
 * Ensures that credentials (cookies, auth headers) are ONLY shared with
 * explicitly trusted origins.
 *
 * Configured via:
 *   CORS_ORIGIN=https://app.tinitracker.in,https://admin.tinitracker.in
 */

/**
 * Retrieve list of allowed origins from environment
 */
export function getAllowedOrigins() {
  const envOrigins = process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGINS || '';
  return envOrigins
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Checks whether an incoming request Origin is allowed.
 *
 * @param {string|null} origin - Origin header from request
 * @param {Request} request - Next.js Request object
 * @returns {boolean}
 */
export function isOriginAllowed(origin, request) {
  // 1. If no Origin header (direct browser URL bar, curl, server-to-server, native app) -> Allowed
  if (!origin) return true;

  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  const allowedOrigins = getAllowedOrigins();

  // 2. Check explicit env list (production allowlist)
  if (allowedOrigins.length > 0 && allowedOrigins.includes(cleanOrigin)) {
    return true;
  }

  // 3. Same-origin check: Host header matches Origin host
  if (request) {
    const host = request.headers.get('host');
    if (host) {
      const selfHttp = `http://${host}`;
      const selfHttps = `https://${host}`;
      if (cleanOrigin === selfHttp || cleanOrigin === selfHttps) {
        return true;
      }
    }
  }

  // 4. In development mode: Allow localhost, loopback, and local network IPs
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    // If no explicit list in dev, allow any origin
    if (allowedOrigins.length === 0) {
      return true;
    }
    // If explicit list is configured, also allow local development origins
    if (
      cleanOrigin.startsWith('http://localhost:') ||
      cleanOrigin === 'http://localhost' ||
      cleanOrigin.startsWith('http://127.0.0.1:') ||
      cleanOrigin === 'http://127.0.0.1' ||
      cleanOrigin.startsWith('http://[::1]:') ||
      cleanOrigin.startsWith('http://192.168.') ||
      cleanOrigin.startsWith('http://10.')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Applies strict CORS headers to a NextResponse.
 *
 * @param {NextResponse} response
 * @param {Request} request
 * @returns {NextResponse}
 */
export function applyCorsHeaders(response, request) {
  const origin = request.headers.get('origin');

  if (origin && isOriginAllowed(origin, request)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  } else if (!origin) {
    // Non-browser or same-origin request
    response.headers.set('Access-Control-Allow-Origin', '*');
  } else {
    // Origin is present but NOT in allowlist:
    // Do NOT grant credentials to unauthorized origins!
    response.headers.set('Vary', 'Origin');
  }

  response.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, PATCH, OPTIONS'
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Api-Version'
  );
  response.headers.set('Access-Control-Max-Age', '86400');

  return response;
}

/**
 * Resolves the request origin from Origin or Referer headers.
 *
 * @param {Request} request
 * @returns {string|null} Origin string or null
 */
export function getRequestOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin) return origin.trim();

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Validates whether a state-mutating request complies with CSRF origin policies.
 * Returns true if valid, false if rejected as untrusted CSRF attempt.
 *
 * @param {Request} request
 * @returns {boolean}
 */
export function isCsrfSafe(request) {
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutatingMethods.includes(request.method)) {
    return true; // Safe idempotent method (GET, HEAD, OPTIONS)
  }

  const origin = getRequestOrigin(request);
  if (!origin) {
    // Non-browser client, server-to-server, or same-origin direct request
    return true;
  }

  return isOriginAllowed(origin, request);
}
