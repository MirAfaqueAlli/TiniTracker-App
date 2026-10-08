/**
 * TiniTraker — Client IP & Reverse-Proxy Resolver Utility
 * ═══════════════════════════════════════════════════════════════════════════
 * Edge & Node runtime compatible.
 * Extracts, sanitizes, and validates client IP addresses across reverse proxies
 * (Cloudflare, Nginx, AWS ALB, Vercel, Docker).
 *
 * Security Protections:
 *  - Header injection defense (strips non-IP characters)
 *  - Port stripping (e.g., 203.0.113.195:52311 -> 203.0.113.195)
 *  - IPv4-mapped IPv6 normalization (::ffff:127.0.0.1 -> 127.0.0.1)
 *  - Multi-hop X-Forwarded-For resolution
 *  - Fallback safe IP default (127.0.0.1)
 */

// Basic IPv4 & IPv6 validation regexes
const IPV4_REGEX = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_REGEX = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$|^::(?:[a-fA-F0-9]{1,4}:){0,6}[a-fA-F0-9]{1,4}$|^(?:[a-fA-F0-9]{1,4}:){1,7}:$/;

/**
 * Clean and validate an individual IP candidate string.
 * Returns the sanitized IP or null if invalid.
 */
export function sanitizeIp(candidate) {
  if (!candidate || typeof candidate !== 'string') return null;

  let ip = candidate.trim();

  // Strip IPv6 brackets if present, e.g. [::1]:8080
  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.substring(1, ip.indexOf(']'));
  } else if (ip.includes(':') && ip.includes('.')) {
    // IPv4 with port, e.g. 192.168.1.1:8080 or ::ffff:192.168.1.1
    if (ip.startsWith('::ffff:')) {
      ip = ip.replace('::ffff:', '');
    } else {
      ip = ip.split(':')[0];
    }
  } else if (!ip.includes(':') && ip.includes('.')) {
    // Pure IPv4 with possible port (already covered above or plain)
    ip = ip.split(':')[0];
  }

  // Normalize loopback representations
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }

  // Validate format
  if (IPV4_REGEX.test(ip) || IPV6_REGEX.test(ip)) {
    return ip;
  }

  return null;
}

/**
 * Extracts and sanitizes the true client IP from request headers or socket.
 *
 * Priority order:
 *  1. cf-connecting-ip (Cloudflare authentic client IP)
 *  2. true-client-ip   (Akamai / Cloudflare Enterprise)
 *  3. x-client-ip      (Injected downstream by our Edge Proxy)
 *  4. x-real-ip        (Nginx / Traefik proxy)
 *  5. x-forwarded-for  (Standard multi-hop proxy chain — selects first valid IP)
 *  6. Socket IP / Fallback (127.0.0.1)
 *
 * @param {Request|object} request - Next.js Request, Web standard Request, or Node req
 * @returns {string} Sanitized IP address
 */
export function getClientIp(request) {
  if (!request) return '127.0.0.1';

  // Support both Web standard Request (request.headers.get) and Node req (request.headers['...'])
  const getHeader = (name) => {
    if (typeof request.headers?.get === 'function') {
      return request.headers.get(name);
    }
    if (request.headers && typeof request.headers === 'object') {
      return request.headers[name.toLowerCase()] || null;
    }
    return null;
  };

  // 1. Cloudflare
  const cf = getHeader('cf-connecting-ip');
  const validCf = sanitizeIp(cf);
  if (validCf) return validCf;

  // 2. True-Client-IP
  const trueClient = getHeader('true-client-ip');
  const validTrueClient = sanitizeIp(trueClient);
  if (validTrueClient) return validTrueClient;

  // 3. Downstream injected by Edge proxy
  const xClient = getHeader('x-client-ip');
  const validXClient = sanitizeIp(xClient);
  if (validXClient) return validXClient;

  // 4. Nginx X-Real-IP
  const realIp = getHeader('x-real-ip');
  const validRealIp = sanitizeIp(realIp);
  if (validRealIp) return validRealIp;

  // 5. X-Forwarded-For chain
  const forwarded = getHeader('x-forwarded-for');
  if (forwarded && typeof forwarded === 'string') {
    const hops = forwarded.split(',');
    for (const hop of hops) {
      const validHop = sanitizeIp(hop);
      if (validHop) return validHop;
    }
  }

  // 6. Direct socket / connection fallback
  const socketIp = request.ip || request.socket?.remoteAddress || request.connection?.remoteAddress;
  const validSocketIp = sanitizeIp(socketIp);
  if (validSocketIp) return validSocketIp;

  return '127.0.0.1';
}

/**
 * Checks if an IP is within a private / local network subnet.
 *
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateIp(ip) {
  const sanitized = sanitizeIp(ip);
  if (!sanitized) return false;

  if (
    sanitized === '127.0.0.1' ||
    sanitized.startsWith('10.') ||
    sanitized.startsWith('192.168.') ||
    sanitized.startsWith('169.254.')
  ) {
    return true;
  }

  // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
  if (sanitized.startsWith('172.')) {
    const parts = sanitized.split('.');
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}

/**
 * Masks an IP for privacy-compliant / GDPR-compliant logging.
 * (e.g. 203.0.113.195 -> 203.0.113.0)
 *
 * @param {string} ip
 * @returns {string}
 */
export function anonymizeIp(ip) {
  const sanitized = sanitizeIp(ip);
  if (!sanitized) return '0.0.0.0';

  if (sanitized.includes('.')) {
    const parts = sanitized.split('.');
    parts[3] = '0';
    return parts.join('.');
  }

  return sanitized;
}
