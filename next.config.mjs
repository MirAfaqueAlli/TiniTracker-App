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
    return corsOrigin
      ? [
          {
            source: '/api/provider/:path*',
            headers: [
              { key: 'Access-Control-Allow-Credentials', value: 'true' },
              { key: 'Access-Control-Allow-Origin', value: corsOrigin },
              { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
              { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization' },
            ],
          },
        ]
      : [];
  },
};

export default nextConfig;
