import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Role, RolePermission, User, sequelize } from '@/lib/db/models/index';
import { DEFAULT_ROLES, ALL_PERMISSIONS } from '@/lib/utils/rbac';
import { seedRolesAndPermissionsForHospital } from '@/lib/seeders/roles.seed.js';

// GET /api/settings/roles — Fetch all roles (system + custom) for hospital
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request, 'admin');
  if (errorResponse) return errorResponse;

  try {
    // 1. Fetch all roles belonging to this hospital (auto-seed if missing)
    let roles = await Role.findAll({
      where: { hospital_id: user.hospital_id },
      order: [
        ['is_system', 'DESC'],
        ['createdAt', 'ASC']
      ]
    });

    if (roles.length === 0) {
      await seedRolesAndPermissionsForHospital(user.hospital_id);
      roles = await Role.findAll({
        where: { hospital_id: user.hospital_id },
        order: [
          ['is_system', 'DESC'],
          ['createdAt', 'ASC']
        ]
      });
    }

    // 2. Count users assigned to each role
    const userCounts = await User.findAll({
      where: { hospital_id: user.hospital_id },
      attributes: ['role', [sequelize.fn('COUNT', sequelize.col('id')), 'userCount']],
      group: ['role'],
      raw: true
    });

    const countMap = {};
    for (const c of userCounts) {
      countMap[c.role] = parseInt(c.userCount, 10);
    }

    const result = roles.map(r => ({
      id: r.id,
      key: r.key,
      name: r.name,
      dept: r.dept,
      description: r.description,
      color: r.color,
      bg: r.bg,
      border: r.border,
      is_system: r.is_system,
      user_count: countMap[r.key] || 0,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('Fetch roles error:', err);
    return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
  }
}

// POST /api/settings/roles — Create a new custom role
export async function POST(request) {
  const { user, errorResponse } = await withAuth(request, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const { name, dept, description, color, bg, border, copyPermissionsFrom } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
    }

    // Generate a unique clean role key
    const baseKey = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    let roleKey = `custom_${baseKey}`;

    // Check for collision
    const existing = await Role.findOne({
      where: { hospital_id: user.hospital_id, key: roleKey }
    });

    if (existing) {
      roleKey = `${roleKey}_${Date.now().toString().slice(-4)}`;
    }

    const newRole = await Role.create({
      hospital_id: user.hospital_id,
      key: roleKey,
      name: name.trim(),
      dept: dept ? dept.trim() : 'General',
      description: description ? description.trim() : null,
      color: color || '#00857c',
      bg: bg || '#e8f7f2',
      border: border || '#c4e9de',
      is_system: false,
    });

    // Copy permissions from selected role or default to false
    let templatePerms = {};
    if (copyPermissionsFrom) {
      const sourcePerms = await RolePermission.findAll({
        where: { hospital_id: user.hospital_id, role_key: copyPermissionsFrom }
      });
      for (const p of sourcePerms) {
        templatePerms[p.permission_key] = p.enabled;
      }
    }

    const permsToCreate = ALL_PERMISSIONS.map(permKey => ({
      hospital_id: user.hospital_id,
      role_key: roleKey,
      permission_key: permKey,
      enabled: templatePerms[permKey] ?? false,
    }));

    await RolePermission.bulkCreate(permsToCreate);

    return NextResponse.json({
      message: 'Custom role created successfully',
      role: {
        id: newRole.id,
        key: newRole.key,
        name: newRole.name,
        dept: newRole.dept,
        description: newRole.description,
        color: newRole.color,
        bg: newRole.bg,
        border: newRole.border,
        is_system: newRole.is_system,
        user_count: 0
      }
    }, { status: 201 });

  } catch (err) {
    console.error('Create role error:', err);
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }
}
