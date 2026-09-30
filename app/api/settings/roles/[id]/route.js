import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Role, RolePermission, User } from '@/lib/db/models/index';

// PATCH /api/settings/roles/[id] — Update role metadata
export async function PATCH(request, { params }) {
  const { user, errorResponse } = await withAuth(request, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const role = await Role.findOne({
      where: { id, hospital_id: user.hospital_id }
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    const { name, dept, description, color, bg, border } = await request.json();

    if (name && name.trim()) role.name = name.trim();
    if (dept !== undefined) role.dept = dept.trim();
    if (description !== undefined) role.description = description;
    if (color) role.color = color;
    if (bg) role.bg = bg;
    if (border) role.border = border;

    await role.save();

    return NextResponse.json({ message: 'Role updated successfully', role });
  } catch (err) {
    console.error('Update role error:', err);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}

// DELETE /api/settings/roles/[id] — Delete custom role
export async function DELETE(request, { params }) {
  const { user, errorResponse } = await withAuth(request, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const role = await Role.findOne({
      where: { id, hospital_id: user.hospital_id }
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    if (role.is_system) {
      return NextResponse.json({ error: 'System default roles cannot be deleted' }, { status: 400 });
    }

    // Check if any users are assigned to this role
    const assignedUsers = await User.count({
      where: { hospital_id: user.hospital_id, role: role.key }
    });

    if (assignedUsers > 0) {
      return NextResponse.json({
        error: `Cannot delete role: ${assignedUsers} staff member(s) are currently assigned to this role. Reassign them first.`
      }, { status: 400 });
    }

    // Delete permissions associated with this role
    await RolePermission.destroy({
      where: { hospital_id: user.hospital_id, role_key: role.key }
    });

    // Delete the role
    await role.destroy();

    return NextResponse.json({ message: 'Role deleted successfully' });
  } catch (err) {
    console.error('Delete role error:', err);
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 });
  }
}
