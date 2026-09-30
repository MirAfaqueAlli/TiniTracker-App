import jwt from 'jsonwebtoken';
import { ProviderAdmin } from '@/lib/db/models/index';

/**
 * Middleware for provider-only routes.
 * Reads the Authorization: Bearer <token> header.
 * Returns { admin, errorResponse } — if errorResponse is set, return it immediately.
 */
export async function withProviderAuth(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    const { NextResponse } = await import('next/server');
    return { admin: null, errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.type !== 'provider') {
      const { NextResponse } = await import('next/server');
      return { admin: null, errorResponse: NextResponse.json({ error: 'Forbidden — provider token required' }, { status: 403 }) };
    }

    const admin = await ProviderAdmin.findByPk(payload.id);
    if (!admin) {
      const { NextResponse } = await import('next/server');
      return { admin: null, errorResponse: NextResponse.json({ error: 'Provider admin not found' }, { status: 401 }) };
    }

    if (admin.is_blocked) {
      const { NextResponse } = await import('next/server');
      return { admin: null, errorResponse: NextResponse.json({ error: 'Account suspended. Contact superadmin.' }, { status: 403 }) };
    }

    return { admin, errorResponse: null };
  } catch {
    const { NextResponse } = await import('next/server');
    return { admin: null, errorResponse: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
}
