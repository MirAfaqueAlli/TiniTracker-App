import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Role, RolePermission } from '@/lib/db/models/index';
import { PERMISSION_GROUPS, ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, ROLES } from '@/lib/utils/rbac';
import { seedRolesAndPermissionsForHospital } from '@/lib/seeders/roles.seed.js';

// GET /api/settings/permissions — Fetch full permission matrix
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request, 'admin');
  if (errorResponse) return errorResponse;

  try {
    // 1. Fetch all roles for this hospital (auto-seed if missing)
    let roles = await Role.findAll({
      where: { hospital_id: user.hospital_id },
      order: [['is_system', 'DESC'], ['createdAt', 'ASC']],
    });

    if (roles.length === 0) {
      await seedRolesAndPermissionsForHospital(user.hospital_id);
      roles = await Role.findAll({
        where: { hospital_id: user.hospital_id },
        order: [['is_system', 'DESC'], ['createdAt', 'ASC']],
      });
    }

    // 2. Fetch all role_permissions for this hospital
    const dbPerms = await RolePermission.findAll({
      where: { hospital_id: user.hospital_id },
    });

    // Build map: { [roleKey]: { [permKey]: boolean } }
    const matrix = {};

    for (const r of roles) {
      matrix[r.key] = {};
      const fallback = DEFAULT_ROLE_PERMISSIONS[r.key] || {};
      for (const p of ALL_PERMISSIONS) {
        // Admin always has true
        if (r.key === ROLES.ADMIN) {
          matrix[r.key][p] = true;
        } else {
          matrix[r.key][p] = fallback[p] ?? false;
        }
      }
    }

    // Override with DB values
    for (const p of dbPerms) {
      if (matrix[p.role_key]) {
        // Keep admin locked to true
        if (p.role_key === ROLES.ADMIN) {
          matrix[p.role_key][p.permission_key] = true;
        } else {
          matrix[p.role_key][p.permission_key] = Boolean(p.enabled);
        }
      }
    }

    return NextResponse.json({
      groups: PERMISSION_GROUPS,
      roles: roles.map(r => ({
        id: r.id,
        key: r.key,
        name: r.name,
        dept: r.dept,
        color: r.color,
        bg: r.bg,
        border: r.border,
        is_system: r.is_system,
      })),
      matrix,
    });
  } catch (err) {
    console.error('Fetch permissions error:', err);
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
  }
}

// PUT /api/settings/permissions — Update permissions for one or multiple roles
export async function PUT(request) {
  const { user, errorResponse } = await withAuth(request, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const { role_key, permissions, bulkMatrix } = await request.json();

    // Support single role update or full matrix update
    const updates = [];

    if (role_key && permissions) {
      if (role_key === ROLES.ADMIN) {
        return NextResponse.json({ error: 'Admin permissions are permanently enabled and cannot be altered.' }, { status: 400 });
      }

      for (const [permKey, isEnabled] of Object.entries(permissions)) {
        updates.push({
          hospital_id: user.hospital_id,
          role_key,
          permission_key: permKey,
          enabled: Boolean(isEnabled),
        });
      }
    } else if (bulkMatrix) {
      for (const [rKey, permObj] of Object.entries(bulkMatrix)) {
        if (rKey === ROLES.ADMIN) continue; // Skip admin
        for (const [permKey, isEnabled] of Object.entries(permObj)) {
          updates.push({
            hospital_id: user.hospital_id,
            role_key: rKey,
            permission_key: permKey,
            enabled: Boolean(isEnabled),
          });
        }
      }
    } else {
      return NextResponse.json({ error: 'Invalid update payload' }, { status: 400 });
    }

    // Upsert permissions
    for (const item of updates) {
      const [record] = await RolePermission.findOrCreate({
        where: {
          hospital_id: item.hospital_id,
          role_key: item.role_key,
          permission_key: item.permission_key,
        },
        defaults: item,
      });

      if (record.enabled !== item.enabled) {
        record.enabled = item.enabled;
        await record.save();
      }
    }

    return NextResponse.json({ message: 'Permissions updated successfully' });
  } catch (err) {
    console.error('Update permissions error:', err);
    return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 });
  }
}
