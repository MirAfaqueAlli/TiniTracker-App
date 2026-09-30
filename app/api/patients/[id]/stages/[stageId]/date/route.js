import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, PatientHistory } from '@/lib/db/models/index';
import { sendWhatsApp } from '@/lib/services/whatsapp.service';
import { createAppNotif } from '@/lib/services/appNotif.service';
import { hasPermission } from '@/lib/utils/rbac';

// PUT /api/patients/[id]/stages/[stageId]/date  — override date
export async function PUT(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'stages.reschedule'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to reschedule appointments' }, { status: 403 });
  }

  try {
    const { id, stageId } = await params;
    const { new_date, override_reason, cascade = false } = await request.json();
    if (!new_date) return NextResponse.json({ error: 'new_date required' }, { status: 400 });
    if (!override_reason || !override_reason.trim())
      return NextResponse.json({ error: 'Reason is mandatory for rescheduling' }, { status: 400 });

    const stage = await PatientStage.findOne({
      where:   { id: stageId, patient_id: id },
      include: [{ model: StageTemplate, as: 'template' }]
    });
    if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    const [oldY, oldM, oldD] = (stage.scheduled_date || '').split('-').map(Number);
    const [newY, newM, newD] = new_date.split('-').map(Number);
    const oldUtc  = Date.UTC(oldY, oldM - 1, oldD);
    const newUtc  = Date.UTC(newY, newM - 1, newD);
    const diffDays = Math.round((newUtc - oldUtc) / (1000 * 60 * 60 * 24));

    await stage.update({
      scheduled_date:  new_date,
      date_overridden: true,
      override_reason: override_reason.trim(),
      recorded_by:     user.id
    });

    let cascadedCount = 0;
    if (cascade && diffDays !== 0) {
      const subsequentStages = await PatientStage.findAll({
        where: { patient_id: id, status: { [Op.in]: ['pending', 'notified'] } },
        include: [{ model: StageTemplate, as: 'template', where: { type: stage.template.type, order_index: { [Op.gt]: stage.template.order_index } } }],
        order: [['template', 'order_index', 'ASC']]
      });
      for (const sub of subsequentStages) {
        if (sub.scheduled_date) {
          const [sY, sM, sD] = sub.scheduled_date.split('-').map(Number);
          const nextDate = new Date(Date.UTC(sY, sM - 1, sD + diffDays));
          const formattedNext = nextDate.toISOString().split('T')[0];
          await sub.update({
            scheduled_date:  formattedNext,
            date_overridden: true,
            override_reason: `Cascaded (${diffDays > 0 ? '+' : ''}${diffDays}d) from ${stage.template.stage_name}: ${override_reason.trim()}`,
            recorded_by:     user.id
          });
          cascadedCount++;
        }
      }
    }

    // Send WhatsApp notification to patient about rescheduled appointment
    try {
      const patient = await Patient.findByPk(id);
      if (patient?.whatsapp_number) {
        await sendWhatsApp(
          patient.whatsapp_number,
          'stage_rescheduled',
          {
            patient_name: patient.name,
            stage_name:   stage.template?.stage_name || 'appointment',
            new_date,
            reason:       override_reason.trim(),
          },
          patient.id,
          stage.id,
          patient.hospital_id
        );
      }
    } catch (waErr) {
      // Non-fatal — log but don't fail the reschedule action
      console.error('[Reschedule] WhatsApp notify failed:', waErr.message);
    }

    // Audit log — fire-and-forget
    Patient.findByPk(id).then(patient => {
      if (patient) {
        PatientHistory.create({
          patient_id:        patient.id,
          hospital_id:       patient.hospital_id,
          event_type:        'stage_rescheduled',
          event_data:        { stage_name: stage.template?.stage_name, new_date, reason: override_reason.trim(), cascaded: cascadedCount },
          performed_by:      user.id,
          performed_by_role: user.role,
        }).catch(e => console.error('[History] stage_rescheduled log failed:', e.message));

        // In-app notification
        createAppNotif({
          hospital_id:  patient.hospital_id,
          event_type:   'stage_rescheduled',
          title:        `Appointment rescheduled: ${stage.template?.stage_name || 'Appointment'}`,
          body:         `${patient.name} — rescheduled to ${new_date} by ${user.name || 'staff'}`,
          patient_id:   patient.id,
          patient_name: patient.name,
          actor_id:     user.id,
          actor_name:   user.name || null,
          meta:         { stage_name: stage.template?.stage_name, new_date, reason: override_reason.trim() },
        });
      }
    }).catch(() => {});

    return NextResponse.json({
      message: cascade
        ? `Stage and ${cascadedCount} subsequent stage(s) rescheduled successfully`
        : 'Stage rescheduled successfully',
      scheduled_date: new_date,
      cascaded: cascadedCount
    });
  } catch (err) {
    console.error('Override date error:', err);
    return NextResponse.json({ error: 'Failed to reschedule stage' }, { status: 500 });
  }
}

// DELETE /api/patients/[id]/stages/[stageId]/date — reset override
export async function DELETE(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id, stageId } = await params;
    const { calcStageDate } = await import('@/lib/services/stage.service');
    const { Patient } = await import('@/lib/db/models/index');

    const stage = await PatientStage.findOne({
      where:   { id: stageId, patient_id: id },
      include: [{ model: StageTemplate, as: 'template' }]
    });
    if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    const patient     = await Patient.findByPk(id);
    const formulaDate = calcStageDate(patient, stage.template);

    await stage.update({ scheduled_date: formulaDate, date_overridden: false, override_reason: null });
    return NextResponse.json({ message: 'Override reset to formula date', scheduled_date: formulaDate });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to reset override' }, { status: 500 });
  }
}
