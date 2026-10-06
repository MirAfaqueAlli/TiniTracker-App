import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate, PatientHistory, Hospital } from '@/lib/db/models/index';
import { recalculateOnEddChange } from '@/lib/services/stage.service';
import { sendWhatsApp } from '@/lib/services/whatsapp.service';
import { createAppNotif } from '@/lib/services/appNotif.service';

// PUT /api/patients/[id]/edd
export async function PUT(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { edd, edd_source, lmp_date, ultrasound_scan_date } = await request.json();
    if (!edd) return NextResponse.json({ error: 'edd required' }, { status: 400 });

    const { id } = await params;
    const patient = await Patient.findByPk(id, {
      include: [{ model: Hospital, attributes: ['name', 'phone'] }]
    });
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    await patient.update({
      edd,
      edd_source,
      lmp_date:             lmp_date             || patient.lmp_date,
      ultrasound_scan_date: ultrasound_scan_date || patient.ultrasound_scan_date,
      edd_last_updated:     new Date()
    });

    await recalculateOnEddChange(patient);

    await sendWhatsApp(patient.whatsapp_number, 'edd_updated', {
      patient_name:  patient.name,
      new_edd:       edd,
      source:        edd_source || 'updated',
      hospital_name: patient.Hospital?.name,
    }, patient.id, null, patient.hospital_id);

    // Audit log — fire-and-forget
    PatientHistory.create({
      patient_id:        patient.id,
      hospital_id:       patient.hospital_id,
      event_type:        'edd_updated',
      event_data:        { old_edd: patient.edd, new_edd: edd, source: edd_source },
      performed_by:      user.id,
      performed_by_role: user.role,
    }).catch(e => console.error('[History] edd_updated log failed:', e.message));

    // In-app notification
    createAppNotif({
      hospital_id:  patient.hospital_id,
      event_type:   'edd_updated',
      title:        `EDD updated: ${patient.name}`,
      body:         `Expected delivery date updated to ${edd} by ${user.name || 'staff'}`,
      patient_id:   patient.id,
      patient_name: patient.name,
      actor_id:     user.id,
      actor_name:   user.name || null,
      meta:         { old_edd: patient.edd, new_edd: edd, source: edd_source },
    });

    return NextResponse.json({ message: 'EDD updated and stages recalculated' });
  } catch (err) {
    console.error('Update EDD error:', err);
    return NextResponse.json({ error: 'Failed to update EDD' }, { status: 500 });
  }
}
