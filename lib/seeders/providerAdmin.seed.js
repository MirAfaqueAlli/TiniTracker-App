/**
 * seedProviderAdmin.js
 *
 * Runs automatically on every server start.
 * Synchronizes all provider admin credentials defined in environment variables
 * (.env, .env.local, PROVIDER_ADMIN_EMAIL, PROVIDER_ADMIN_USERS, PROVIDER_ADMIN_1_EMAIL, etc.)
 * directly into the MySQL database.
 */

import { syncAllEnvAdmins, getEnvProviderAdmins } from '../services/providerEnvAuth.service.js';
import { ProviderAdmin } from '../db/models/index.js';
import bcrypt from 'bcryptjs';

export async function seedProviderAdmin() {
  try {
    // 1. Sync all admins defined across environment variables
    await syncAllEnvAdmins();

    // 2. Ensure at least one default superadmin exists if no env vars defined
    const count = await ProviderAdmin.count();
    if (count === 0) {
      const email = process.env.PROVIDER_ADMIN_EMAIL || 'admin@tinitracker.in';
      const password = process.env.PROVIDER_ADMIN_PASSWORD;
      const name = process.env.PROVIDER_ADMIN_NAME || 'TiniTracker Superadmin';

      if (!password) {
        console.error('⚠️  PROVIDER_ADMIN_PASSWORD is not set in environment variables. Skipping default admin seed for security. Please set PROVIDER_ADMIN_PASSWORD in your .env file.');
        return;
      }
      const hash = await bcrypt.hash(password, 12);

      await ProviderAdmin.create({
        name,
        email,
        password_hash: hash,
        role: 'superadmin',
        is_blocked: false,
      });

      console.log('🛡️  Default TiniTracker Superadmin seeded: admin@tinitracker.in');
    }
  } catch (err) {
    console.error('⚠️  Provider admin seed failed:', err.message);
  }
}
