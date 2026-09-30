import { NextResponse } from 'next/server';
import { authenticate, requireRole } from '@/lib/middleware/auth';

/**
 * Convenience helper: authenticate + optional role check.
 * Returns { user, errorResponse } — if errorResponse is set, return it immediately.
 *
 * Usage:
 *   const { user, errorResponse } = await withAuth(request);
 *   if (errorResponse) return errorResponse;
 *   // ...use user
 *
 * With role check:
 *   const { user, errorResponse } = await withAuth(request, 'admin');
 *   if (errorResponse) return errorResponse;
 */
export async function withAuth(request, ...roles) {
  const { user, error } = await authenticate(request);
  if (error) return { user: null, errorResponse: NextResponse.json({ error }, { status: 401 }) };
  if (roles.length > 0) {
    const roleError = requireRole(user, ...roles);
    if (roleError) return { user, errorResponse: NextResponse.json({ error: roleError }, { status: 403 }) };
  }
  return { user, errorResponse: null };
}
