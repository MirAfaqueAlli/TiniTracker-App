import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { sequelize, Patient, PatientStage, StageTemplate, PatientHistory, Hospital } from '@/lib/db/models/index';
import { generateStages } from '@/lib/services/stage.service';
import { sendWhatsApp } from '@/lib/services/whatsapp.service';
import { createAppNotif } from '@/lib/services/appNotif.service';
import { hasPermission, canAccessPatientAsync } from '@/lib/utils/rbac';

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

// POST /api/patients/[id]/delivery
export async function POST(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const {
      delivery_date,
      child_dob,
      child_name,
      child_gender,
      delivery_mode,
      birth_weight,
      apgar_1min,
      apgar_5min,
      delivery_notes,
    } = body || {};

    if (!child_dob) return NextResponse.json({ error: 'child_dob required' }, { status: 400 });

    const birthWeight = optionalNumber(birth_weight);
    const apgar1 = optionalNumber(apgar_1min);
    const apgar5 = optionalNumber(apgar_5min);

    if (Number.isNaN(birthWeight) || (birthWeight !== null && (birthWeight <= 0 || birthWeight > 20))) {
      return NextResponse.json({ error: 'birth_weight must be a valid weight in kg' }, { status: 400 });
    }
    for (const [label, value] of [['apgar_1min', apgar1], ['apgar_5min', apgar5]]) {
      if (Number.isNaN(value) || (value !== null && (value < 0 || value > 10))) {
        return NextResponse.json({ error: `${label} must be between 0 and 10` }, { status: 400 });
      }
    }

    const { id } = await params;
    const patient = await Patient.findByPk(id, {
      include: [{ model: Hospital, attributes: ['name', 'phone'] }],
    });
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    // ── Tenant isolation, patient-type access & permission ────────────────
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!(await canAccessPatientAsync(user, patient.patient_type)))
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });
    const canRecordDelivery = (await hasPermission(user, 'stages.record_delivery'))
      || (await hasPermission(user, 'patients.edit'));
    if (!canRecordDelivery)
      return NextResponse.json({ error: 'Access denied: you do not have permission to record deliveries' }, { status: 403 });

    // Delivery is only valid for an active pregnancy.
    if (!(patient.patient_type === 'pregnant' || patient.patient_type === 'both')) {
      return NextResponse.json({ error: 'Delivery can only be recorded for pregnant patients' }, { status: 400 });
    }

    // Duplicate guard — a delivery must only be recorded once.
    if (patient.delivery_date || patient.child_dob) {
      return NextResponse.json({ error: 'Delivery has already been recorded for this patient' }, { status: 409 });
    }

    const effectiveDeliveryDate = delivery_date || child_dob;
    const notes = delivery_notes !== undefined ? delivery_notes : (body.notes || null);

    const deliveryTemplate = await StageTemplate.findOne({ where: { stage_code: 'DELIVERY' } });

    // Delivery record + pregnancy closure + immunization generation are atomic.
    await sequelize.transaction(async (t) => {
      await patient.update({
        delivery_date:  effectiveDeliveryDate,
        delivery_mode:  delivery_mode || null,
        birth_weight:   birthWeight,
        apgar_1min:     apgar1,
        apgar_5min:     apgar5,
        delivery_notes: notes || null,
        child_dob,
        child_name,
        child_gender,
        // 'both' = visible in pregnancy history AND active immunization journey.
        patient_type: patient.patient_type === 'pregnant' ? 'both' : patient.patient_type,
        status: 'active',
      }, { transaction: t });

      if (deliveryTemplate) {
        await PatientStage.update(
          {
            status: 'visited',
            actual_visit_date: effectiveDeliveryDate || new Date(),
            recorded_by: user.id,
          },
          { where: { patient_id: patient.id, stage_template_id: deliveryTemplate.id }, transaction: t }
        );
      }

      // Close any remaining pregnancy stages.
      const pregTemplates = await StageTemplate.findAll({
        where: { type: 'pregnancy', stage_code: { [Op.ne]: 'DELIVERY' } },
        attributes: ['id'],
        transaction: t,
      });
      const pregIds = pregTemplates.map((tpl) => tpl.id);
      if (pregIds.length > 0) {
        await PatientStage.update(
          {
            status: 'skipped',
            skip_reason: 'delivery_completed',
            recorded_by: user.id,
          },
          {
            where: {
              patient_id: patient.id,
              stage_template_id: { [Op.in]: pregIds },
              status: { [Op.in]: ['pending', 'notified'] },
            },
            transaction: t,
          }
        );
      }

      // Idempotent: existing immunization rows are never duplicated.
      await generateStages(patient, 'immunization', { transaction: t });
    });

    const firstImmStage = await PatientStage.findOne({
      where: { patient_id: patient.id, status: 'pending' },
      include: [{ model: StageTemplate, as: 'template', where: { type: 'immunization' } }],
      order: [['scheduled_date', 'ASC']],
    });

    try {
      await sendWhatsApp(patient.whatsapp_number, 'delivery_recorded', {
        patient_name:   patient.name,
        child_name:     child_name || 'your baby',
        first_imm:      firstImmStage?.template?.stage_name || 'At Birth',
        first_imm_date: firstImmStage?.scheduled_date || child_dob,
        hospital_name:  patient.Hospital?.name,
      }, patient.id, null, patient.hospital_id);
    } catch (waErr) {
      console.error('[Delivery] WhatsApp notify failed:', waErr.message);
    }

    await PatientHistory.create({
      patient_id:        patient.id,
      hospital_id:       patient.hospital_id,
      event_type:        'delivery_recorded',
      event_data: {
        delivery_date:  effectiveDeliveryDate,
        delivery_mode,
        birth_weight:   birthWeight,
        apgar_1min:     apgar1,
        apgar_5min:     apgar5,
        delivery_notes: notes || null,
        child_dob,
        child_name,
        child_gender,
      },
      performed_by:      user.id,
      performed_by_role: user.role,
    });

    createAppNotif({
      hospital_id:  patient.hospital_id,
      event_type:   'delivery_recorded',
      title:        `Delivery recorded: ${patient.name}`,
      body:         `Baby${child_name ? ` ${child_name}` : ''} born — immunization schedule started. Recorded by ${user.name || 'staff'}.`,
      patient_id:   patient.id,
      patient_name: patient.name,
      actor_id:     user.id,
      actor_name:   user.name || null,
      meta: {
        delivery_date: effectiveDeliveryDate,
        delivery_mode,
        birth_weight: birthWeight,
        apgar_1min: apgar1,
        apgar_5min: apgar5,
        child_dob,
        child_name,
        child_gender,
      },
    });

    return NextResponse.json({ message: 'Delivery recorded and immunization stages generated' });
  } catch (err) {
    console.error('Record delivery error:', err);
    return NextResponse.json({ error: 'Failed to record delivery' }, { status: 500 });
  }
}
