import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Subscription } from '@/lib/db/models/index';

export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  let subscription = null;
  if (user.hospital_id) {
    try {
      const activeSub = await Subscription.findOne({
        where: {
          hospital_id: user.hospital_id,
          is_active: true,
        },
        order: [['ends_at', 'DESC']],
      });
      if (activeSub) {
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const endsDate = new Date(activeSub.ends_at);
        endsDate.setHours(0, 0, 0, 0);
        const diffTime = endsDate - todayDate;
        const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        subscription = {
          id: activeSub.id,
          plan: activeSub.plan,
          is_active: activeSub.is_active,
          starts_at: activeSub.starts_at,
          ends_at: activeSub.ends_at,
          is_trial: activeSub.plan === 'free_trial',
          days_remaining: daysRemaining,
        };
      }
    } catch (e) {
      console.error('Error fetching subscription in /auth/me:', e);
    }
  }

  return NextResponse.json({
    user: {
      id:                    user.id,
      name:                  user.name,
      email:                 user.email,
      role:                  user.role,
      hospital_id:           user.hospital_id,
      hospital:              user.Hospital?.name,
      hospital_name:         user.Hospital?.name,
      hospital_address:      user.Hospital?.address,
      hospital_phone:        user.Hospital?.phone,
      Hospital:              user.Hospital,
      force_password_change: user.force_password_change ?? false,
      subscription,
    }
  });
}

