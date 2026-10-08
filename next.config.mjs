/** @type {import('next').NextConfig} */

// Resolve allowed CORS origins from environment
// In production set: CORS_ORIGIN=https://admin.tinitracker.in,https://app.tinitracker.in
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).join(', ')
  : (process.env.NODE_ENV === 'production' ? '' : '*');

if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.warn(
    '⚠️  [next.config] CORS_ORIGIN env var is not set. Provider API CORS is disabled for unknown origins. Set CORS_ORIGIN=https://yourdomain.com to enable cross-origin access.'
  );
}

const nextConfig = {
  // Allow Node.js built-in modules used by Sequelize, bcrypt, etc. in API routes
  serverExternalPackages: ['sequelize', 'mysql2', 'bcryptjs', 'node-cron'],

  turbopack: {},

  // Webpack config to handle native Node modules correctly
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle server-only modules on the client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
      };
    }
    return config;
  },

  async headers() {
    const cspDirectives = [
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

    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Content-Security-Policy', value: cspDirectives },
    ];

    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload',
      });
    }

    const headersList = [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];

    if (corsOrigin) {
      headersList.push({
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: corsOrigin },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
        ],
      });
    }

    return headersList;
  },
};

export default nextConfig;
