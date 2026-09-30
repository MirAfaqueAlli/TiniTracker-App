import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { User } from '@/lib/db/models/index';

// POST /api/provider/users/[id]/block — suspend or unsuspend a user account
export async function POST(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const user = await User.findByPk(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let targetBlocked;
    try {
      const body = await request.json();
      targetBlocked = body.is_blocked !== undefined ? Boolean(body.is_blocked) : !user.is_blocked;
    } catch {
      targetBlocked = !user.is_blocked;
    }

    await user.update({ is_blocked: targetBlocked });

    return NextResponse.json({
      message: targetBlocked
        ? `User account "${user.name}" has been suspended.`
        : `User account "${user.name}" has been unblocked.`,
      user_id: user.id,
      is_blocked: targetBlocked,
    });
  } catch (err) {
    console.error('Toggle user block error:', err);
    return NextResponse.json({ error: 'Failed to update user status' }, { status: 500 });
  }
}
