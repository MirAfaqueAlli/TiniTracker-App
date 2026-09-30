import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import { User, Hospital } from '@/lib/db/models/index';

// GET /api/provider/users — list all users across all hospitals
export async function GET(request) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const hospitalId = searchParams.get('hospital_id');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where = {};
    if (hospitalId && hospitalId !== 'ALL') {
      where.hospital_id = hospitalId;
    }
    if (role && role !== 'ALL') {
      where.role = role;
    }
    if (status === 'BLOCKED') {
      where.is_blocked = true;
    } else if (status === 'ACTIVE') {
      where.is_blocked = false;
    }

    if (search) {
      const q = search.trim();
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      attributes: ['id', 'hospital_id', 'name', 'email', 'role', 'is_blocked', 'force_password_change', 'createdAt', 'updatedAt'],
      include: [
        {
          model: Hospital,
          attributes: ['id', 'name', 'address', 'phone', 'is_blocked'],
        }
      ],
      order: [['createdAt', 'DESC']],
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error('List provider users error:', err);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
