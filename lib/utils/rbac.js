/**
 * RBAC Utility — Role-Based Access Control & Permission Management
 * Used across API routes and UI components.
 */

export const ROLES = {
  ADMIN:          'admin',
  STAFF:          'staff',
  DR_PREGNANCY:   'doctor_pregnancy',
  DR_IMMUNIZATION:'doctor_immunization',
};

export const DEFAULT_ROLES = [
  {
    key: ROLES.ADMIN,
    name: 'Hospital Admin',
    dept: 'Staff & Hospital Administration',
    description: 'Full administrative control over hospital settings, staff, roles, and patients',
    color: '#7e22ce',
    bg: '#f3e8ff',
    border: '#e9d5ff',
    is_system: true,
  },
  {
    key: ROLES.STAFF,
    name: 'Clinical Staff',
    dept: 'Outreach & Care Coordination',
    description: 'Patient registration, visit tracking, and WhatsApp reminder coordination',
    color: '#00857c',
    bg: '#e8f7f2',
    border: '#c4e9de',
    is_system: true,
  },
  {
    key: ROLES.DR_PREGNANCY,
    name: 'Doctor – Pregnancy',
    dept: 'Maternal & Antenatal Care',
    description: 'Specialized access for antenatal mothers and pregnancy stage care',
    color: '#e11d48',
    bg: '#fff1f2',
    border: '#fecdd3',
    is_system: true,
  },
  {
    key: ROLES.DR_IMMUNIZATION,
    name: 'Doctor – Immunization',
    dept: 'Pediatric Immunization',
    description: 'Specialized access for infants and childhood vaccination tracking',
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
    is_system: true,
  },
];

export const PERMISSION_GROUPS = [
  {
    group: 'Patients',
    permissions: [
      { key: 'patients.view', label: 'View Patients', description: 'Can view patient list and directory' },
      { key: 'patients.create', label: 'Create Patient', description: 'Can register new mothers or children' },
      { key: 'patients.edit', label: 'Edit Patient', description: 'Can edit patient details and pregnancy/child information' },
      { key: 'patients.delete', label: 'Deactivate Patient', description: 'Can mark patient status as inactive/archived' },
      { key: 'patients.view_all_types', label: 'Access All Types', description: 'Can view all patients regardless of department' },
    ],
  },
  {
    group: 'Stages & Timeline',
    permissions: [
      { key: 'stages.mark_visit', label: 'Mark Visit Done', description: 'Can record completed visits' },
      { key: 'stages.skip', label: 'Skip Visit', description: 'Can skip appointments with medical reason' },
      { key: 'stages.reschedule', label: 'Reschedule Visit', description: 'Can override and change scheduled dates' },
      { key: 'stages.record_delivery', label: 'Record Delivery', description: 'Can record delivery dates and baby birth info' },
    ],
  },
  {
    group: 'WhatsApp & Notifications',
    permissions: [
      { key: 'notifications.view', label: 'View Notifications', description: 'Can access notifications history log' },
      { key: 'notifications.send_manual', label: 'Send Manual Message', description: 'Can resend or trigger individual reminders' },
      { key: 'notifications.trigger_batch', label: 'Trigger Batch Cron', description: 'Can manually run the daily reminder job' },
    ],
  },
  {
    group: 'Activity Logs',
    permissions: [
      { key: 'activity.view', label: 'View Activity Logs', description: 'Can access hospital-wide audit trails' },
    ],
  },
  {
    group: 'Staff & Team',
    permissions: [
      { key: 'staff.view', label: 'View Staff List', description: 'Can view hospital staff directory' },
      { key: 'staff.create', label: 'Create Staff', description: 'Can add new hospital users/doctors' },
      { key: 'staff.edit', label: 'Edit Staff', description: 'Can edit staff details and update roles' },
    ],
  },
  {
    group: 'Admin & System Settings',
    permissions: [
      { key: 'settings.view', label: 'Access Settings', description: 'Can view admin settings page' },
      { key: 'settings.manage_roles', label: 'Manage Roles & Access', description: 'Can create custom roles and modify permissions' },
      { key: 'settings.edit_system', label: 'System & Batch Config', description: 'Can change batch cron run time and reminders' },
      { key: 'settings.edit_hospital', label: 'Hospital Profile', description: 'Can update hospital details and WhatsApp API keys' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));

export const DEFAULT_ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ALL_PERMISSIONS.reduce((acc, key) => { acc[key] = true; return acc; }, {}),
  [ROLES.STAFF]: {
    'patients.view': true,
    'patients.create': true,
    'patients.edit': true,
    'patients.delete': false,
    'patients.view_all_types': true,
    'stages.mark_visit': true,
    'stages.skip': true,
    'stages.reschedule': true,
    'stages.record_delivery': true,
    'notifications.view': true,
    'notifications.send_manual': true,
    'notifications.trigger_batch': true,
    'activity.view': true,
    'staff.view': true,
    'staff.create': false,
    'staff.edit': false,
    'settings.view': false,
    'settings.manage_roles': false,
    'settings.edit_system': false,
    'settings.edit_hospital': false,
  },
  [ROLES.DR_PREGNANCY]: {
    'patients.view': true,
    'patients.create': true,
    'patients.edit': true,
    'patients.delete': false,
    'patients.view_all_types': false,
    'stages.mark_visit': true,
    'stages.skip': true,
    'stages.reschedule': true,
    'stages.record_delivery': true,
    'notifications.view': true,
    'notifications.send_manual': false,
    'notifications.trigger_batch': false,
    'activity.view': true,
    'staff.view': false,
    'staff.create': false,
    'staff.edit': false,
    'settings.view': false,
    'settings.manage_roles': false,
    'settings.edit_system': false,
    'settings.edit_hospital': false,
  },
  [ROLES.DR_IMMUNIZATION]: {
    'patients.view': true,
    'patients.create': true,
    'patients.edit': true,
    'patients.delete': false,
    'patients.view_all_types': false,
    'stages.mark_visit': true,
    'stages.skip': true,
    'stages.reschedule': true,
    'stages.record_delivery': true,
    'notifications.view': true,
    'notifications.send_manual': false,
    'notifications.trigger_batch': false,
    'activity.view': true,
    'staff.view': false,
    'staff.create': false,
    'staff.edit': false,
    'settings.view': false,
    'settings.manage_roles': false,
    'settings.edit_system': false,
    'settings.edit_hospital': false,
  },
};

/** True if user is admin or superadmin (full hospital access) */
export function isAdmin(user) {
  return user?.role === ROLES.ADMIN || user?.role === 'superadmin';
}

/** True if user is a doctor of any type */
export function isDoctor(user) {
  return user?.role === ROLES.DR_PREGNANCY || user?.role === ROLES.DR_IMMUNIZATION;
}

/** True if user is staff (sees all data, no admin settings) */
export function isStaff(user) {
  return user?.role === ROLES.STAFF;
}

/**
 * Returns the doctor stage type ('pregnancy' or 'immunization').
 */
export function doctorStageType(user) {
  if (user?.role === ROLES.DR_PREGNANCY)    return 'pregnancy';
  if (user?.role === ROLES.DR_IMMUNIZATION) return 'immunization';
  return null;
}

/**
 * Returns the Sequelize patient_type filter for the given user.
 * null = no filter (see all types).
 */
export function doctorTypeFilter(user) {
  if (user?.role === ROLES.DR_PREGNANCY)    return ['pregnant', 'both'];
  if (user?.role === ROLES.DR_IMMUNIZATION) return ['immunization', 'both'];
  return null;  // admin/staff see all
}

/**
 * Checks if a patient's type is accessible to the user.
 * Returns true if allowed, false if forbidden.
 */
export function canAccessPatient(user, patientType) {
  const allowed = doctorTypeFilter(user);
  if (!allowed) return true;  // admin/staff — see all
  return allowed.includes(patientType);
}

/**
 * Asynchronously checks if a user has a specific permission in their hospital.
 * Admin always returns true.
 * Checks DB `role_permissions` table with fallback to DEFAULT_ROLE_PERMISSIONS.
 */
export async function hasPermission(user, permissionKey) {
  if (!user) return false;
  if (isAdmin(user)) return true;

  try {
    const { RolePermission } = await import('../db/models/index.js');
    const record = await RolePermission.findOne({
      where: {
        hospital_id: user.hospital_id,
        role_key: user.role,
        permission_key: permissionKey,
      },
    });

    if (record) {
      return Boolean(record.enabled);
    }
  } catch (err) {
    console.error('Error checking permission from DB:', err.message);
  }

  // Fallback to defaults
  const roleDefaults = DEFAULT_ROLE_PERMISSIONS[user.role];
  if (roleDefaults && roleDefaults[permissionKey] !== undefined) {
    return Boolean(roleDefaults[permissionKey]);
  }

  return false;
}
