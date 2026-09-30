import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withAuth } from '@/lib/middleware/withAuth';
import { User } from '@/lib/db/models/index';

// POST /api/auth/change-password
// Body: { current_password, new_password }
// Used for forced first-login change AND voluntary password change.
export async function POST(request) {
  const { user: authUser, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { current_password, new_password } = await request.json();

    if (!current_password || !new_password)
      return NextResponse.json({ error: 'current_password and new_password are required' }, { status: 400 });

    if (new_password.length < 8)
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });

    const user = await User.findByPk(authUser.id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match)
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });

    if (current_password === new_password)
      return NextResponse.json({ error: 'New password must be different from the current one' }, { status: 400 });

    const hash = await bcrypt.hash(new_password, 12);
    await user.update({ password_hash: hash, force_password_change: false });

    return NextResponse.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
