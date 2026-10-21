/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  migrate-wellnest-hospital.mjs
 *  WellNest -> TiniTracker Next  |  One-Hospital Migration Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  USAGE:
 *    node scripts/migrate-wellnest-hospital.mjs --file=./wellnest_fresh.sql
 *    node scripts/migrate-wellnest-hospital.mjs --demo
 *    node scripts/migrate-wellnest-hospital.mjs --demo --dry-run
 *
 *  FLAGS:
 *    --file=<path>   Path to exported MySQL dump from old WellNest server
 *    --demo          Creates a DEMO hospital with fake credentials for testing
 *    --dry-run       Parse + report only, write nothing to DB
 *
 *  SAFE TO RE-RUN: fully idempotent - checks before inserting, won't duplicate.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs        from 'fs';
import path      from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

// Load .env.local manually (script runs outside Next.js context)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const envPath    = path.resolve(__dirname, '../.env.local');

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
  console.log('Loaded .env.local\n');
} else {
  console.error('ERROR: .env.local not found. Cannot connect to DB.');
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name) => {
  const found = args.find(a => a.startsWith('--' + name + '='));
  return found ? found.split('=').slice(1).join('=') : null;
};
const hasFlag = (name) => args.includes('--' + name);

const sqlFilePath = getArg('file');
const isDemo      = hasFlag('demo');
const isDryRun    = hasFlag('dry-run');

// --demo can be used alone (generates synthetic patients) or with --file (also imports real patients into demo hospital)
if (!sqlFilePath && !isDemo) {
  console.error('Usage: node scripts/migrate-wellnest-hospital.mjs --file=./wellnest_fresh.sql [--demo] [--dry-run]');
  process.exit(1);
}

// Allowed notification types in the new TiniTracker schema
const VALID_NOTIF_TYPES = new Set(['reminder_7d','reminder_1d','reminder_today','missed','manual','stage_complete','edd_updated','delivery_recorded']);
function sanitizeNotifType(t) {
  return VALID_NOTIF_TYPES.has(t) ? t : 'manual';
}

// ─── SQL PARSER ──────────────────────────────────────────────────────────────

function parseSqlInserts(sqlText, tableName) {
  const results = [];
  const blockRegex = new RegExp(
    'INSERT INTO `' + tableName + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]+?);',
    'gi'
  );
  let blockMatch;
  while ((blockMatch = blockRegex.exec(sqlText)) !== null) {
    const columns  = blockMatch[1].split(',').map(c => c.trim().replace(/`/g, ''));
    const tuples   = splitValueTuples(blockMatch[2]);
    for (const tuple of tuples) {
      const values = parseValueTuple(tuple);
      if (values.length !== columns.length) continue;
      const row = {};
      columns.forEach((col, i) => { row[col] = values[i]; });
      results.push(row);
    }
  }
  return results;
}

function splitValueTuples(valuesPart) {
  const tuples = [];
  let depth = 0, inStr = false, strChar = '', start = -1, i = 0;
  while (i < valuesPart.length) {
    const ch = valuesPart[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === strChar) inStr = false;
    } else {
      if (ch === "'" || ch === '"') { inStr = true; strChar = ch; }
      else if (ch === '(') { depth++; if (depth === 1) start = i; }
      else if (ch === ')') {
        depth--;
        if (depth === 0 && start !== -1) { tuples.push(valuesPart.slice(start + 1, i)); start = -1; }
      }
    }
    i++;
  }
  return tuples;
}

function parseValueTuple(tupleStr) {
  const values = [];
  let inStr = false, strChar = '', current = '', i = 0;
  const flush = () => {
    const v = current.trim();
    if (v.toUpperCase() === 'NULL') values.push(null);
    else if (/^-?\d+$/.test(v)) values.push(parseInt(v, 10));
    else if (/^-?\d+\.\d+$/.test(v)) values.push(parseFloat(v));
    else values.push(v);
    current = '';
  };
  while (i < tupleStr.length) {
    const ch = tupleStr[i];
    if (inStr) {
      if (ch === '\\' && i + 1 < tupleStr.length) {
        const nx = tupleStr[i + 1];
        if      (nx === 'n')  { current += '\n'; i += 2; continue; }
        else if (nx === 't')  { current += '\t'; i += 2; continue; }
        else if (nx === 'r')  { current += '\r'; i += 2; continue; }
        else if (nx === "'")  { current += "'";  i += 2; continue; }
        else if (nx === '"')  { current += '"';  i += 2; continue; }
        else if (nx === '\\') { current += '\\'; i += 2; continue; }
        else { current += ch; }
      } else if (ch === strChar) {
        if (i + 1 < tupleStr.length && tupleStr[i + 1] === strChar) { current += ch; i += 2; continue; }
        inStr = false;
      } else { current += ch; }
    } else {
      if (ch === "'" || ch === '"') { inStr = true; strChar = ch; }
      else if (ch === ',') { flush(); }
      else { current += ch; }
    }
    i++;
  }
  flush();
  return values;
}

// ─── DEMO DATA ───────────────────────────────────────────────────────────────
// Demo password is: Demo@1234

function buildDemoSqlText() {
  return `
INSERT INTO \`hospitals\` (\`id\`, \`name\`, \`address\`, \`phone\`, \`whatsapp_sender_id\`, \`whatsapp_api_url\`, \`whatsapp_api_key\`, \`whatsapp_api_provider\`, \`createdAt\`, \`updatedAt\`) VALUES
(99, 'Demo City Hospital', '123 Demo Street, Demo City', '+910000000001', NULL, NULL, NULL, NULL, '2026-09-21 08:34:16', '2026-09-21 08:34:16');

INSERT INTO \`users\` (\`id\`, \`hospital_id\`, \`name\`, \`email\`, \`password_hash\`, \`role\`, \`createdAt\`, \`updatedAt\`) VALUES
(199, 99, 'Demo Admin', 'demo@demohospital.in', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiRqM3e4fGbW6eeFlKOahKzBlHfy', 'superadmin', '2026-09-21 08:34:17', '2026-09-21 08:34:17');

INSERT INTO \`patients\` (\`id\`, \`hospital_id\`, \`whatsapp_number\`, \`name\`, \`age\`, \`address\`, \`patient_type\`, \`lmp_date\`, \`edd\`, \`edd_source\`, \`edd_last_updated\`, \`ultrasound_scan_date\`, \`delivery_date\`, \`child_dob\`, \`child_name\`, \`child_gender\`, \`status\`, \`registered_by\`, \`notes\`, \`createdAt\`, \`updatedAt\`) VALUES
(501, 99, '+910000000101', 'Priya Demo', 25, 'Demo Nagar', 'pregnant', '2026-03-01', '2026-12-06', 'lmp_calculated', '2026-09-21 08:35:54', NULL, NULL, NULL, NULL, NULL, 'active', 199, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(502, 99, '+910000000102', 'Sunita Demo', 28, 'Demo Colony', 'pregnant', '2026-01-15', '2026-10-22', 'lmp_calculated', '2026-09-21 08:36:00', NULL, NULL, NULL, NULL, NULL, 'active', 199, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(503, 99, '+910000000103', 'Baby Demo Child', 30, 'Demo Layout', 'immunization', NULL, NULL, 'direct_entry', NULL, NULL, NULL, '2026-09-01', 'Baby D', 'female', 'active', 199, NULL, '2026-09-21 08:37:00', '2026-09-21 08:37:00');

INSERT INTO \`patient_stages\` (\`id\`, \`patient_id\`, \`stage_template_id\`, \`status\`, \`scheduled_date\`, \`actual_visit_date\`, \`date_overridden\`, \`override_reason\`, \`skip_reason\`, \`stage_data\`, \`notes\`, \`recorded_by\`, \`createdAt\`, \`updatedAt\`) VALUES
(9001, 501, 1, 'skipped', '2026-05-24', NULL, 0, NULL, 'pre_registration', NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(9002, 501, 2, 'skipped', '2026-06-21', NULL, 0, NULL, 'pre_registration', NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(9003, 501, 3, 'missed', '2026-08-23', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-22 08:00:00'),
(9004, 501, 4, 'pending', '2026-09-13', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(9005, 501, 5, 'pending', '2026-10-04', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(9006, 501, 6, 'pending', '2026-10-25', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(9007, 501, 7, 'pending', '2026-11-08', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(9008, 501, 8, 'pending', '2026-11-22', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(9009, 501, 9, 'pending', '2026-12-06', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(9010, 501, 10, 'pending', '2026-12-06', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:35:54', '2026-09-21 08:35:54'),
(9011, 502, 1, 'skipped', '2026-04-09', NULL, 0, NULL, 'pre_registration', NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(9012, 502, 2, 'skipped', '2026-05-07', NULL, 0, NULL, 'pre_registration', NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(9013, 502, 3, 'missed', '2026-07-09', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-22 08:00:00'),
(9014, 502, 4, 'pending', '2026-07-30', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(9015, 502, 5, 'pending', '2026-08-20', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(9016, 502, 6, 'pending', '2026-09-10', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(9017, 502, 7, 'pending', '2026-09-24', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(9018, 502, 8, 'notified', '2026-10-08', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(9019, 502, 9, 'pending', '2026-10-22', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(9020, 502, 10, 'pending', '2026-10-22', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:36:00', '2026-09-21 08:36:00'),
(9021, 503, 11, 'visited', '2026-09-01', '2026-09-01', 0, NULL, NULL, NULL, NULL, 199, '2026-09-21 08:37:00', '2026-09-21 08:37:00'),
(9022, 503, 12, 'notified', '2026-10-13', NULL, 0, NULL, NULL, NULL, NULL, NULL, '2026-09-21 08:37:00', '2026-09-21 08:37:00');

INSERT INTO \`notifications\` (\`id\`, \`patient_id\`, \`patient_stage_id\`, \`type\`, \`whatsapp_number\`, \`message_body\`, \`status\`, \`provider_message_id\`, \`sent_at\`, \`delivered_at\`, \`createdAt\`, \`updatedAt\`) VALUES
(8001, 501, 9003, 'missed', '+910000000101', 'Hello Priya Demo, you missed your 25-week checkup.', 'sent', NULL, '2026-09-22 08:00:00', NULL, '2026-09-22 08:00:00', '2026-09-22 08:00:00'),
(8002, 502, 9013, 'missed', '+910000000102', 'Hello Sunita Demo, you missed your 25-week checkup.', 'sent', NULL, '2026-09-22 08:00:00', NULL, '2026-09-22 08:00:00', '2026-09-22 08:00:00');
`;
}

// ─── DB CONNECTION ────────────────────────────────────────────────────────────

async function getConnection() {
  const require = createRequire(import.meta.url);
  const mysql2  = require('mysql2/promise');
  return mysql2.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASS     || '',
    database: process.env.DB_NAME     || 'tinitracker',
  });
}

// ─── RBAC + SYSTEM CONFIG SEEDER ─────────────────────────────────────────────

const DEFAULT_ROLES = [
  { key: 'admin',               name: 'Hospital Admin',         dept: 'Staff & Hospital Administration', description: 'Full administrative control', color: '#7e22ce', bg: '#f3e8ff', border: '#e9d5ff' },
  { key: 'staff',               name: 'Clinical Staff',         dept: 'Outreach & Care Coordination',   description: 'Patient registration and visit tracking', color: '#00857c', bg: '#e8f7f2', border: '#c4e9de' },
  { key: 'doctor_pregnancy',    name: 'Doctor - Pregnancy',     dept: 'Maternal & Antenatal Care',      description: 'Antenatal mothers and pregnancy stage care', color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' },
  { key: 'doctor_immunization', name: 'Doctor - Immunization',  dept: 'Pediatric Immunization',         description: 'Infants and childhood vaccination tracking', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
];

const ALL_PERMISSIONS = [
  'patients.view','patients.create','patients.edit','patients.delete','patients.view_all_types',
  'stages.mark_visit','stages.skip','stages.reschedule','stages.record_delivery',
  'notifications.view','notifications.send_manual','notifications.trigger_batch',
  'activity.view',
  'staff.view','staff.create','staff.edit',
  'settings.view','settings.manage_roles','settings.edit_system','settings.edit_hospital',
];

const ROLE_PERMISSIONS = {
  admin:               ALL_PERMISSIONS.reduce((a, k) => { a[k] = true; return a; }, {}),
  staff:               { 'patients.view':true,'patients.create':true,'patients.edit':true,'patients.delete':false,'patients.view_all_types':true,'stages.mark_visit':true,'stages.skip':true,'stages.reschedule':true,'stages.record_delivery':true,'notifications.view':true,'notifications.send_manual':true,'notifications.trigger_batch':true,'activity.view':true,'staff.view':true,'staff.create':false,'staff.edit':false,'settings.view':false,'settings.manage_roles':false,'settings.edit_system':false,'settings.edit_hospital':false },
  doctor_pregnancy:    { 'patients.view':true,'patients.create':true,'patients.edit':true,'patients.delete':false,'patients.view_all_types':false,'stages.mark_visit':true,'stages.skip':true,'stages.reschedule':true,'stages.record_delivery':true,'notifications.view':true,'notifications.send_manual':false,'notifications.trigger_batch':false,'activity.view':true,'staff.view':false,'staff.create':false,'staff.edit':false,'settings.view':false,'settings.manage_roles':false,'settings.edit_system':false,'settings.edit_hospital':false },
  doctor_immunization: { 'patients.view':true,'patients.create':true,'patients.edit':true,'patients.delete':false,'patients.view_all_types':false,'stages.mark_visit':true,'stages.skip':true,'stages.reschedule':true,'stages.record_delivery':true,'notifications.view':true,'notifications.send_manual':false,'notifications.trigger_batch':false,'activity.view':true,'staff.view':false,'staff.create':false,'staff.edit':false,'settings.view':false,'settings.manage_roles':false,'settings.edit_system':false,'settings.edit_hospital':false },
};

async function seedRbac(conn, hospitalId) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // SystemConfig
  const [cfgRows] = await conn.execute('SELECT id FROM system_configs WHERE hospital_id = ? LIMIT 1', [hospitalId]);
  if (cfgRows.length === 0) {
    await conn.execute(
      "INSERT INTO system_configs (hospital_id, batch_cron_time, batch_auto_run, reminder_7d_enabled, reminder_1d_enabled, reminder_today_enabled, missed_flag_enabled, createdAt, updatedAt) VALUES (?, '08:00', 1, 1, 1, 1, 1, ?, ?)",
      [hospitalId, now, now]
    );
    console.log('   SystemConfig: created');
  } else {
    console.log('   SystemConfig: already exists, skipped');
  }

  // Roles
  for (const r of DEFAULT_ROLES) {
    const [ex] = await conn.execute('SELECT id FROM roles WHERE hospital_id = ? AND `key` = ? LIMIT 1', [hospitalId, r.key]);
    if (ex.length === 0) {
      await conn.execute(
        'INSERT INTO roles (hospital_id, `key`, name, description, dept, color, bg, border, is_system, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
        [hospitalId, r.key, r.name, r.description, r.dept, r.color, r.bg, r.border, now, now]
      );
    }
  }
  console.log('   Roles: 4 default roles seeded');

  // Permissions
  let permCount = 0;
  for (const [roleKey, perms] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permKey of ALL_PERMISSIONS) {
      const [ex] = await conn.execute(
        'SELECT id FROM role_permissions WHERE hospital_id = ? AND role_key = ? AND permission_key = ? LIMIT 1',
        [hospitalId, roleKey, permKey]
      );
      if (ex.length === 0) {
        await conn.execute(
          'INSERT INTO role_permissions (hospital_id, role_key, permission_key, enabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
          [hospitalId, roleKey, permKey, perms[permKey] ? 1 : 0, now, now]
        );
        permCount++;
      }
    }
  }
  console.log('   RolePermissions: ' + permCount + ' inserted');
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function migrate() {
  console.log('='.repeat(65));
  console.log(' WellNest -> TiniTracker Next  |  Hospital Migration Script');
  console.log('='.repeat(65));
  if (isDryRun) console.log('\nDRY RUN MODE - no data will be written\n');
  if (isDemo)   console.log('\nDEMO MODE - using synthetic demo hospital data\n');

  // Load SQL
  let sqlText;         // primary source (demo stub or real file)
  let realSqlText = null; // real wellnest.sql when --demo is combined with --file

  if (isDemo) {
    sqlText = buildDemoSqlText();
    console.log('Demo SQL data generated\n');
    // If a real SQL file was also provided, load it so we can import real patients into demo hospital
    if (sqlFilePath) {
      const resolved = path.resolve(sqlFilePath);
      if (fs.existsSync(resolved)) {
        realSqlText = fs.readFileSync(resolved, 'utf8');
        console.log('Real SQL file also loaded for demo patient import: ' + resolved + ' (' + (realSqlText.length / 1024).toFixed(1) + ' KB)\n');
      }
    } else {
      // Auto-detect wellnest.sql in the project root
      const autoPath = path.resolve(__dirname, '../wellnest.sql');
      if (fs.existsSync(autoPath)) {
        realSqlText = fs.readFileSync(autoPath, 'utf8');
        console.log('Auto-loaded wellnest.sql for demo patient import (' + (realSqlText.length / 1024).toFixed(1) + ' KB)\n');
      }
    }
  } else {
    const resolved = path.resolve(sqlFilePath);
    if (!fs.existsSync(resolved)) { console.error('ERROR: File not found: ' + resolved); process.exit(1); }
    sqlText = fs.readFileSync(resolved, 'utf8');
    console.log('SQL file loaded: ' + resolved + ' (' + (sqlText.length / 1024).toFixed(1) + ' KB)\n');
  }

  // Parse primary source (demo stub or real file)
  console.log('Parsing SQL dump...');
  const oldHospitals     = parseSqlInserts(sqlText, 'hospitals');
  const oldUsers         = parseSqlInserts(sqlText, 'users');
  const oldPatients      = parseSqlInserts(sqlText, 'patients');
  const oldStages        = parseSqlInserts(sqlText, 'patient_stages');
  const oldNotifications = parseSqlInserts(sqlText, 'notifications');
  console.log('  Hospitals    : ' + oldHospitals.length);
  console.log('  Users        : ' + oldUsers.length);
  console.log('  Patients     : ' + oldPatients.length);
  console.log('  PatientStages: ' + oldStages.length);
  console.log('  Notifications: ' + oldNotifications.length);

  // Also parse real patients from wellnest.sql if in demo mode
  let realPatients = [], realStages = [], realNotifications = [];
  let realOldStageTemplates = [];
  if (isDemo && realSqlText) {
    console.log('\nParsing real wellnest.sql for demo patient import...');
    realPatients      = parseSqlInserts(realSqlText, 'patients');
    realStages        = parseSqlInserts(realSqlText, 'patient_stages');
    realNotifications = parseSqlInserts(realSqlText, 'notifications');
    realOldStageTemplates = parseSqlInserts(realSqlText, 'stage_templates');
    console.log('  Real Patients     : ' + realPatients.length);
    console.log('  Real PatientStages: ' + realStages.length);
    console.log('  Real Notifications: ' + realNotifications.length);
  }

  if (!oldHospitals.length || !oldUsers.length || !oldPatients.length) {
    console.error('\nERROR: Parsed data incomplete. Check SQL file structure.');
    process.exit(1);
  }

  if (isDryRun) { console.log('\nDry run complete - no data written.'); process.exit(0); }

  // Connect
  console.log('\nConnecting to TiniTracker Next DB...');
  let conn;
  try {
    conn = await getConnection();
    await conn.execute('SELECT 1');
    console.log('  Connected to ' + process.env.DB_NAME + '@' + process.env.DB_HOST + '\n');
  } catch (err) {
    console.error('ERROR: DB connection failed: ' + err.message);
    process.exit(1);
  }

  try {
    // Verify + map stage_templates
    console.log('Verifying stage_templates...');
    const [stRows] = await conn.execute('SELECT id, stage_code FROM stage_templates');
    if (!stRows.length) {
      console.error('ERROR: stage_templates is EMPTY. Run: node scripts/reset-demo-db.mjs first');
      process.exit(1);
    }
    const stageCodeToNewId = {};
    stRows.forEach(r => { stageCodeToNewId[r.stage_code] = r.id; });

    const oldStageTemplates     = parseSqlInserts(sqlText, 'stage_templates');
    const oldStTemplIdToCode    = {};
    oldStageTemplates.forEach(t => { oldStTemplIdToCode[t.id] = t.stage_code; });

    const allOldTemplIds = [...new Set(oldStages.map(s => s.stage_template_id))];
    const stageTemplateIdMap = {};
    for (const oldId of allOldTemplIds) {
      const code = oldStTemplIdToCode[oldId];
      stageTemplateIdMap[oldId] = code && stageCodeToNewId[code] ? stageCodeToNewId[code] : oldId;
    }
    console.log('  ' + stRows.length + ' templates found in new DB\n');

    // Process each hospital
    for (const oldHosp of oldHospitals) {
      console.log('-'.repeat(65));
      console.log('Hospital: "' + oldHosp.name + '" (old ID: ' + oldHosp.id + ')');

      const hospUsers  = oldUsers.filter(u => u.hospital_id === oldHosp.id);
      const primaryUser = hospUsers[0];
      if (!primaryUser) { console.log('  WARNING: No users found for this hospital, skipping'); continue; }

      // Check if already migrated
      const [exUsers] = await conn.execute('SELECT id, hospital_id FROM users WHERE email = ? LIMIT 1', [primaryUser.email]);

      let newHospitalId, newPrimaryUserId;

      if (exUsers.length > 0) {
        newHospitalId    = exUsers[0].hospital_id;
        newPrimaryUserId = exUsers[0].id;
        console.log('  Already migrated (email: ' + primaryUser.email + ')');
        console.log('  Existing hospital_id: ' + newHospitalId + ', user_id: ' + newPrimaryUserId);
      } else {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Insert Hospital
        const [hRes] = await conn.execute(
          'INSERT INTO hospitals (name, address, phone, whatsapp_sender_id, whatsapp_api_url, whatsapp_api_key, whatsapp_api_provider, is_blocked, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
          [oldHosp.name, oldHosp.address||null, oldHosp.phone||null, oldHosp.whatsapp_sender_id||null, oldHosp.whatsapp_api_url||null, oldHosp.whatsapp_api_key||null, oldHosp.whatsapp_api_provider||null, now, now]
        );
        newHospitalId = hRes.insertId;
        console.log('  Hospital inserted -> new ID: ' + newHospitalId);

        // Insert Users
        const userIdMap = {};
        for (const u of hospUsers) {
          const role = u.role === 'superadmin' ? 'admin' : (u.role || 'staff');
          const [uRes] = await conn.execute(
            'INSERT INTO users (hospital_id, name, email, password_hash, role, force_password_change, is_blocked, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)',
            [newHospitalId, u.name, u.email, u.password_hash, role, now, now]
          );
          userIdMap[u.id] = uRes.insertId;
          console.log('  User: ' + u.email + ' -> new ID: ' + uRes.insertId + ' (role: ' + role + ', password preserved)');
        }
        newPrimaryUserId = userIdMap[primaryUser.id];

        // Create Subscription
        const endsAt = new Date(Date.now() + 365*24*60*60*1000).toISOString().slice(0,10);
        await conn.execute(
          "INSERT INTO subscriptions (hospital_id, plan, starts_at, ends_at, is_active, notes, createdAt, updatedAt) VALUES (?, 'migrated', ?, ?, 1, 'Migrated from WellNest legacy system', ?, ?)",
          [newHospitalId, now.slice(0,10), endsAt, now, now]
        );
        console.log('  Subscription: created (active until ' + endsAt + ')');
      }

      // RBAC
      console.log('\nSeeding RBAC...');
      await seedRbac(conn, newHospitalId);

      // Patients
      console.log('\nImporting patients...');
      const hospPatients = oldPatients.filter(p => p.hospital_id === oldHosp.id);
      const patientIdMap = {};
      let pIns = 0, pSkip = 0;

      for (const p of hospPatients) {
        const [exPat] = await conn.execute('SELECT id FROM patients WHERE whatsapp_number = ? LIMIT 1', [p.whatsapp_number]);
        if (exPat.length > 0) {
          patientIdMap[p.id] = exPat[0].id;
          pSkip++;
          console.log('  SKIP "' + p.name + '" (' + p.whatsapp_number + ') - already exists, new ID: ' + exPat[0].id);
          continue;
        }
        const now = new Date().toISOString().slice(0,19).replace('T',' ');
        const [pRes] = await conn.execute(
          'INSERT INTO patients (hospital_id, whatsapp_number, name, age, address, patient_type, lmp_date, edd, edd_source, edd_last_updated, ultrasound_scan_date, delivery_date, child_dob, child_name, child_gender, status, registered_by, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newHospitalId, p.whatsapp_number, p.name, p.age||null, p.address||null, p.patient_type, p.lmp_date||null, p.edd||null, p.edd_source||'lmp_calculated', p.edd_last_updated||null, p.ultrasound_scan_date||null, p.delivery_date||null, p.child_dob||null, p.child_name||null, p.child_gender||null, p.status||'active', newPrimaryUserId, p.notes||null, p.createdAt||now, p.updatedAt||now]
        );
        patientIdMap[p.id] = pRes.insertId;
        pIns++;
        console.log('  OK "' + p.name + '" -> new ID: ' + pRes.insertId);
      }
      console.log('\n  Patients: ' + pIns + ' inserted, ' + pSkip + ' already existed\n');

      // Patient Stages
      console.log('Importing patient stages...');
      const hospPatientIds = new Set(hospPatients.map(p => p.id));
      const hospStages     = oldStages.filter(s => hospPatientIds.has(s.patient_id));
      const stageIdMap = {};
      let sIns = 0, sSkip = 0, sMiss = 0;

      for (const s of hospStages) {
        const newPId = patientIdMap[s.patient_id];
        if (!newPId) { sMiss++; continue; }
        const newTId = stageTemplateIdMap[s.stage_template_id] || s.stage_template_id;
        const [exSt] = await conn.execute('SELECT id FROM patient_stages WHERE patient_id = ? AND stage_template_id = ? LIMIT 1', [newPId, newTId]);
        if (exSt.length > 0) { stageIdMap[s.id] = exSt[0].id; sSkip++; continue; }
        const now = new Date().toISOString().slice(0,19).replace('T',' ');
        const [sRes] = await conn.execute(
          'INSERT INTO patient_stages (patient_id, stage_template_id, status, scheduled_date, actual_visit_date, date_overridden, override_reason, skip_reason, stage_data, notes, recorded_by, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newPId, newTId, s.status||'pending', s.scheduled_date||null, s.actual_visit_date||null, s.date_overridden?1:0, s.override_reason||null, s.skip_reason||null, s.stage_data||null, s.notes||null, s.recorded_by?newPrimaryUserId:null, s.createdAt||now, s.updatedAt||now]
        );
        stageIdMap[s.id] = sRes.insertId;
        sIns++;
      }
      console.log('  Stages: ' + sIns + ' inserted, ' + sSkip + ' already existed, ' + sMiss + ' patient missing\n');

      // Notifications
      console.log('Importing notifications...');
      const hospNotifs = oldNotifications.filter(n => hospPatientIds.has(n.patient_id));
      let nIns = 0, nSkip = 0;

      for (const n of hospNotifs) {
        const newPId = patientIdMap[n.patient_id];
        if (!newPId) { nSkip++; continue; }
        const newSId = n.patient_stage_id ? (stageIdMap[n.patient_stage_id]||null) : null;
        const safeType = sanitizeNotifType(n.type);
        if (n.sent_at) {
          const [exN] = await conn.execute('SELECT id FROM notifications WHERE patient_id = ? AND type = ? AND sent_at = ? LIMIT 1', [newPId, safeType, n.sent_at]);
          if (exN.length > 0) { nSkip++; continue; }
        }
        const now = new Date().toISOString().slice(0,19).replace('T',' ');
        await conn.execute(
          'INSERT INTO notifications (patient_id, patient_stage_id, type, whatsapp_number, message_body, status, provider_message_id, sent_at, delivered_at, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newPId, newSId, safeType, n.whatsapp_number, n.message_body||null, n.status||'sent', n.provider_message_id||null, n.sent_at||null, n.delivered_at||null, n.createdAt||now, n.updatedAt||now]
        );
        nIns++;
      }
      console.log('  Notifications: ' + nIns + ' inserted, ' + nSkip + ' skipped\n');

      // ── Import real patients into DEMO hospital ────────────────────────────
      if (isDemo && realPatients.length > 0) {
        console.log('='.repeat(65));
        console.log('Importing REAL wellnest patients into demo hospital (hospital_id=' + newHospitalId + ')...');

        // Build stage template map for real SQL
        const realOldStTemplIdToCode = {};
        realOldStageTemplates.forEach(t => { realOldStTemplIdToCode[t.id] = t.stage_code; });
        const realStageTemplateIdMap = {};
        const allRealOldTemplIds = [...new Set(realStages.map(s => s.stage_template_id))];
        for (const oldId of allRealOldTemplIds) {
          const code = realOldStTemplIdToCode[oldId];
          realStageTemplateIdMap[oldId] = code && stageCodeToNewId[code] ? stageCodeToNewId[code] : oldId;
        }

        const realPatientIdMap = {};
        const realStageIdMap   = {};
        let rpIns = 0, rpSkip = 0;

        for (const p of realPatients) {
          // The whatsapp_number column has a GLOBAL unique constraint.
          // Real patients already exist under hospital_id=5 with their real numbers.
          // For the demo hospital, we prefix numbers with 'DEMO' to avoid conflicts
          // while still showing real patient names/stages/data.
          const demoNumber = 'DEMO' + p.whatsapp_number;

          // Check if already imported into demo hospital (idempotent)
          const [exPat] = await conn.execute('SELECT id FROM patients WHERE hospital_id = ? AND whatsapp_number = ? LIMIT 1', [newHospitalId, demoNumber]);
          if (exPat.length > 0) {
            realPatientIdMap[p.id] = exPat[0].id;
            rpSkip++;
            continue;
          }
          const now = new Date().toISOString().slice(0,19).replace('T',' ');
          const [pRes] = await conn.execute(
            'INSERT INTO patients (hospital_id, whatsapp_number, name, age, address, patient_type, lmp_date, edd, edd_source, edd_last_updated, ultrasound_scan_date, delivery_date, child_dob, child_name, child_gender, status, registered_by, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newHospitalId, demoNumber, p.name, p.age||null, p.address||null, p.patient_type, p.lmp_date||null, p.edd||null, p.edd_source||'lmp_calculated', p.edd_last_updated||null, p.ultrasound_scan_date||null, p.delivery_date||null, p.child_dob||null, p.child_name||null, p.child_gender||null, p.status||'active', newPrimaryUserId, p.notes||null, p.createdAt||now, p.updatedAt||now]
          );
          realPatientIdMap[p.id] = pRes.insertId;
          console.log('  OK "' + p.name + '" -> demo ID: ' + pRes.insertId + ' (number: ' + demoNumber + ')');
          rpIns++;
        }
        console.log('  Real Patients: ' + rpIns + ' inserted into demo hospital, ' + rpSkip + ' already existed');

        // Import stages for real patients
        let rsIns = 0, rsSkip = 0;
        const realPatientOldIds = new Set(realPatients.map(p => p.id));
        for (const s of realStages) {
          if (!realPatientOldIds.has(s.patient_id)) continue;
          const newPId = realPatientIdMap[s.patient_id];
          if (!newPId) continue;
          const newTId = realStageTemplateIdMap[s.stage_template_id] || s.stage_template_id;
          const [exSt] = await conn.execute('SELECT id FROM patient_stages WHERE patient_id = ? AND stage_template_id = ? LIMIT 1', [newPId, newTId]);
          if (exSt.length > 0) { realStageIdMap[s.id] = exSt[0].id; rsSkip++; continue; }
          const now = new Date().toISOString().slice(0,19).replace('T',' ');
          const [sRes] = await conn.execute(
            'INSERT INTO patient_stages (patient_id, stage_template_id, status, scheduled_date, actual_visit_date, date_overridden, override_reason, skip_reason, stage_data, notes, recorded_by, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newPId, newTId, s.status||'pending', s.scheduled_date||null, s.actual_visit_date||null, s.date_overridden?1:0, s.override_reason||null, s.skip_reason||null, s.stage_data||null, s.notes||null, s.recorded_by?newPrimaryUserId:null, s.createdAt||now, s.updatedAt||now]
          );
          realStageIdMap[s.id] = sRes.insertId;
          rsIns++;
        }
        console.log('  Real Stages  : ' + rsIns + ' inserted, ' + rsSkip + ' already existed');

        // Import notifications for real patients
        let rnIns = 0, rnSkip = 0;
        for (const n of realNotifications) {
          if (!realPatientOldIds.has(n.patient_id)) continue;
          const newPId = realPatientIdMap[n.patient_id];
          if (!newPId) { rnSkip++; continue; }
          const newSId = n.patient_stage_id ? (realStageIdMap[n.patient_stage_id]||null) : null;
          const safeType = sanitizeNotifType(n.type);
          if (n.sent_at) {
            const [exN] = await conn.execute('SELECT id FROM notifications WHERE patient_id = ? AND type = ? AND sent_at = ? LIMIT 1', [newPId, safeType, n.sent_at]);
            if (exN.length > 0) { rnSkip++; continue; }
          }
          const now = new Date().toISOString().slice(0,19).replace('T',' ');
          await conn.execute(
            'INSERT INTO notifications (patient_id, patient_stage_id, type, whatsapp_number, message_body, status, provider_message_id, sent_at, delivered_at, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newPId, newSId, safeType, n.whatsapp_number, n.message_body||null, n.status||'sent', n.provider_message_id||null, n.sent_at||null, n.delivered_at||null, n.createdAt||now, n.updatedAt||now]
          );
          rnIns++;
        }
        console.log('  Real Notifications: ' + rnIns + ' inserted, ' + rnSkip + ' skipped');
        console.log('\n  DEMO hospital now contains both synthetic + real patients!');
      }

      // Report
      console.log('='.repeat(65));
      console.log('  MIGRATION COMPLETE');
      console.log('='.repeat(65));
      console.log('  Hospital       : ' + oldHosp.name);
      console.log('  New Hospital ID: ' + newHospitalId);
      console.log('  Login Email    : ' + primaryUser.email);
      console.log('  Password       : unchanged (original bcrypt hash preserved)');
      console.log('  Patients       : ' + pIns + ' imported');
      console.log('  Patient Stages : ' + sIns + ' imported');
      console.log('  Notifications  : ' + nIns + ' imported');
      console.log('  RBAC           : roles + permissions + system_config seeded');
      console.log('  Subscription   : active 1 year');
      if (isDemo) {
        console.log('');
        console.log('  DEMO CREDENTIALS:');
        console.log('    Email   : demo@demohospital.in');
        console.log('    Password: Demo@1234');
      }
      console.log('='.repeat(65) + '\n');
    }
  } catch (err) {
    console.error('\nMIGRATION FAILED: ' + err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

migrate();
