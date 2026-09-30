import { NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/middleware/withProviderAuth';
import {
  Hospital,
  User,
  Patient,
  Subscription,
  Payment,
  SystemConfig,
  PatientStage,
  PatientHistory,
  Notification,
  Role,
  RolePermission,
  AppNotification,
  sequelize,
} from '@/lib/db/models/index';

// GET /api/provider/hospitals/[id] — get full detail of a hospital
export async function GET(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const hospital = await Hospital.findByPk(id, {
      include: [
        {
          model: Subscription,
          separate: true,
          order: [['createdAt', 'DESC']],
        },
        {
          model: Payment,
          separate: true,
          order: [['payment_date', 'DESC'], ['createdAt', 'DESC']],
        },
        {
          model: User,
          attributes: ['id', 'name', 'email', 'role', 'force_password_change', 'createdAt', 'updatedAt'],
          separate: true,
          order: [['createdAt', 'ASC']],
        },
        {
          model: SystemConfig,
          required: false,
        }
      ],
    });

    if (!hospital) {
      return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
    }

    const patientCount = await Patient.count({ where: { hospital_id: id } });

    const today = new Date().toISOString().split('T')[0];
    const activeSub = hospital.Subscriptions?.find(s => s.is_active && s.ends_at >= today) || null;
    const latestSub = hospital.Subscriptions?.[0] || null;

    return NextResponse.json({
      hospital: {
        id:                    hospital.id,
        name:                  hospital.name,
        address:               hospital.address,
        phone:                 hospital.phone,
        whatsapp_sender_id:    hospital.whatsapp_sender_id,
        whatsapp_api_url:      hospital.whatsapp_api_url,
        whatsapp_api_key:      hospital.whatsapp_api_key ? '••••••••' : null,
        whatsapp_api_provider: hospital.whatsapp_api_provider,
        is_blocked:            Boolean(hospital.is_blocked),
        createdAt:             hospital.createdAt,
        updatedAt:             hospital.updatedAt,
        system_config:         hospital.SystemConfig || null,
        active_subscription:   activeSub,
        latest_subscription:   latestSub,
        subscriptions:         hospital.Subscriptions || [],
        payments:              hospital.Payments || [],
        users:                 hospital.Users || [],
        patient_count:         patientCount,
        user_count:            hospital.Users?.length || 0,
      }
    });
  } catch (err) {
    console.error('Fetch hospital detail error:', err);
    return NextResponse.json({ error: 'Failed to fetch hospital details' }, { status: 500 });
  }
}

// PATCH /api/provider/hospitals/[id] — update hospital profile
export async function PATCH(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const hospital = await Hospital.findByPk(id);
    if (!hospital) {
      return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
    }

    const body = await request.json();
    const allowed = ['name', 'address', 'phone', 'whatsapp_sender_id', 'whatsapp_api_url', 'whatsapp_api_key', 'whatsapp_api_provider'];

    const updates = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    await hospital.update(updates);

    return NextResponse.json({
      message: 'Hospital profile updated successfully',
      hospital: {
        id:         hospital.id,
        name:       hospital.name,
        address:    hospital.address,
        phone:      hospital.phone,
        is_blocked: Boolean(hospital.is_blocked),
      }
    });
  } catch (err) {
    console.error('Update hospital error:', err);
    return NextResponse.json({ error: 'Failed to update hospital' }, { status: 500 });
  }
}

// DELETE /api/provider/hospitals/[id] — cascade delete a hospital and all associated data
export async function DELETE(request, { params }) {
  const { admin, errorResponse } = await withProviderAuth(request);
  if (errorResponse) return errorResponse;

  const t = await sequelize.transaction();
  try {
    const { id } = await params;
    const hospital = await Hospital.findByPk(id, { transaction: t });
    if (!hospital) {
      await t.rollback();
      return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
    }

    // 1. Find all patients belonging to this hospital
    const patients = await Patient.findAll({
      where: { hospital_id: id },
      attributes: ['id'],
      transaction: t,
    });
    const patientIds = patients.map(p => p.id);

    if (patientIds.length > 0) {
      // Find patient stages
      const stages = await PatientStage.findAll({
        where: { patient_id: patientIds },
        attributes: ['id'],
        transaction: t,
      });
      const stageIds = stages.map(s => s.id);

      // Delete notifications
      if (Notification) {
        await Notification.destroy({ where: { patient_id: patientIds }, transaction: t });
      }
      if (PatientHistory) {
        await PatientHistory.destroy({ where: { patient_id: patientIds }, transaction: t });
      }
      if (PatientStage && stageIds.length > 0) {
        await PatientStage.destroy({ where: { id: stageIds }, transaction: t });
      }
      await Patient.destroy({ where: { id: patientIds }, transaction: t });
    }

    // 2. Delete Payments & Subscriptions
    if (Payment) {
      await Payment.destroy({ where: { hospital_id: id }, transaction: t });
    }
    if (Subscription) {
      await Subscription.destroy({ where: { hospital_id: id }, transaction: t });
    }

    // 3. Delete Roles & Permissions
    if (RolePermission) {
      await RolePermission.destroy({ where: { hospital_id: id }, transaction: t });
    }
    if (Role) {
      await Role.destroy({ where: { hospital_id: id }, transaction: t });
    }

    // 4. Delete SystemConfig & AppNotifications
    if (SystemConfig) {
      await SystemConfig.destroy({ where: { hospital_id: id }, transaction: t });
    }
    if (AppNotification) {
      await AppNotification.destroy({ where: { hospital_id: id }, transaction: t });
    }

    // 5. Delete Users
    await User.destroy({ where: { hospital_id: id }, transaction: t });

    // 6. Delete Hospital itself
    await hospital.destroy({ transaction: t });

    await t.commit();
    return NextResponse.json({ message: `Hospital "${hospital.name}" and all associated data have been permanently deleted.` });
  } catch (err) {
    await t.rollback();
    console.error('Delete hospital error:', err);
    return NextResponse.json({ error: 'Failed to delete hospital: ' + err.message }, { status: 500 });
  }
}
