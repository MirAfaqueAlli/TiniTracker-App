/**
 * instrumentation.js — Next.js server startup hook.
 *
 * This file is called ONCE when the Next.js server starts.
 * We use it to:
 *  1. Validate required environment variables
 *  2. Connect to MySQL and sync tables (Sequelize force: false — no DDL changes)
 *  3. Seed stage templates (idempotent upsert)
 *  4. Seed default provider admin (first run only — idempotent)
 *  5. Seed roles & permissions for all hospitals (idempotent)
 *  6. Register cron jobs (daily at 08:00 AM)
 *
 * Schema migrations (ALTER TABLE, UPDATE data) are intentionally NOT run here.
 * They live in scripts/migrate-schema.mjs and must be executed manually:
 *   node scripts/migrate-schema.mjs
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the Node.js server runtime, not in the Edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // ── Fail-fast configuration validation ────────────────────────────────
    // The same JWT_SECRET signs both provider tokens (type: 'provider') and
    // app-user tokens (type: 'user'). A weak/missing secret compromises both.
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
      console.error(
        '❌ FATAL: JWT_SECRET is missing or shorter than 32 characters. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
      );
      throw new Error('JWT_SECRET must be set and at least 32 characters long.');
    }

    const { sequelize }             = await import('./lib/db/models/index.js');
    const { seed }                  = await import('./lib/seeders/stageTemplates.seed.js');
    const { seedProviderAdmin }     = await import('./lib/seeders/providerAdmin.seed.js');
    const { registerCronJobs }      = await import('./lib/services/cron.service.js');
    const { seedAllHospitalsRoles } = await import('./lib/seeders/roles.seed.js');

    try {
      await sequelize.authenticate();
      console.log('✅ MySQL connected');

      // Sync models with the existing DB (no DDL — schema changes go in migrate-schema.mjs)
      await sequelize.sync({ force: false });
      console.log('✅ Database tables synced');

      // Auto-seed stage templates on every startup (safe — uses upsert)
      await seed();

      // Auto-seed provider admin on first run only (idempotent — skips if already exists)
      await seedProviderAdmin();

      // Ensure roles, permissions, and system configs are seeded for all hospitals
      await seedAllHospitalsRoles();

      // Register cron jobs (daily notification based on system configuration)
      registerCronJobs();

      console.log('🚀 TiniTraker server initialized');
    } catch (err) {
      console.error('❌ Database connection failed:', err.message);
      console.error('   Make sure MySQL is running and DB credentials are correct in .env.local');
    }
  }
}
