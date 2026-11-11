import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { User, Hospital } from '@/lib/db/models/index';
import { isValidHospitalRole } from '@/lib/utils/rbac';
import { handleApiError } from '@/lib/utils/validation';

// PATCH /api/provider/users/[id] — update user credentials or role
export async function PATCH(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const user = await User.findByPk(id, { include: [Hospital] });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, email, role, new_password, force_password_change } = body;

    if (role !== undefined) {
      if (!(await isValidHospitalRole(role, user.hospital_id))) {
        return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
      }
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (role !== undefined) updates.role = role;
    if (force_password_change !== undefined) updates.force_password_change = Boolean(force_password_change);

    if (new_password) {
      if (new_password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      updates.password_hash = await bcrypt.hash(new_password, 10);
      updates.force_password_change = true; // prompt them to change after reset
    }

    await user.update(updates);

    return NextResponse.json({
      message: new_password ? 'User updated and password reset successfully' : 'User profile updated',
      user: {
        id:                    user.id,
        name:                  user.name,
        email:                 user.email,
        role:                  user.role,
        is_blocked:            user.is_blocked,
        force_password_change: user.force_password_change,
        hospital:              user.Hospital?.name,
      }
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return NextResponse.json({ error: 'Email is already in use by another account' }, { status: 409 });
    }
    console.error('Update user error:', err);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}// DELETE /api/provider/users/[id] — remove user account
export async function DELETE(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const user = await User.findByPk(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Guard: do not allow deleting the only admin of a hospital.
    // A hospital with zero admins would be unmanageable.
    if (user.role === 'admin' && user.hospital_id) {
      const adminCount = await User.count({
        where: { hospital_id: user.hospital_id, role: 'admin' },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the only administrator for this hospital. Assign another admin first.' },
          { status: 400 }
        );
      }
    }

    await user.destroy();
    return NextResponse.json({ message: `User "${user.name}" removed successfully` });
  } catch (err) {
    return handleApiError(err, 'Failed to delete user', '[DELETE /provider/users/[id]]');
  }
}
