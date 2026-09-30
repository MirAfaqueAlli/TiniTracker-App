import jwt from 'jsonwebtoken';
import { User, Hospital } from '../db/models/index.js';

/**
 * Verifies the Bearer token from the Authorization header and returns the user.
 * Use this inside Next.js API route handlers (not Express middleware).
 *
 * Usage:
 *   const { user, error } = await authenticate(request);
 *   if (error) return NextResponse.json({ error }, { status: 401 });
 */
export async function authenticate(request) {
  let token = null;
  const header = request.headers.get('authorization');
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else {
    token = request.cookies?.get?.('tinitracker_token')?.value;
  }

  if (!token) {
    return { user: null, error: 'Not authenticated' };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password_hash'] },
      include: [{ model: Hospital }]
    });
    if (!user) return { user: null, error: 'User not found' };
    return { user, error: null };
  } catch {
    return { user: null, error: 'Token invalid or expired' };
  }
}

/**
 * Guards a route to specific roles.
 * Returns an error string if the user's role is not in the allowed list.
 *
 * Usage:
 *   const roleError = requireRole(user, 'admin');
 *   if (roleError) return NextResponse.json({ error: roleError }, { status: 403 });
 */
export function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) {
    return 'Forbidden — insufficient role';
  }
  return null;
}
