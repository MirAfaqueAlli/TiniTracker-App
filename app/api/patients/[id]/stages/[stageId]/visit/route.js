import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, PatientHistory, Hospital } from '@/lib/db/models/index';
import { sendWhatsApp } from '@/lib/services/whatsapp.service';
import { createAppNotif } from '@/lib/services/appNotif.service';
import { hasPermission } from '@/lib/utils/rbac';

// PUT /api/patients/[id]/stages/[stageId]/visit
export async function PUT(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'stages.mark_visit'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to mark visits as completed' }, { status: 403 });
  }

  try {
    const { id, stageId } = await params;
    const { actual_visit_date, stage_data, notes, next_stage_notes } = await request.json();
    const stage = await PatientStage.findOne({
      where: { id: stageId, patient_id: id }
    });
    if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    const template = await StageTemplate.findByPk(stage.stage_template_id);
    if (!template) return NextResponse.json({ error: 'Stage template not found' }, { status: 400 });

    // Auto-skip all previous pending/notified stages of same type
    const previousIncompleteStages = await PatientStage.findAll({
      where: { patient_id: id, status: { [Op.in]: ['pending', 'notified'] } },
      include: [{ model: StageTemplate, as: 'template', where: { type: template.type, order_index: { [Op.lt]: template.order_index } } }]
    });

    for (const prevStage of previousIncompleteStages) {
      await prevStage.update({ status: 'skipped', skip_reason: 'staff_decision', recorded_by: user.id });
    }

    await stage.update({
      status:            'visited',
      actual_visit_date: actual_visit_date || new Date(),
      stage_data:        stage_data || null,
      notes:             notes || next_stage_notes || null,
      recorded_by:       user.id
    });

    const patient = await Patient.findByPk(id, {
      include: [{ model: Hospital, attributes: ['name', 'phone'] }]
    });
    const nextStage = await PatientStage.findOne({
      where:   { patient_id: id, status: { [Op.in]: ['pending', 'notified'] } },
      include: [{ model: StageTemplate, as: 'template' }],
      order:   [['template', 'order_index', 'ASC']]
    });

    if (nextStage && next_stage_notes) {
      await nextStage.update({ notes: next_stage_notes });
    }

    await sendWhatsApp(patient.whatsapp_number, 'stage_complete', {
      patient_name:  patient.name,
      stage_name:    template.stage_name,
      next_stage:    nextStage?.template?.stage_name || 'Journey complete!',
      next_date:     nextStage?.scheduled_date       || '',
      hospital_name: patient.Hospital?.name,
    }, patient.id, stage.id, patient.hospital_id);

    // Audit log
    PatientHistory.create({
      patient_id:        patient.id,
      hospital_id:       patient.hospital_id,
      event_type:        'stage_visited',
      event_data:        { stage_name: template.stage_name, visit_date: actual_visit_date || new Date(), notes },
      performed_by:      user.id,
      performed_by_role: user.role,
    }).catch(e => console.error('[History] stage_visited log failed:', e.message));

    // In-app notification
    createAppNotif({
      hospital_id:  patient.hospital_id,
      event_type:   'visit_marked',
      title:        `Visit marked: ${template.stage_name}`,
      body:         `${patient.name} — ${template.stage_name} marked as visited by ${user.name || 'staff'}`,
      patient_id:   patient.id,
      patient_name: patient.name,
      actor_id:     user.id,
      actor_name:   user.name || null,
      meta:         { stage_name: template.stage_name },
    });

    return NextResponse.json({ message: 'Stage marked as visited', next_stage: nextStage });
  } catch (err) {
    console.error('Mark visited error:', err);
    return NextResponse.json({ error: 'Failed to mark visited' }, { status: 500 });
  }
}
