import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';

const BASE_URL = 'http://localhost:3000';
const JWT_SECRET = 'your_super_secret_jwt_key_change_this_in_production';

// Helper to sign token
function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
}

// Helper to make API requests
async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 STARTING COMPREHENSIVE RBAC & PERMISSION TEST SUITE');
  console.log('====================================================\n');

  const adminToken = signToken(1);  // User 1: Admin
  const staffToken = signToken(2);  // User 2: Staff
  const doctorToken = signToken(4); // User 4: Doctor Pregnancy

  const adminHeader = { Authorization: `Bearer ${adminToken}` };
  const staffHeader = { Authorization: `Bearer ${staffToken}` };
  const doctorHeader = { Authorization: `Bearer ${doctorToken}` };

  // ─────────────────────────────────────────────────────────────
  // 1. Initial State & Permissions Retrieval
  // ─────────────────────────────────────────────────────────────
  console.log('📋 Test 1: Admin fetches current Role Permission Matrix');
  const getMatrix = await request('/api/settings/permissions', { headers: adminHeader });
  assert(getMatrix.status === 200, 'Admin successfully fetches /api/settings/permissions (200 OK)');
  assert(getMatrix.data?.roles?.length >= 4, `At least 4 roles configured (got ${getMatrix.data?.roles?.length})`);
  assert(getMatrix.data?.matrix?.admin?.['patients.view'] === true, 'Admin has patients.view = true');
  assert(getMatrix.data?.matrix?.admin?.['settings.manage_roles'] === true, 'Admin has settings.manage_roles = true');

  // ─────────────────────────────────────────────────────────────
  // 2. Baseline Access for Staff
  // ─────────────────────────────────────────────────────────────
  console.log('\n👥 Test 2: Baseline Access for Clinical Staff');
  const staffPatients = await request('/api/patients', { headers: staffHeader });
  assert(staffPatients.status === 200, 'Staff can view patients directory (GET /api/patients -> 200)');

  const staffActivity = await request('/api/activity', { headers: staffHeader });
  assert(staffActivity.status === 200, 'Staff can view activity logs (GET /api/activity -> 200)');

  const staffNotifs = await request('/api/notifications', { headers: staffHeader });
  assert(staffNotifs.status === 200, 'Staff can view notifications (GET /api/notifications -> 200)');

  // ─────────────────────────────────────────────────────────────
  // 3. Admin Revokes Staff Permissions
  // ─────────────────────────────────────────────────────────────
  console.log('\n🔒 Test 3: Admin Revokes Permissions for Staff (patients.view, activity.view, notifications.view)');
  const revokeRes = await request('/api/settings/permissions', {
    method: 'PUT',
    headers: adminHeader,
    body: JSON.stringify({
      role_key: 'staff',
      permissions: {
        'patients.view': false,
        'activity.view': false,
        'notifications.view': false,
      },
    }),
  });
  assert(revokeRes.status === 200, 'Admin PUT /api/settings/permissions returns 200 OK');

  console.log('   Testing Staff access with revoked permissions...');
  const staffPatientsRevoked = await request('/api/patients', { headers: staffHeader });
  assert(staffPatientsRevoked.status === 403, 'Staff GET /api/patients is now 403 Forbidden');
  assert(staffPatientsRevoked.data?.error?.includes('permission'), 'Returns permission error message');

  const staffActivityRevoked = await request('/api/activity', { headers: staffHeader });
  assert(staffActivityRevoked.status === 403, 'Staff GET /api/activity is now 403 Forbidden');

  const staffNotifsRevoked = await request('/api/notifications', { headers: staffHeader });
  assert(staffNotifsRevoked.status === 403, 'Staff GET /api/notifications is now 403 Forbidden');

  // ─────────────────────────────────────────────────────────────
  // 4. Admin Grants Permissions Back to Staff
  // ─────────────────────────────────────────────────────────────
  console.log('\n🔓 Test 4: Admin Restores Permissions for Staff');
  const restoreRes = await request('/api/settings/permissions', {
    method: 'PUT',
    headers: adminHeader,
    body: JSON.stringify({
      role_key: 'staff',
      permissions: {
        'patients.view': true,
        'activity.view': true,
        'notifications.view': true,
      },
    }),
  });
  assert(restoreRes.status === 200, 'Admin restored permissions (PUT -> 200 OK)');

  console.log('   Testing Staff access with restored permissions...');
  const staffPatientsRestored = await request('/api/patients', { headers: staffHeader });
  assert(staffPatientsRestored.status === 200, 'Staff GET /api/patients works again (200 OK)');

  const staffActivityRestored = await request('/api/activity', { headers: staffHeader });
  assert(staffActivityRestored.status === 200, 'Staff GET /api/activity works again (200 OK)');

  const staffNotifsRestored = await request('/api/notifications', { headers: staffHeader });
  assert(staffNotifsRestored.status === 200, 'Staff GET /api/notifications works again (200 OK)');

  // ─────────────────────────────────────────────────────────────
  // 5. Test Action Permissions (patients.create & patients.edit)
  // ─────────────────────────────────────────────────────────────
  console.log('\n📝 Test 5: Dynamic Permission on Patient Creation (patients.create)');
  // Revoke patients.create
  await request('/api/settings/permissions', {
    method: 'PUT',
    headers: adminHeader,
    body: JSON.stringify({
      role_key: 'staff',
      permissions: { 'patients.create': false },
    }),
  });

  const staffCreateBlocked = await request('/api/patients', {
    method: 'POST',
    headers: staffHeader,
    body: JSON.stringify({ name: 'Test Mother', whatsapp_number: '919999999999' }),
  });
  assert(staffCreateBlocked.status === 403, 'Staff POST /api/patients is 403 Forbidden when patients.create is disabled');

  // Re-enable patients.create
  await request('/api/settings/permissions', {
    method: 'PUT',
    headers: adminHeader,
    body: JSON.stringify({
      role_key: 'staff',
      permissions: { 'patients.create': true },
    }),
  });

  // Now sending invalid body should pass auth check and hit 400 validation error (not 403)
  const staffCreateAllowed = await request('/api/patients', {
    method: 'POST',
    headers: staffHeader,
    body: JSON.stringify({}),
  });
  assert(staffCreateAllowed.status === 400, 'Staff POST /api/patients passes authorization when enabled (got 400 validation)');

  // ─────────────────────────────────────────────────────────────
  // 6. Admin Lockout Protection
  // ─────────────────────────────────────────────────────────────
  console.log('\n🛡️ Test 6: Admin Lockout Immunity (Prevent breaking Admin)');
  const adminLockoutAttempt = await request('/api/settings/permissions', {
    method: 'PUT',
    headers: adminHeader,
    body: JSON.stringify({
      role_key: 'admin',
      permissions: { 'patients.view': false, 'settings.manage_roles': false },
    }),
  });
  assert(adminLockoutAttempt.status === 400, 'Admin permission modification is rejected (400 Bad Request)');
  assert(adminLockoutAttempt.data?.error?.includes('permanent'), 'Error explains admin permissions are permanently enabled');

  // ─────────────────────────────────────────────────────────────
  // 7. Non-Admin Access Blocking to Settings
  // ─────────────────────────────────────────────────────────────
  console.log('\n🚫 Test 7: Non-Admins Blocked from Admin Settings');
  const staffSettings = await request('/api/settings/permissions', { headers: staffHeader });
  assert(staffSettings.status === 403, 'Staff blocked from /api/settings/permissions (403)');

  const doctorSettings = await request('/api/settings/permissions', { headers: doctorHeader });
  assert(doctorSettings.status === 403, 'Doctor blocked from /api/settings/permissions (403)');

  // ─────────────────────────────────────────────────────────────
  // 8. Custom Role Lifecycle & Dynamic Permission Verification
  // ─────────────────────────────────────────────────────────────
  console.log('\n✨ Test 8: Custom Role Lifecycle & Custom Permissions');
  
  // A. Create Custom Role with unique name
  const testRoleName = `Triage Nurse ${Date.now()}`;
  const createRoleRes = await request('/api/settings/roles', {
    method: 'POST',
    headers: adminHeader,
    body: JSON.stringify({
      name: testRoleName,
      dept: 'Emergency Services',
      description: 'Patient check-in and triage review',
      color: '#f59e0b',
    }),
  });
  assert(createRoleRes.status === 201, 'Admin created custom role (201 Created)');
  const customRole = createRoleRes.data.role || createRoleRes.data;
  assert(customRole?.key?.startsWith('custom_') || customRole?.key?.startsWith('role_'), `Custom role generated key: ${customRole?.key}`);

  // B. Customize Permissions for New Role
  const setCustomPerms = await request('/api/settings/permissions', {
    method: 'PUT',
    headers: adminHeader,
    body: JSON.stringify({
      role_key: customRole.key,
      permissions: {
        'patients.view': true,
        'patients.create': false,
        'activity.view': false,
      },
    }),
  });
  assert(setCustomPerms.status === 200, 'Admin configured custom permissions for new role (200 OK)');

  // C. Create a test user with this custom role in MySQL
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'shahid12520b',
    database: 'tinitracker',
  });

  const [insertUser] = await conn.execute(
    'INSERT INTO users (hospital_id, name, email, password_hash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
    [1, 'Nurse Sarah', 'nurse.sarah.test@tinitracker.in', 'dummy_hash', customRole.key]
  );
  const customUserId = insertUser.insertId;
  const customUserToken = signToken(customUserId);
  const customUserHeader = { Authorization: `Bearer ${customUserToken}` };

  console.log('   Testing Custom Role User permissions...');
  // Allowed: patients.view
  const customUserPatients = await request('/api/patients', { headers: customUserHeader });
  assert(customUserPatients.status === 200, 'Custom Role User CAN view patients (patients.view = true)');

  // Forbidden: patients.create
  const customUserCreate = await request('/api/patients', {
    method: 'POST',
    headers: customUserHeader,
    body: JSON.stringify({ name: 'Baby John', whatsapp_number: '918888888888' }),
  });
  assert(customUserCreate.status === 403, 'Custom Role User CANNOT create patients (patients.create = false -> 403)');

  // Forbidden: activity.view
  const customUserActivity = await request('/api/activity', { headers: customUserHeader });
  assert(customUserActivity.status === 403, 'Custom Role User CANNOT view activity (activity.view = false -> 403)');

  // D. Dynamically Grant activity.view to the custom role!
  console.log('   Dynamically granting activity.view to custom role...');
  await request('/api/settings/permissions', {
    method: 'PUT',
    headers: adminHeader,
    body: JSON.stringify({
      role_key: customRole.key,
      permissions: { 'activity.view': true },
    }),
  });

  const customUserActivityNow = await request('/api/activity', { headers: customUserHeader });
  assert(customUserActivityNow.status === 200, 'Custom Role User CAN NOW view activity immediately (dynamically updated to 200)');

  // E. Cleanup
  console.log('\n🧹 Cleaning up test data...');
  await conn.execute('DELETE FROM users WHERE id = ?', [customUserId]);
  await conn.end();

  const deleteRoleRes = await request(`/api/settings/roles/${customRole.id}`, {
    method: 'DELETE',
    headers: adminHeader,
  });
  assert(deleteRoleRes.status === 200, 'Custom role successfully deleted after test user removed');

  console.log('\n====================================================');
  console.log(`🏁 RBAC TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
