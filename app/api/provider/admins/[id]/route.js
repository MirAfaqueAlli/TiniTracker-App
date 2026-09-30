import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { ProviderAdmin } from '@/lib/db/models/index';
import { isEnvAdmin } from '@/lib/services/providerEnvAuth.service';

// PATCH /api/provider/admins/[id] — update admin name, role, or reset password
export async function PATCH(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  if (admin.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden: Only superadmins can modify admin accounts' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const targetAdmin = await ProviderAdmin.findByPk(id);
    if (!targetAdmin) {
      return NextResponse.json({ error: 'Provider admin not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, role, password } = body;

    if (password && isEnvAdmin(targetAdmin.email)) {
      return NextResponse.json({
        error: 'Password for environment-managed accounts must be changed directly in your .env or .env.local file.',
      }, { status: 400 });
    }

    if (name && name.trim()) {
      targetAdmin.name = name.trim();
    }

    if (role && ['superadmin', 'support'].includes(role) && role !== targetAdmin.role) {
      // If demoting from superadmin, ensure at least one other superadmin exists
      if (targetAdmin.role === 'superadmin' && role === 'support') {
        const otherSuperadmins = await ProviderAdmin.count({
          where: {
            role: 'superadmin',
            id: { [Op.ne]: targetAdmin.id },
            is_blocked: false,
          },
        });
        if (otherSuperadmins === 0) {
          return NextResponse.json({
            error: 'Cannot demote the only remaining active Superadmin',
          }, { status: 400 });
        }
      }
      targetAdmin.role = role;
    }

    if (password) {
      if (password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      targetAdmin.password_hash = await bcrypt.hash(password, 10);
    }

    await targetAdmin.save();

    return NextResponse.json({
      message: 'Provider admin updated successfully',
      admin: {
        id: targetAdmin.id,
        name: targetAdmin.name,
        email: targetAdmin.email,
        role: targetAdmin.role,
        is_blocked: targetAdmin.is_blocked,
        updatedAt: targetAdmin.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating provider admin:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/provider/admins/[id] — remove provider admin account
export async function DELETE(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  if (admin.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden: Only superadmins can delete admin accounts' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const targetId = Number(id);

    if (admin.id === targetId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    const targetAdmin = await ProviderAdmin.findByPk(targetId);
    if (!targetAdmin) {
      return NextResponse.json({ error: 'Provider admin not found' }, { status: 404 });
    }

    if (isEnvAdmin(targetAdmin.email)) {
      return NextResponse.json({
        error: 'This account is managed via environment variables (.env / .env.local). To remove it, delete its entry from your environment file.',
      }, { status: 400 });
    }

    if (targetAdmin.role === 'superadmin') {
      const remainingSuperadmins = await ProviderAdmin.count({
        where: {
          role: 'superadmin',
          id: { [Op.ne]: targetId },
          is_blocked: false,
        },
      });
      if (remainingSuperadmins === 0) {
        return NextResponse.json({
          error: 'Cannot delete the only remaining active Superadmin',
        }, { status: 400 });
      }
    }

    await targetAdmin.destroy();

    return NextResponse.json({ message: 'Provider admin removed successfully' });
  } catch (error) {
    console.error('Error deleting provider admin:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
