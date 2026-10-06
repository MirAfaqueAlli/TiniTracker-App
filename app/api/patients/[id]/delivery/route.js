import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, PatientHistory, Hospital } from '@/lib/db/models/index';
import { generateStages } from '@/lib/services/stage.service';
import { sendWhatsApp } from '@/lib/services/whatsapp.service';
import { createAppNotif } from '@/lib/services/appNotif.service';

// POST /api/patients/[id]/delivery
export async function POST(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { delivery_date, child_dob, child_name, child_gender } = await request.json();
    if (!child_dob) return NextResponse.json({ error: 'child_dob required' }, { status: 400 });

    const { id } = await params;
    const patient = await Patient.findByPk(id, {
      include: [{ model: Hospital, attributes: ['name', 'phone'] }]
    });
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    await patient.update({
      delivery_date,
      child_dob,
      child_name,
      child_gender,
      // 'both' = patient is visible in pregnancy dept (as completed history)
      //          AND in immunization dept (as active immunization patient).
      // 'both' is now a valid ENUM value — the backend model was missing it (now fixed).
      patient_type: patient.patient_type === 'pregnant' ? 'both' : patient.patient_type,
      status: 'active', // stays active for the immunization journey ahead
    });

    const deliveryTemplate = await StageTemplate.findOne({ where: { stage_code: 'DELIVERY' } });
    if (deliveryTemplate) {
      await PatientStage.update(
        { status: 'visited', actual_visit_date: delivery_date || new Date(), recorded_by: user.id },
        { where: { patient_id: patient.id, stage_template_id: deliveryTemplate.id } }
      );
    }

    // Mark any other remaining pending/notified pregnancy stages as skipped since delivery has occurred
    const pregTemplates = await StageTemplate.findAll({
      where: { type: 'pregnancy', stage_code: { [Op.ne]: 'DELIVERY' } },
      attributes: ['id']
    });
    const pregIds = pregTemplates.map(t => t.id);
    if (pregIds.length > 0) {
      await PatientStage.update(
        { status: 'skipped', skip_reason: 'delivery_completed', recorded_by: user.id },
        {
          where: {
            patient_id: patient.id,
            stage_template_id: { [Op.in]: pregIds },
            status: { [Op.in]: ['pending', 'notified'] }
          }
        }
      );
    }

    await generateStages(patient, 'immunization');

    const firstImmStage = await PatientStage.findOne({
      where:   { patient_id: patient.id, status: 'pending' },
      include: [{ model: StageTemplate, as: 'template', where: { type: 'immunization' } }],
      order:   [['scheduled_date', 'ASC']]
    });

    await sendWhatsApp(patient.whatsapp_number, 'delivery_recorded', {
      patient_name:   patient.name,
      child_name:     child_name || 'your baby',
      first_imm:      firstImmStage?.template?.stage_name || 'At Birth',
      first_imm_date: firstImmStage?.scheduled_date       || child_dob,
      hospital_name:  patient.Hospital?.name,
    }, patient.id, null, patient.hospital_id);

    // Audit log — fire-and-forget
    PatientHistory.create({
      patient_id:        patient.id,
      hospital_id:       patient.hospital_id,
      event_type:        'delivery_recorded',
      event_data:        { delivery_date, child_dob, child_name, child_gender },
      performed_by:      user.id,
      performed_by_role: user.role,
    }).catch(e => console.error('[History] delivery_recorded log failed:', e.message));

    // In-app notification
    createAppNotif({
      hospital_id:  patient.hospital_id,
      event_type:   'delivery_recorded',
      title:        `Delivery recorded: ${patient.name}`,
      body:         `Baby${child_name ? ` ${child_name}` : ''} born — immunization schedule started. Recorded by ${user.name || 'staff'}.`,
      patient_id:   patient.id,
      patient_name: patient.name,
      actor_id:     user.id,
      actor_name:   user.name || null,
      meta:         { delivery_date, child_dob, child_name, child_gender },
    });

    return NextResponse.json({ message: 'Delivery recorded and immunization stages generated' });
  } catch (err) {
    console.error('Record delivery error:', err);
    return NextResponse.json({ error: 'Failed to record delivery' }, { status: 500 });
  }
}
