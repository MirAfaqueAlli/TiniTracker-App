import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { User } from '@/lib/db/models/index';
import { hasPermission } from '@/lib/utils/rbac';

// GET /api/auth/staff/[id]
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'staff.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view staff members' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const targetUser = await User.findByPk(id, {
      attributes: { exclude: ['password_hash'] }
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    if (targetUser.hospital_id !== user.hospital_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json(targetUser);
  } catch (err) {
    console.error('Fetch staff member error:', err);
    return NextResponse.json({ error: 'Failed to fetch staff member' }, { status: 500 });
  }
}

// PUT /api/auth/staff/[id]
export async function PUT(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'staff.edit'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to edit staff members' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const targetUser = await User.findByPk(id);

    if (!targetUser) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // Hospital isolation — admin can only manage users in their own hospital
    if (targetUser.hospital_id !== user.hospital_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { name, email, role, password } = await request.json();

    // Update name
    if (name !== undefined) {
      if (!name || !name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      targetUser.name = name.trim();
    }

    // Update email
    if (email !== undefined) {
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail) {
        return NextResponse.json({ error: 'Email cannot be empty' }, { status: 400 });
      }

      if (trimmedEmail !== targetUser.email.toLowerCase()) {
        const existing = await User.findOne({
          where: {
            email: trimmedEmail,
            id: { [Op.ne]: targetUser.id }
          }
        });
        if (existing) {
          return NextResponse.json({ error: 'Email is already in use by another account' }, { status: 409 });
        }
        targetUser.email = trimmedEmail;
      }
    }

    // Update role
    if (role !== undefined) {
      const ALLOWED_ROLES = ['staff', 'doctor_pregnancy', 'doctor_immunization', 'admin'];
      let isValidRole = ALLOWED_ROLES.includes(role);

      if (!isValidRole) {
        const { Role } = await import('@/lib/db/models/index');
        const customRole = await Role.findOne({
          where: { hospital_id: user.hospital_id, key: role }
        });
        if (customRole) isValidRole = true;
      }

      if (!isValidRole) {
        return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
      }

      targetUser.role = role;
    }

    // Update password (optional)
    if (password !== undefined && password !== null && password !== '') {
      if (typeof password !== 'string' || password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
      }
      const hashed = await bcrypt.hash(password, 12);
      targetUser.password_hash = hashed;
    }

    await targetUser.save();

    return NextResponse.json({
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      hospital_id: targetUser.hospital_id,
      updatedAt: targetUser.updatedAt
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return NextResponse.json({ error: 'Email is already in use' }, { status: 409 });
    }
    console.error('Update staff error:', err);
    return NextResponse.json({ error: 'Failed to update staff member' }, { status: 500 });
  }
}

// PATCH /api/auth/staff/[id]
export async function PATCH(request, context) {
  return PUT(request, context);
}
