#!/usr/bin/env node
/**
 * scripts/migrate-schema.mjs — One-time schema migration runner.
 *
 * Run this ONCE after deploying a new version that introduced schema changes.
 * It is safe to run multiple times; each ALTER TABLE is guarded by a column-
 * existence check.  It will NOT be executed on every server boot.
 *
 * Usage:
 *   node scripts/migrate-schema.mjs
 *
 * Required env variables (loaded from .env.local via dotenv):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *   (or DATABASE_URL for socketPath, e.g. /tmp/mysql.sock)
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ───────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../.env.local');
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local is optional — env vars may already be set
  }
}
loadEnv();

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

async function getConn() {
  const opts = {
    user:     process.env.DB_USER     || process.env.MYSQL_USER     || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME     || process.env.MYSQL_DATABASE || 'tinitracker',
  };
  const socketPath = process.env.DB_SOCKET || (process.env.DB_HOST === 'localhost' ? '/tmp/mysql.sock' : null);
  if (socketPath) {
    opts.socketPath = socketPath;
  } else {
    opts.host = process.env.DB_HOST || 'localhost';
    opts.port = Number(process.env.DB_PORT) || 3306;
  }
  return mysql.createConnection(opts);
}

/** Check if a column exists, run DDL if not. Returns true if the DDL ran. */
async function addColumnIfMissing(conn, table, column, ddl) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}';`);
  if (rows.length === 0) {
    await conn.query(ddl);
    console.log(`  ✅ Added column ${table}.${column}`);
    return true;
  }
  console.log(`  ⏭  ${table}.${column} already exists`);
  return false;
}

/** Check if an index exists, run DDL if not. */
async function addIndexIfMissing(conn, table, indexName, ddl) {
  const [rows] = await conn.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = '${indexName}';`);
  if (rows.length === 0) {
    await conn.query(ddl);
    console.log(`  ✅ Added index ${indexName} on ${table}`);
    return true;
  }
  console.log(`  ⏭  Index ${indexName} on ${table} already exists`);
  return false;
}

async function run() {
  const conn = await getConn();
  console.log('✅ Connected to MySQL\n');

  try {
    // ── Phase 1–3: roles.role VARCHAR(64) ────────────────────────────────────
    console.log('--- users.role VARCHAR(64) ---');
    await conn.query(
      "ALTER TABLE users MODIFY COLUMN role VARCHAR(64) NOT NULL DEFAULT 'staff';"
    ).catch(e => console.log('  ⚠️ ', e.message));

    // ── Phase 3: patient_type ENUM ────────────────────────────────────────────
    console.log('--- patients.patient_type ENUM ---');
    await conn.query(
      "ALTER TABLE patients MODIFY COLUMN patient_type ENUM('pregnant','immunization','both') NOT NULL;"
    ).catch(e => console.log('  ⚠️ ', e.message));

    // ── Phase 3 / Step 12: delivery clinical fields ───────────────────────────
    console.log('--- patients delivery fields ---');
    await addColumnIfMissing(conn, 'patients', 'delivery_mode',  "ALTER TABLE patients ADD COLUMN delivery_mode  VARCHAR(30)    NULL");
    await addColumnIfMissing(conn, 'patients', 'birth_weight',   "ALTER TABLE patients ADD COLUMN birth_weight   DECIMAL(5,2)   NULL");
    await addColumnIfMissing(conn, 'patients', 'apgar_1min',     "ALTER TABLE patients ADD COLUMN apgar_1min     INT            NULL");
    await addColumnIfMissing(conn, 'patients', 'apgar_5min',     "ALTER TABLE patients ADD COLUMN apgar_5min     INT            NULL");
    await addColumnIfMissing(conn, 'patients', 'delivery_notes', "ALTER TABLE patients ADD COLUMN delivery_notes TEXT           NULL");

    // ── Phase 4 / Step 14: patient_history event_type ENUM ───────────────────
    console.log('--- patient_history.event_type ENUM ---');
    await conn.query(
      "ALTER TABLE patient_history MODIFY COLUMN event_type ENUM('stage_visited','stage_skipped','stage_rescheduled','edd_updated','delivery_recorded','hospital_transferred','patient_edited','patient_status_changed','note_added') NOT NULL;"
    ).catch(e => console.log('  ⚠️ ', e.message));

    // ── Step 12: unique (patient_id, stage_template_id) index ─────────────────
    console.log('--- patient_stages unique index ---');
    await addIndexIfMissing(
      conn, 'patient_stages', 'patient_stage_unique',
      'ALTER TABLE patient_stages ADD UNIQUE INDEX patient_stage_unique (patient_id, stage_template_id);'
    );

    // ── Phase 4: app_notifications.event_type ENUM ────────────────────────────
    console.log('--- app_notifications.event_type ENUM ---');
    await conn.query(
      "ALTER TABLE app_notifications MODIFY COLUMN event_type ENUM('patient_registered','visit_marked','stage_skipped','stage_rescheduled','delivery_recorded','edd_updated','batch_run','patient_edited','platform_announcement','subscription_upgraded','subscription_rejected') NOT NULL;"
    ).catch(e => console.log('  ⚠️ ', e.message));

    // ── Phase 4: notifications actor attribution ──────────────────────────────
    console.log('--- notifications sent_by columns ---');
    await addColumnIfMissing(conn, 'notifications', 'sent_by',      'ALTER TABLE notifications ADD COLUMN sent_by      INT          NULL');
    await addColumnIfMissing(conn, 'notifications', 'sent_by_name', 'ALTER TABLE notifications ADD COLUMN sent_by_name VARCHAR(100) NULL');

    // ── Phase 4: system_configs timezone + cron tracking ─────────────────────
    console.log('--- system_configs new columns ---');
    await addColumnIfMissing(conn, 'system_configs', 'timezone',            "ALTER TABLE system_configs ADD COLUMN timezone            VARCHAR(64)  NOT NULL DEFAULT 'Asia/Kolkata'");
    await addColumnIfMissing(conn, 'system_configs', 'last_batch_run_date', 'ALTER TABLE system_configs ADD COLUMN last_batch_run_date  VARCHAR(10)  NULL');
    await addColumnIfMissing(conn, 'system_configs', 'last_batch_run_at',   'ALTER TABLE system_configs ADD COLUMN last_batch_run_at    DATETIME     NULL');

    // ── Phase 5: subscriptions.billing_cycle column ───────────────────────────
    console.log('--- subscriptions.billing_cycle ---');
    await addColumnIfMissing(
      conn, 'subscriptions', 'billing_cycle',
      "ALTER TABLE subscriptions ADD COLUMN billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly';"
    );

    // ── Phase 5: derive billing cycle from legacy plan names ──────────────────
    console.log('--- subscriptions billing_cycle data migration ---');
    await conn.query(`
      UPDATE subscriptions
      SET billing_cycle = CASE
        WHEN plan = 'monthly'                             THEN 'monthly'
        WHEN plan = 'quarterly'                           THEN 'quarterly'
        WHEN plan IN ('yearly','annual','custom','migrated') THEN 'yearly'
        WHEN billing_cycle IN ('monthly','quarterly','yearly') THEN billing_cycle
        ELSE 'monthly'
      END
    `).catch(e => console.log('  ⚠️ ', e.message));

    // ── Phase 5: rewrite legacy plan names to canonical values ────────────────
    console.log('--- subscriptions plan data migration ---');
    await conn.query(`
      UPDATE subscriptions
      SET plan = CASE
        WHEN plan = 'monthly'                             THEN 'starter'
        WHEN plan = 'quarterly'                           THEN 'professional'
        WHEN plan IN ('yearly','annual','custom','migrated') THEN 'enterprise'
        WHEN plan IN ('free_trial','starter','professional','enterprise') THEN plan
        ELSE 'professional'
      END
    `).catch(e => console.log('  ⚠️ ', e.message));

    // ── Phase 5: subscription_requests billing_cycle enum expansion ───────────
    console.log('--- subscription_requests billing_cycle enum ---');
    await conn.query(
      "ALTER TABLE subscription_requests MODIFY COLUMN billing_cycle ENUM('monthly','quarterly','annual','yearly') NOT NULL DEFAULT 'monthly';"
    ).catch(e => console.log('  ⚠️ ', e.message));
    await conn.query(
      "UPDATE subscription_requests SET billing_cycle='yearly' WHERE billing_cycle='annual';"
    ).catch(e => console.log('  ⚠️ ', e.message));
    await conn.query(
      "ALTER TABLE subscription_requests MODIFY COLUMN billing_cycle ENUM('monthly','quarterly','yearly') NOT NULL DEFAULT 'monthly';"
    ).catch(e => console.log('  ⚠️ ', e.message));

    // ── Phase 5: subscription_requests plan migration ─────────────────────────
    console.log('--- subscription_requests plan data migration ---');
    await conn.query(`
      UPDATE subscription_requests
      SET requested_plan = CASE
            WHEN requested_plan = 'monthly'    THEN 'starter'
            WHEN requested_plan = 'quarterly'  THEN 'professional'
            WHEN requested_plan IN ('yearly','annual','custom','migrated') THEN 'enterprise'
            WHEN requested_plan IN ('free_trial','starter','professional','enterprise') THEN requested_plan
            ELSE 'professional'
          END,
          current_plan = CASE
            WHEN current_plan = 'monthly'    THEN 'starter'
            WHEN current_plan = 'quarterly'  THEN 'professional'
            WHEN current_plan IN ('yearly','annual','custom','migrated') THEN 'enterprise'
            WHEN current_plan IN ('free_trial','starter','professional','enterprise') THEN current_plan
            ELSE 'free_trial'
          END
    `).catch(e => console.log('  ⚠️ ', e.message));

    // ── Phase 5: patient_stages.skip_reason TEXT ──────────────────────────────
    console.log('--- patient_stages.skip_reason TEXT ---');
    await conn.query(
      'ALTER TABLE patient_stages MODIFY COLUMN skip_reason TEXT;'
    ).catch(e => console.log('  ⚠️ ', e.message));

    // ── Phase 5: users.force_password_change column ───────────────────────────
    console.log('--- users.force_password_change ---');
    await addColumnIfMissing(
      conn, 'users', 'force_password_change',
      'ALTER TABLE users ADD COLUMN force_password_change TINYINT(1) NOT NULL DEFAULT 0;'
    );

    console.log('\n🎉 Schema migration complete!\n');
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});

