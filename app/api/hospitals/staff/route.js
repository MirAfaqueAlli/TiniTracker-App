import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { User } from '@/lib/db/models/index';

// GET /api/hospitals/staff
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const users = await User.findAll({
      where: { hospital_id: user.hospital_id },
      attributes: ['id', 'name', 'email', 'role', 'createdAt'],
      order: [['name', 'ASC']],
    });
    return NextResponse.json(users);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
  }
}
