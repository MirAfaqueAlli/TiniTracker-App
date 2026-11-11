import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { User } from '@/lib/db/models/index';
import { hasPermission } from '@/lib/utils/rbac';
import { parsePagination } from '@/lib/utils/validation';

export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'staff.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view staff members' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit: lim, offset } = parsePagination(searchParams, 10, 100);
    const search = searchParams.get('search');
    const role   = searchParams.get('role');

    const where = {};
    if (user?.hospital_id) where.hospital_id = user.hospital_id;

    if (role) {
      if (role === 'doctor' || role === 'doctors') {
        where.role = { [Op.in]: ['doctor_pregnancy', 'doctor_immunization'] };
      } else if (role.includes(',')) {
        where.role = { [Op.in]: role.split(',') };
      } else {
        where.role = role;
      }
    }
    if (search) {
      where[Op.or] = [
        { name:  { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash'] },
      order:      [['createdAt', 'DESC']],
      limit:      lim,
      offset
    });

    return NextResponse.json({
      total: count,
      page,
      limit: lim,
      pages: Math.ceil(count / lim) || 1,
      staff: rows
    });
  } catch (err) {
    console.error('List staff error:', err);
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
  }
}
