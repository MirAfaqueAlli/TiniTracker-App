import { Hospital, Role, RolePermission, SystemConfig } from '../db/models/index.js';
import { DEFAULT_ROLES, DEFAULT_ROLE_PERMISSIONS, ALL_PERMISSIONS } from '../utils/rbac.js';

/**
 * Seed default roles and permissions for a specific hospital (or all existing hospitals).
 */
export async function seedRolesAndPermissionsForHospital(hospitalId) {
  if (!hospitalId) return;

  // 1. Ensure SystemConfig exists
  const existingConfig = await SystemConfig.findOne({ where: { hospital_id: hospitalId } });
  if (!existingConfig) {
    await SystemConfig.create({
      hospital_id: hospitalId,
      batch_cron_time: '08:00',
      batch_auto_run: true,
      reminder_7d_enabled: true,
      reminder_1d_enabled: true,
      reminder_today_enabled: true,
      missed_flag_enabled: true,
    });
  }

  // 2. Ensure default roles exist in `roles` table
  for (const roleDef of DEFAULT_ROLES) {
    const existingRole = await Role.findOne({
      where: { hospital_id: hospitalId, key: roleDef.key },
    });

    if (!existingRole) {
      await Role.create({
        hospital_id: hospitalId,
        key: roleDef.key,
        name: roleDef.name,
        description: roleDef.description,
        dept: roleDef.dept,
        color: roleDef.color,
        bg: roleDef.bg,
        border: roleDef.border,
        is_system: true,
      });
    }
  }

  // 3. Ensure default role_permissions exist
  const existingPerms = await RolePermission.findAll({
    where: { hospital_id: hospitalId },
  });

  const existingMap = new Set(
    existingPerms.map(p => `${p.role_key}:${p.permission_key}`)
  );

  const toCreate = [];
  for (const roleKey of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
    const rolePerms = DEFAULT_ROLE_PERMISSIONS[roleKey];
    for (const permKey of ALL_PERMISSIONS) {
      const comboKey = `${roleKey}:${permKey}`;
      if (!existingMap.has(comboKey)) {
        const enabled = rolePerms[permKey] ?? false;
        toCreate.push({
          hospital_id: hospitalId,
          role_key: roleKey,
          permission_key: permKey,
          enabled,
        });
      }
    }
  }

  if (toCreate.length > 0) {
    await RolePermission.bulkCreate(toCreate);
  }
}

/**
 * Ensure all hospitals have roles, permissions, and system_configs initialized.
 */
export async function seedAllHospitalsRoles() {
  try {
    const hospitals = await Hospital.findAll({ attributes: ['id'] });
    for (const h of hospitals) {
      await seedRolesAndPermissionsForHospital(h.id);
    }
    console.log(`✅ Roles, permissions, and system configs verified for ${hospitals.length} hospitals`);
  } catch (err) {
    console.error('⚠️ Roles & permissions seeder error:', err.message);
  }
}
