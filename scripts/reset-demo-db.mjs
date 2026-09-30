#!/usr/bin/env node
/**
 * reset-demo-db.mjs
 * 
 * Renames the database from 'wellnest' → 'tinitracker' (if needed),
 * wipes all data, and inserts:
 *   1. One provider admin superaccount
 *   2. One demo hospital with an ACTIVE subscription (not free trial)
 *   3. Default roles + stage templates (seeded automatically on server start)
 * 
 * Run: node scripts/reset-demo-db.mjs
 */

import { execSync } from 'child_process';
import { createConnection } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// ── Load .env.local manually ───────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// NOTE: This path is only used if you call mysql CLI directly. The mysql2 connection uses DB_* env vars.
const MYSQL = process.env.MYSQL_BIN || '/usr/local/mysql/bin/mysql';

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306');
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || '';
const DB_NAME = process.env.DB_NAME || 'tinitracker';

// ── Demo credentials (what the user will use) ─────────────────────────────
const PROVIDER_EMAIL    = process.env.PROVIDER_ADMIN_EMAIL    || 'admin@tinitracker.in';
const PROVIDER_PASSWORD = process.env.PROVIDER_ADMIN_PASSWORD || 'TiniTrack@Admin2025';
const PROVIDER_NAME     = process.env.PROVIDER_ADMIN_NAME     || 'TiniTracker Superadmin';

const DEMO_HOSPITAL_NAME  = 'TiniTracker Demo Hospital';
const DEMO_HOSPITAL_EMAIL = 'demo@tinitracker.in';
const DEMO_HOSPITAL_CITY  = 'Mumbai';
const DEMO_HOSPITAL_PHONE = '+91 9876543210';

// Demo credentials — intentionally public, for seeding the demo environment only.
const DEMO_ADMIN_NAME     = 'Demo Admin';
const DEMO_ADMIN_EMAIL    = 'demo.admin@tinitracker.in';
const DEMO_ADMIN_PASSWORD = 'DemoAdmin@2025';

const conn = await createConnection({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASS,
  multipleStatements: true,
});

console.log('✅ Connected to MySQL');

// ── Step 1: Ensure tinitracker DB exists (rename from wellnest if needed) ──
const [dbs] = await conn.query(`SHOW DATABASES LIKE '${DB_NAME}'`);
if (dbs.length === 0) {
  // Check if old 'wellnest' DB exists
  const [oldDbs] = await conn.query(`SHOW DATABASES LIKE 'wellnest'`);
  if (oldDbs.length > 0) {
    console.log('🔄 Found old wellnest DB — creating tinitracker and migrating tables...');
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    // Get all tables from wellnest
    await conn.changeUser({ database: 'wellnest' });
    const [tables] = await conn.query(`SHOW TABLES`);
    const tableNames = tables.map(r => Object.values(r)[0]);
    await conn.changeUser({ database: DB_NAME });
    for (const table of tableNames) {
      await conn.query(`CREATE TABLE \`${DB_NAME}\`.\`${table}\` LIKE \`wellnest\`.\`${table}\``);
      await conn.query(`INSERT INTO \`${DB_NAME}\`.\`${table}\` SELECT * FROM \`wellnest\`.\`${table}\``);
      console.log(`  ↳ Migrated table: ${table}`);
    }
    console.log('✅ Migration complete. Old wellnest DB preserved (you can drop it manually).');
  } else {
    console.log(`📦 Creating new database: ${DB_NAME}`);
    await conn.query(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
} else {
  console.log(`✅ Database '${DB_NAME}' already exists`);
}

await conn.changeUser({ database: DB_NAME });

// ── Step 2: Check tables exist (server must have run at least once) ─────────
const [tables] = await conn.query(`SHOW TABLES`);
if (tables.length === 0) {
  console.error('❌ No tables found in the database!');
  console.error('   Please start the Next.js server once first (npm run dev) so Sequelize can sync the schema,');
  console.error('   then run this script again.');
  await conn.end();
  process.exit(1);
}

const tableNames = tables.map(r => Object.values(r)[0]);
console.log(`📋 Found ${tableNames.length} tables in ${DB_NAME}`);

// ── Step 3: WIPE all data (preserve schema) ──────────────────────────────
console.log('\n🗑️  Wiping all data...');
await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);
for (const table of tableNames) {
  await conn.query(`TRUNCATE TABLE \`${table}\``);
  process.stdout.write(`  ↳ Cleared: ${table}\n`);
}
await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);
console.log('✅ All tables cleared\n');

// ── Step 4: Seed Provider Admin ───────────────────────────────────────────
console.log('🛡️  Seeding provider admin...');
const providerHash = await bcrypt.hash(PROVIDER_PASSWORD, 12);
await conn.query(`
  INSERT INTO provider_admins (name, email, password_hash, role, is_blocked, createdAt, updatedAt)
  VALUES (?, ?, ?, 'superadmin', 0, NOW(), NOW())
`, [PROVIDER_NAME, PROVIDER_EMAIL, providerHash]);
console.log(`  ↳ Provider admin: ${PROVIDER_EMAIL}`);

// ── Step 5: Seed Demo Hospital ────────────────────────────────────────────
console.log('\n🏥 Seeding demo hospital...');
await conn.query(`
  INSERT INTO hospitals (
    name, phone, address,
    is_blocked, createdAt, updatedAt
  )
  VALUES (?, ?, ?, 0, NOW(), NOW())
`, [DEMO_HOSPITAL_NAME, DEMO_HOSPITAL_PHONE, 'Demo Clinic, Andheri West, Mumbai - 400058']);

const [[hospitalRow]] = await conn.query(`SELECT id FROM hospitals WHERE name = ?`, [DEMO_HOSPITAL_NAME]);
const hospitalId = hospitalRow.id;
console.log(`  ↳ Hospital created: ${DEMO_HOSPITAL_NAME} (ID: ${hospitalId})`);

// ── Step 6: Seed Active Subscription (not free trial) ────────────────────
const today = new Date();
const nextYear = new Date(today);
nextYear.setFullYear(nextYear.getFullYear() + 1);
const fmtDate = d => d.toISOString().slice(0, 10);

await conn.query(`
  INSERT INTO subscriptions (
    hospital_id, plan, is_active,
    starts_at, ends_at,
    createdAt, updatedAt
  )
  VALUES (?, 'monthly', 1, ?, ?, NOW(), NOW())
`, [hospitalId, fmtDate(today), fmtDate(nextYear)]);
console.log(`  ↳ Active subscription: monthly plan, valid until ${fmtDate(nextYear)}`);

// ── Step 7: Seed Demo Hospital Admin User ─────────────────────────────────
console.log('\n👤 Seeding demo hospital admin user...');
const adminHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 12);
await conn.query(`
  INSERT INTO users (
    hospital_id, name, email, password_hash,
    role, force_password_change, is_blocked,
    createdAt, updatedAt
  )
  VALUES (?, ?, ?, ?, 'admin', 0, 0, NOW(), NOW())
`, [hospitalId, DEMO_ADMIN_NAME, DEMO_ADMIN_EMAIL, adminHash]);
console.log(`  ↳ Hospital admin: ${DEMO_ADMIN_EMAIL}`);


// ── Done ──────────────────────────────────────────────────────────────────
await conn.end();

console.log('\n' + '═'.repeat(60));
console.log('✅  DATABASE RESET COMPLETE — TiniTracker Demo Ready');
console.log('═'.repeat(60));
console.log('\n📋 DEMO CREDENTIALS:\n');
console.log('  🛡️  PROVIDER ADMIN (tinitracker-admin dashboard):');
console.log(`      URL:      http://localhost:3001`);
console.log(`      Email:    ${PROVIDER_EMAIL}`);
console.log(`      Password: ${PROVIDER_PASSWORD}`);
console.log('\n  🏥 DEMO HOSPITAL ADMIN (tinitracker-next app):');
console.log(`      URL:      http://localhost:3000`);
console.log(`      Email:    ${DEMO_ADMIN_EMAIL}`);
console.log(`      Password: ${DEMO_ADMIN_PASSWORD}`);
console.log(`      Hospital: ${DEMO_HOSPITAL_NAME}`);
console.log('\n⚠️  NEXT STEP: Restart the Next.js server so stage templates');
console.log('   and default roles get seeded automatically on boot.');
console.log('═'.repeat(60) + '\n');
