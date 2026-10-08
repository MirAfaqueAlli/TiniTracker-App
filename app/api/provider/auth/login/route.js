import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ProviderAdmin } from '@/lib/db/models/index';
import { matchAndSyncEnvAdmin } from '@/lib/services/providerEnvAuth.service';

// POST /api/provider/auth/login
export async function POST(request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password)
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });

    const cleanEmail = email.trim().toLowerCase();

    // 1. Check if matching credentials are configured in .env / .env.local
    const envResult = await matchAndSyncEnvAdmin(cleanEmail, password);
    let admin = null;

    if (envResult) {
      if (envResult.status === 'invalid_password') {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }
      admin = envResult.admin;
    }

    // 2. If not matched in env, check database credentials
    if (!admin) {
      let dbAdmin = await ProviderAdmin.findOne({ where: { email: cleanEmail } });

      if (!dbAdmin) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

      const match = await bcrypt.compare(password, dbAdmin.password_hash);
      if (!match) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

      admin = dbAdmin;
    }

    if (admin.is_blocked) {
      return NextResponse.json({ error: 'This provider account is suspended. Contact a superadmin.' }, { status: 403 });
    }

    // Separate JWT — type: 'provider' distinguishes from hospital user tokens
    const token = jwt.sign(
      { id: admin.id, type: 'provider', role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const res = NextResponse.json({
      token,
      admin: {
        id:    admin.id,
        name:  admin.name,
        email: admin.email,
        role:  admin.role,
      }
    });

    res.cookies.set('provider_token', token, {
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false,
    });

    return res;
  } catch (err) {
    console.error('Provider login error:', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
