import { NextResponse } from 'next/server';

/**
 * Clears the httpOnly session cookie. Because the cookie is not readable by
 * JavaScript, logout must be performed by the server.
 */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('tinitraker_token', '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  });
  return res;
}

export const DELETE = POST;
