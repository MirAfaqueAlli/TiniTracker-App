/**
 * instrumentation.js — Next.js server startup hook.
 *
 * This file is called ONCE when the Next.js server starts.
 * We use it to:
 *  1. Connect to MySQL and sync tables
 *  2. Seed stage templates
 *  3. Seed default provider admin (first run only — idempotent)
 *  4. Register cron jobs (daily at 08:00 AM)
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the Node.js server runtime, not in the Edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { sequelize }             = await import('./lib/db/models/index.js');
    const { seed }                  = await import('./lib/seeders/stageTemplates.seed.js');
    const { seedProviderAdmin }     = await import('./lib/seeders/providerAdmin.seed.js');
    const { registerCronJobs }      = await import('./lib/services/cron.service.js');
    const { seedAllHospitalsRoles } = await import('./lib/seeders/roles.seed.js');

    try {
      await sequelize.authenticate();
      console.log('✅ MySQL connected');

      await sequelize.sync({ force: false });
      console.log('✅ Database tables synced');

      // Ensure users.role column allows custom roles (VARCHAR(64))
      await sequelize.query(
        "ALTER TABLE users MODIFY COLUMN role VARCHAR(64) NOT NULL DEFAULT 'staff';"
      ).catch(err => console.log('ℹ️ Role VARCHAR sync:', err.message));

      // Ensure patient_type includes 'both' for post-delivery cross-dept patients
      await sequelize.query(
        "ALTER TABLE patients MODIFY COLUMN patient_type ENUM('pregnant','immunization','both') NOT NULL;"
      ).catch(err => console.log('ℹ️ patient_type ENUM sync:', err.message));

      // Ensure skip_reason is TEXT to allow custom medical reasons
      await sequelize.query(
        "ALTER TABLE patient_stages MODIFY COLUMN skip_reason TEXT;"
      ).catch(err => console.log('ℹ️ skip_reason TEXT check:', err.message));

      // Ensure force_password_change column exists on users table
      const [userCols] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'force_password_change';").catch(() => [[]]);
      if (!userCols || userCols.length === 0) {
        await sequelize.query(
          "ALTER TABLE users ADD COLUMN force_password_change TINYINT(1) NOT NULL DEFAULT 0;"
        ).catch(err => console.log('ℹ️ force_password_change column check:', err.message));
      }


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
