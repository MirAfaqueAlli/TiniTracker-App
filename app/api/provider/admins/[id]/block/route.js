import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { ProviderAdmin } from '@/lib/db/models/index';
import { isEnvAdmin } from '@/lib/services/providerEnvAuth.service';

// POST /api/provider/admins/[id]/block — toggle admin suspension
export async function POST(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  if (admin.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden: Only superadmins can suspend admin accounts' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const targetId = Number(id);

    if (admin.id === targetId) {
      return NextResponse.json({ error: 'You cannot suspend your own account' }, { status: 400 });
    }

    const targetAdmin = await ProviderAdmin.findByPk(targetId);
    if (!targetAdmin) {
      return NextResponse.json({ error: 'Provider admin not found' }, { status: 404 });
    }

    if (isEnvAdmin(targetAdmin.email)) {
      return NextResponse.json({
        error: 'Environment-managed provider admin accounts cannot be suspended. To deactivate it, remove it from .env or .env.local.',
      }, { status: 400 });
    }

    const currentBlocked = Boolean(targetAdmin.is_blocked);
    const newBlockedState = !currentBlocked;

    // If suspending a superadmin, ensure at least one other active superadmin remains
    if (newBlockedState && targetAdmin.role === 'superadmin') {
      const remainingSuperadmins = await ProviderAdmin.count({
        where: {
          role: 'superadmin',
          id: { [Op.ne]: targetId },
          is_blocked: false,
        },
      });
      if (remainingSuperadmins === 0) {
        return NextResponse.json({
          error: 'Cannot suspend the only remaining active Superadmin',
        }, { status: 400 });
      }
    }

    targetAdmin.is_blocked = newBlockedState;
    await targetAdmin.save();

    return NextResponse.json({
      message: `Admin account has been ${newBlockedState ? 'suspended' : 'reactivated'} successfully`,
      is_blocked: newBlockedState,
    });
  } catch (error) {
    console.error('Error toggling admin suspension:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
