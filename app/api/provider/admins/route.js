import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { ProviderAdmin } from '@/lib/db/models/index';
import { syncAllEnvAdmins, isEnvAdmin } from '@/lib/services/providerEnvAuth.service';

// GET /api/provider/admins — list all provider admin accounts
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    // Automatically synchronize any newly configured admins in .env / .env.local
    await syncAllEnvAdmins();

    const admins = await ProviderAdmin.findAll({
      attributes: ['id', 'name', 'email', 'role', 'is_blocked', 'createdAt', 'updatedAt'],
      order: [
        ['role', 'ASC'], // 'superadmin' before 'support'
        ['createdAt', 'ASC'],
      ],
    });

    const adminsWithEnvMeta = admins.map(a => {
      const data = a.toJSON ? a.toJSON() : a;
      return {
        ...data,
        is_env_managed: isEnvAdmin(data.email),
      };
    });

    return NextResponse.json({
      admins: adminsWithEnvMeta,
      currentAdminId: admin.id,
    });
  } catch (error) {
    console.error('Error fetching provider admins:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/provider/admins — create new provider admin
export async function POST(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  if (admin.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden: Only superadmins can create admin accounts' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, email, password, role = 'support' } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if (!['superadmin', 'support'].includes(role)) {
      return NextResponse.json({ error: 'Role must be superadmin or support' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await ProviderAdmin.findOne({ where: { email: cleanEmail } });
    if (existing) {
      return NextResponse.json({ error: 'An admin account with this email already exists' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const newAdmin = await ProviderAdmin.create({
      name: name.trim(),
      email: cleanEmail,
      password_hash,
      role,
      is_blocked: false,
    });

    return NextResponse.json({
      message: 'Provider admin created successfully',
      admin: {
        id: newAdmin.id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        is_blocked: newAdmin.is_blocked,
        createdAt: newAdmin.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating provider admin:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
