import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withAuth } from '@/lib/middleware/withAuth';
import { User, Role } from '@/lib/db/models/index';
import { hasPermission } from '@/lib/utils/rbac';

export async function POST(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'staff.create'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to register new staff' }, { status: 403 });
  }

  try {
    const { name, email, password, role } = await request.json();
    if (!name || !email || !password)
      return NextResponse.json({ error: 'name, email and password required' }, { status: 400 });

    const hashed = await bcrypt.hash(password, 12);
    const ALLOWED_DEFAULT_ROLES = ['staff', 'admin', 'doctor_pregnancy', 'doctor_immunization'];
    
    // Check if role is either a default role or an active custom role for this hospital
    let assignedRole = 'staff';
    if (ALLOWED_DEFAULT_ROLES.includes(role)) {
      assignedRole = role;
    } else if (role) {
      const customRole = await Role.findOne({
        where: { hospital_id: user.hospital_id, key: role }
      });
      if (customRole) assignedRole = customRole.key;
    }

    const staff = await User.create({
      name,
      email,
      password_hash: hashed,
      role:          assignedRole,
      hospital_id:   user.hospital_id
    });

    return NextResponse.json(
      { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
      { status: 201 }
    );
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError')
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    console.error('Register staff error:', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
