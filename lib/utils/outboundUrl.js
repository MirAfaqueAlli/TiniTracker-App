/**
 * Shared SSRF guard for server-side outbound HTTP requests.
 *
 * Rules:
 *  - Only http/https URLs
 *  - No embedded credentials
 *  - Block localhost, *.localhost, *.local, single-label hostnames
 *  - Block private, loopback, link-local, CGNAT, multicast and reserved IPs
 *  - Resolve DNS and reject hostnames that map to any blocked address
 *
 * Fails closed: DNS/parse failures return false.
 */
import { lookup } from 'dns/promises';

function parseIPv4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isPrivateIPv4(ip) {
  const parts = parseIPv4(ip);
  if (!parts) return false;
  const [a, b] = parts;

  return (
    a === 0 ||                       // 0.0.0.0/8
    a === 10 ||                      // 10.0.0.0/8
    a === 127 ||                     // loopback
    (a === 169 && b === 254) ||      // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                         // multicast / reserved
  );
}

function isPrivateIPv6(ip) {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];

  if (v === '::1' || v === '::' || v === '0:0:0:0:0:0:0:1' || v === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // IPv4-mapped IPv6 — ::ffff:127.0.0.1
  const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);

  // Link-local fe80::/10 and unique-local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(v)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return true;

  return false;
}

function isPrivateAddress(address) {
  if (!address || typeof address !== 'string') return true;
  const addr = address.trim().replace(/^\[|\]$/g, '');
  if (addr.includes(':')) return isPrivateIPv6(addr);
  return isPrivateIPv4(addr);
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return true;

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.localdomain') || host.endsWith('.internal')) return true;

  // IPv4 literal
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return isPrivateIPv4(host);
  }

  // IPv6 literal
  if (host.includes(':')) {
    return isPrivateIPv6(host);
  }

  // Single-label hostnames (e.g. "intranet", "metadata") are internal-only.
  if (!host.includes('.')) return true;

  return false;
}

function parseSafeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (isBlockedHostname(url.hostname)) return null;
  return url;
}

/** Synchronous syntax/literal-IP check (no DNS). */
export function isSafeOutboundUrlSync(raw) {
  return Boolean(parseSafeUrl(raw));
}

/**
 * Async full check: syntax + literal IP blocking + DNS resolution.
 * @param {string} raw
 * @returns {Promise<boolean>}
 */
export async function isSafeOutboundUrl(raw) {
  const url = parseSafeUrl(raw);
  if (!url) return false;

  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  // Literal IPs were already validated synchronously.
  const isIpLiteral = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':');
  if (host === 'localhost' || isIpLiteral) return true;

  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (!addresses.length) return false;
    return addresses.every((entry) => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}
