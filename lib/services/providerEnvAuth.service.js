import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { ProviderAdmin } from '../db/models/index.js';

/**
 * Parses an individual .env file safely.
 */
function readEnvFile(filePath) {
  const envVars = {};
  if (!fs.existsSync(filePath)) return envVars;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        // Strip wrapping quotes
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key) {
          envVars[key] = val;
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return envVars;
}

/**
 * Loads merged environment variables from process.env and disk files.
 * This guarantees that newly added or modified credentials in .env or .env.local
 * are detected immediately at runtime without requiring a server restart.
 */
export function getMergedEnv() {
  const cwd = process.cwd();
  const candidatePaths = [
    path.resolve(cwd, '.env'),
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '../tinitracker-admin/.env'),
    path.resolve(cwd, '../tinitracker-admin/.env.local'),
    path.resolve(cwd, '../tinitracker-next/.env'),
    path.resolve(cwd, '../tinitracker-next/.env.local'),
    path.resolve(cwd, '..', '.env'),
    path.resolve(cwd, '..', '.env.local'),
  ];

  const merged = { ...process.env };

  for (const envPath of candidatePaths) {
    const fileVars = readEnvFile(envPath);
    for (const [k, v] of Object.entries(fileVars)) {
      if (
        k.startsWith('PROVIDER_ADMIN') ||
        k.startsWith('ADMIN_EMAIL') ||
        k.startsWith('ADMIN_PASSWORD') ||
        k === 'PROVIDER_ACCOUNTS' ||
        k === 'PROVIDER_USERS'
      ) {
        merged[k] = v;
      } else if (merged[k] === undefined) {
        merged[k] = v;
      }
    }
  }

  return merged;
}

/**
 * Parses all provider admin credentials defined across environment variables.
 *
 * Supported formats:
 * 1. Single Primary Admin:
 *    PROVIDER_ADMIN_EMAIL=admin@tinitracker.in
 *    PROVIDER_ADMIN_PASSWORD=MyPassword123
 *    PROVIDER_ADMIN_NAME=TiniTracker Superadmin (optional)
 *    PROVIDER_ADMIN_ROLE=superadmin (optional, default: superadmin)
 *
 * 2. Comma-separated or JSON list of accounts:
 *    PROVIDER_ADMIN_USERS="user1@tinitracker.in:Pass1:superadmin:Admin One,user2@tinitracker.in:Pass2:support:Support Tech"
 *    OR
 *    PROVIDER_ADMIN_USERS='[{"email":"user@tini.in","password":"...","role":"superadmin","name":"..."}]'
 *
 * 3. Numbered individual variables:
 *    PROVIDER_ADMIN_1_EMAIL=...
 *    PROVIDER_ADMIN_1_PASSWORD=...
 *    PROVIDER_ADMIN_1_ROLE=...
 *    PROVIDER_ADMIN_1_NAME=...
 *    (Supports up to PROVIDER_ADMIN_50_EMAIL)
 *
 * 4. Fallback synonyms:
 *    ADMIN_EMAIL / ADMIN_PASSWORD
 */
export function getEnvProviderAdmins() {
  const env = getMergedEnv();
  const admins = [];
  const seenEmails = new Set();

  function addAdmin(email, password, role = 'superadmin', name = '') {
    if (!email || !password) return;
    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanEmail || seenEmails.has(cleanEmail)) return;
    seenEmails.add(cleanEmail);

    const validRole = ['superadmin', 'support'].includes(role) ? role : 'superadmin';
    const displayName = name && String(name).trim() ? String(name).trim() : (cleanEmail.split('@')[0] || 'Provider Admin');

    admins.push({
      email: cleanEmail,
      password: String(password).trim(),
      role: validRole,
      name: displayName,
    });
  }

  // 1. Primary Env Variables
  const primaryEmail = env.PROVIDER_ADMIN_EMAIL || env.ADMIN_EMAIL;
  const primaryPass = env.PROVIDER_ADMIN_PASSWORD || env.ADMIN_PASSWORD;
  if (primaryEmail && primaryPass) {
    addAdmin(
      primaryEmail,
      primaryPass,
      env.PROVIDER_ADMIN_ROLE || 'superadmin',
      env.PROVIDER_ADMIN_NAME || 'TiniTracker Superadmin'
    );
  }

  // 2. Multi-User Env Variable (PROVIDER_ADMIN_USERS, PROVIDER_ADMIN_ACCOUNTS, etc.)
  const multiUsersRaw =
    env.PROVIDER_ADMIN_USERS ||
    env.PROVIDER_ADMIN_ACCOUNTS ||
    env.PROVIDER_ADMINS ||
    env.PROVIDER_USERS;

  if (multiUsersRaw) {
    const rawTrimmed = String(multiUsersRaw).trim();
    // Try JSON format
    if (rawTrimmed.startsWith('[') && rawTrimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(rawTrimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.email && item.password) {
              addAdmin(item.email, item.password, item.role, item.name);
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Could not parse PROVIDER_ADMIN_USERS JSON:', e.message);
      }
    } else {
      // Comma-separated: email:password[:role][:name]
      const items = rawTrimmed.split(',');
      for (const item of items) {
        const parts = item.trim().split(':');
        if (parts.length >= 2) {
          const email = parts[0];
          const password = parts[1];
          const role = parts[2] || 'superadmin';
          const name = parts[3] || email.split('@')[0];
          addAdmin(email, password, role, name);
        }
      }
    }
  }

  // 3. Numbered Env Variables (PROVIDER_ADMIN_1_EMAIL, PROVIDER_ADMIN_2_EMAIL, up to 50)
  for (let i = 1; i <= 50; i++) {
    const emailKey = `PROVIDER_ADMIN_${i}_EMAIL`;
    const passKey = `PROVIDER_ADMIN_${i}_PASSWORD`;
    const roleKey = `PROVIDER_ADMIN_${i}_ROLE`;
    const nameKey = `PROVIDER_ADMIN_${i}_NAME`;

    if (env[emailKey] && env[passKey]) {
      addAdmin(
        env[emailKey],
        env[passKey],
        env[roleKey] || 'superadmin',
        env[nameKey] || `Admin ${i}`
      );
    }
  }

  return admins;
}

/**
 * Checks if a given email is configured in environment variables.
 */
export function isEnvAdmin(email) {
  if (!email) return false;
  const cleanEmail = String(email).trim().toLowerCase();
  const admins = getEnvProviderAdmins();
  return admins.some(a => a.email === cleanEmail);
}

/**
 * Matches an incoming login attempt against environment credentials.
 * If credentials match, automatically provisions or updates the ProviderAdmin record in MySQL.
 */
export async function matchAndSyncEnvAdmin(inputEmail, inputPassword) {
  if (!inputEmail || !inputPassword) return null;
  const cleanEmail = String(inputEmail).trim().toLowerCase();
  const envAdmins = getEnvProviderAdmins();

  const envAccount = envAdmins.find(a => a.email === cleanEmail);

  // If this email is configured in env, env is the authoritative source!
  if (envAccount) {
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(envAccount.password);
    let isMatch = false;

    if (isBcryptHash) {
      isMatch = await bcrypt.compare(inputPassword, envAccount.password);
    } else {
      isMatch = (envAccount.password === inputPassword);
    }

    if (!isMatch) {
      return { status: 'invalid_password' };
    }

    try {
      let admin = await ProviderAdmin.findOne({ where: { email: cleanEmail } });
      const hash = isBcryptHash ? envAccount.password : await bcrypt.hash(envAccount.password, 10);

      if (admin) {
        // Keep database password hash in sync with env configuration
        admin.password_hash = hash;
        admin.role = envAccount.role;
        if (envAccount.name) admin.name = envAccount.name;
        admin.is_blocked = false; // Env-managed admin is always unblocked
        await admin.save();
      } else {
        admin = await ProviderAdmin.create({
          name: envAccount.name,
          email: cleanEmail,
          password_hash: hash,
          role: envAccount.role,
          is_blocked: false,
        });
        console.log(`✅ Auto-provisioned Provider Admin from env: ${cleanEmail}`);
      }

      return { status: 'success', admin };
    } catch (err) {
      console.error('Error syncing env provider admin to DB:', err);
      return null;
    }
  }

  return null;
}

/**
 * Synchronizes all configured env admins into MySQL database.
 * Called on startup or when listing provider admins.
 */
export async function syncAllEnvAdmins() {
  const envAdmins = getEnvProviderAdmins();
  for (const item of envAdmins) {
    try {
      let admin = await ProviderAdmin.findOne({ where: { email: item.email } });
      const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(item.password);
      const hash = isBcryptHash ? item.password : await bcrypt.hash(item.password, 10);

      if (admin) {
        admin.password_hash = hash;
        admin.role = item.role;
        if (item.name) admin.name = item.name;
        admin.is_blocked = false;
        await admin.save();
      } else {
        await ProviderAdmin.create({
          name: item.name,
          email: item.email,
          password_hash: hash,
          role: item.role,
          is_blocked: false,
        });
        console.log(`✅ Seeded Provider Admin from env: ${item.email}`);
      }
    } catch (err) {
      console.error(`Failed to sync env admin ${item.email}:`, err.message);
    }
  }
}
