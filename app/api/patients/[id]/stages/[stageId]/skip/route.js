import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, PatientHistory, Hospital } from '@/lib/db/models/index';
import { Op } from 'sequelize';
import { sendWhatsApp } from '@/lib/services/whatsapp.service';
import { createAppNotif } from '@/lib/services/appNotif.service';
import { hasPermission, canAccessPatientAsync } from '@/lib/utils/rbac';

// PUT /api/patients/[id]/stages/[stageId]/skip
export async function PUT(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'stages.skip'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to skip appointment stages' }, { status: 403 });
  }

  try {
    const { reason } = await request.json();
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'Reason is mandatory for skipping a stage' }, { status: 400 });
    }
    const { id, stageId } = await params;

    // ── Tenant isolation & patient-type access ────────────────────────────
    const patient = await Patient.findByPk(id, {
      include: [{ model: Hospital, attributes: ['name', 'phone'] }]
    });
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    if (patient.hospital_id !== user.hospital_id)
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    if (!(await canAccessPatientAsync(user, patient.patient_type)))
      return NextResponse.json({ error: 'Access denied — patient type mismatch' }, { status: 403 });

    const stage = await PatientStage.findOne({
      where: { id: stageId, patient_id: id },
      include: [{ model: StageTemplate, as: 'template' }]
    });
    if (!stage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 });

    // ── Stage-status guards ──────────────────────────────────────────────
    if (stage.status === 'visited') {
      return NextResponse.json({ error: 'Visited stages cannot be skipped' }, { status: 409 });
    }
    if (stage.status === 'skipped') {
      return NextResponse.json({ error: 'This stage is already skipped' }, { status: 409 });
    }

    const previousStatus = stage.status;
    await stage.update({ status: 'skipped', skip_reason: reason.trim(), recorded_by: user.id });

    // Send WhatsApp notification to patient
    try {
      if (patient?.whatsapp_number) {
        // Find next upcoming appointment
        const nextStage = await PatientStage.findOne({
          where:   { patient_id: id, status: { [Op.in]: ['pending', 'notified'] } },
          include: [{ model: StageTemplate, as: 'template' }],
          order:   [['template', 'order_index', 'ASC']]
        });
        await sendWhatsApp(
          patient.whatsapp_number,
          'stage_skipped',
          {
            patient_name:   patient.name,
            stage_name:     stage.template?.stage_name || 'appointment',
            scheduled_date: stage.scheduled_date || '—',
            reason:         reason.trim(),
            next_stage:     nextStage?.template?.stage_name || 'No upcoming appointments',
            next_date:      nextStage?.scheduled_date       || '—',
            hospital_name:  patient.Hospital?.name,
          },
          patient.id,
          stage.id,
          patient.hospital_id
        );
      }
    } catch (waErr) {
      // Non-fatal — log but don't fail the skip action
      console.error('[Skip] WhatsApp notify failed:', waErr.message);
    }

    // Audit log — must be recorded regardless of WhatsApp delivery, and never gated on a phone number.
    const auditPatient = await Patient.findByPk(id);
    if (auditPatient) {
      await PatientHistory.create({
        patient_id:        auditPatient.id,
        hospital_id:       auditPatient.hospital_id,
        event_type:        'stage_skipped',
        event_data:        {
          stage_name:      stage.template?.stage_name,
          reason:          reason.trim(),
          scheduled_date:  stage.scheduled_date,
          previous_status: previousStatus,
        },
        performed_by:      user.id,
        performed_by_role: user.role,
      });
    }

    // In-app notification
    try {
      const patient2 = await Patient.findByPk(id);
      if (patient2) {
        createAppNotif({
          hospital_id:  patient2.hospital_id,
          event_type:   'stage_skipped',
          title:        `Stage skipped: ${stage.template?.stage_name || 'Appointment'}`,
          body:         `${patient2.name} — skipped by ${user.name || 'staff'}: "${reason.trim()}"`,
          patient_id:   patient2.id,
          patient_name: patient2.name,
          actor_id:     user.id,
          actor_name:   user.name || null,
          meta:         { stage_name: stage.template?.stage_name, reason: reason.trim() },
        });
      }
    } catch {} // fire-and-forget

    return NextResponse.json({ message: 'Stage skipped successfully', skip_reason: reason.trim() });
  } catch (err) {
    console.error('Mark skipped error:', err);
    return NextResponse.json({ error: 'Failed to skip stage' }, { status: 500 });
  }
}
