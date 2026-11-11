import { NextResponse } from 'next/server';

/**
 * Clears the httpOnly provider session cookie. Reached without authentication
 * so stale/expired provider cookies can always be removed.
 */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('provider_token', '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  });
  return res;
}

export const DELETE = POST;
