import { NextResponse } from 'next/server';
import { Op, literal } from 'sequelize';
import { addDays } from 'date-fns';
import { withAuth } from '@/lib/middleware/withAuth';
import { Patient, PatientStage, StageTemplate } from '@/lib/db/models/index';
import { generateStages } from '@/lib/services/stage.service';
import { doctorTypeFilter, doctorStageType, isAdmin, isStaff, hasPermission } from '@/lib/utils/rbac';
import { createAppNotif } from '@/lib/services/appNotif.service';

// GET /api/patients
export async function GET(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'patients.view'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to view patients' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const type   = searchParams.get('type');
    const sort   = searchParams.get('sort') || 'next_stage';
    const page   = parseInt(searchParams.get('page')  || '1');
    const limit  = parseInt(searchParams.get('limit') || '10');

    const hospitalId = user.hospital_id;
    const offset     = (page - 1) * limit;

    const where = { hospital_id: hospitalId };
    if (status) where.status = status;

    // Role-based type filtering: doctors only see their patient type
    const doctorTypes = doctorTypeFilter(user);
    const stageType   = doctorStageType(user);

    if (doctorTypes) {
      const allowedByRole = doctorTypes;
      if (type === 'pregnant') {
        const intersect = allowedByRole.filter(t => t === 'pregnant' || t === 'both');
        where.patient_type = intersect.length ? (intersect.length === 1 ? intersect[0] : { [Op.in]: intersect }) : { [Op.in]: [] };
      } else if (type === 'immunization') {
        const intersect = allowedByRole.filter(t => t === 'immunization' || t === 'both');
        where.patient_type = intersect.length ? { [Op.in]: intersect } : { [Op.in]: [] };
      } else {
        where.patient_type = { [Op.in]: allowedByRole };
      }
    } else {
      if (type === 'pregnant')          where.patient_type = 'pregnant';
      else if (type === 'immunization') where.patient_type = { [Op.in]: ['immunization', 'both'] };
    }

    if (search) {
      where[Op.or] = [
        { name:            { [Op.like]: `%${search}%` } },
        { whatsapp_number: { [Op.like]: `%${search}%` } },
      ];
    }

    const ORDER_MAP = {
      next_stage: [literal('next_stage_date IS NULL ASC'), literal('next_stage_date ASC')],
      name:       [[literal('`Patient`.`name`'), 'ASC']],
      registered: [[literal('`Patient`.`createdAt`'), 'DESC']],
      status:     [[literal('`Patient`.`status`'), 'ASC']],
    };
    const order = ORDER_MAP[sort] || ORDER_MAP.next_stage;

    const stageTypeCond = stageType ? `AND st.type = '${stageType}'` : '';

    const nextStageDateSub = literal(`(
      SELECT MIN(ps.scheduled_date)
      FROM patient_stages ps
      JOIN stage_templates st ON ps.stage_template_id = st.id
      WHERE ps.patient_id = \`Patient\`.\`id\`
        AND ps.status IN ('pending','notified')
        AND ps.scheduled_date >= CURDATE()
        ${stageTypeCond}
    )`);

    const nextStageNameSub = literal(`(
      SELECT st.stage_name
      FROM patient_stages ps
      JOIN stage_templates st ON ps.stage_template_id = st.id
      WHERE ps.patient_id = \`Patient\`.\`id\`
        AND ps.status IN ('pending','notified')
        AND ps.scheduled_date >= CURDATE()
        ${stageTypeCond}
      ORDER BY ps.scheduled_date ASC
      LIMIT 1
    )`);

    const currentStageSub = literal(`(
      SELECT st.stage_name
      FROM patient_stages ps
      JOIN stage_templates st ON ps.stage_template_id = st.id
      WHERE ps.patient_id = \`Patient\`.\`id\`
        AND ps.status = 'visited'
        ${stageTypeCond}
      ORDER BY ps.actual_visit_date DESC, ps.scheduled_date DESC
      LIMIT 1
    )`);

    const { count, rows } = await Patient.findAndCountAll({
      where,
      attributes: {
        include: [
          [nextStageDateSub, 'next_stage_date'],
          [nextStageNameSub, 'next_stage_name'],
          [currentStageSub,  'current_stage_name'],
        ],
      },
      order,
      limit,
      offset,
      subQuery: false,
      raw:      true,
      nest:     false,
    });

    const formattedRows = rows.map((p) => {
      if (user.role === 'doctor_pregnancy' && p.patient_type === 'both') {
        return {
          ...p,
          status: 'completed',
          next_stage_date: null,
          next_stage_name: null,
          current_stage_name: p.current_stage_name || 'Delivery',
        };
      }
      return p;
    });

    const baseWhere = { hospital_id: hospitalId };
    const [pregnantCount, immunizationCount] = await Promise.all([
      user.role === 'doctor_pregnancy'
        ? Patient.count({ where: { ...baseWhere, patient_type: { [Op.in]: ['pregnant', 'both'] } } })
        : doctorTypes && !doctorTypes.includes('pregnant')
          ? Promise.resolve(0)
          : Patient.count({ where: { ...baseWhere, patient_type: 'pregnant' } }),
      doctorTypes && !doctorTypes.some(t => t === 'immunization' || t === 'both')
        ? Promise.resolve(0)
        : Patient.count({ where: { ...baseWhere, patient_type: { [Op.in]: ['immunization', 'both'] } } }),
    ]);

    return NextResponse.json({
      total:    count,
      page,
      limit,
      pages:    Math.ceil(count / limit),
      patients: formattedRows,
      counts: {
        all:          pregnantCount + immunizationCount,
        pregnant:     pregnantCount,
        immunization: immunizationCount,
      },
    });
  } catch (err) {
    console.error('List patients error:', err);
    return NextResponse.json({ error: 'Failed to fetch patients' }, { status: 500 });
  }
}

// POST /api/patients
export async function POST(request) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  if (!(await hasPermission(user, 'patients.create'))) {
    return NextResponse.json({ error: 'Access denied: you do not have permission to register new patients' }, { status: 403 });
  }

  try {
    const {
      whatsapp_number, name, age, address, patient_type,
      lmp_date, edd, edd_source, ultrasound_scan_date,
      child_dob, child_name, child_gender, notes
    } = await request.json();

    if (!whatsapp_number || !name || !patient_type)
      return NextResponse.json({ error: 'whatsapp_number, name and patient_type are required' }, { status: 400 });

    // Role-based check
    if (user.role === 'doctor_pregnancy' && patient_type !== 'pregnant')
      return NextResponse.json({ error: 'Pregnancy doctors can only register pregnant patients' }, { status: 403 });
    if (user.role === 'doctor_immunization' && patient_type !== 'immunization')
      return NextResponse.json({ error: 'Immunization doctors can only register immunization patients' }, { status: 403 });

    // ── WhatsApp collision check BEFORE insert ────────────────────────────────
    const existing = await Patient.findOne({
      where: { whatsapp_number },
      include: [{
        model: PatientStage,
        as: 'stages',
        include: [{ model: StageTemplate, as: 'template', attributes: ['stage_name', 'type', 'order_index'] }],
      }],
    });

    if (existing) {
      // Same hospital — already registered here
      if (existing.hospital_id === user.hospital_id) {
        return NextResponse.json({
          error:      'patient_exists_here',
          message:    'This WhatsApp number is already registered at your hospital.',
          patient_id: existing.id,
          patient: {
            id:           existing.id,
            name:         existing.name,
            patient_type: existing.patient_type,
            status:       existing.status,
          },
        }, { status: 409 });
      }

      // Different hospital — show transfer candidate preview to ALL roles
      // (doctors can see the patient info; transfer action is protected at its own endpoint)

      const allStages    = existing.stages || [];
      const visited      = allStages.filter(s => s.status === 'visited').length;
      const upcoming     = allStages.filter(s => ['pending', 'notified'].includes(s.status)).length;
      const skipped      = allStages.filter(s => s.status === 'skipped').length;
      const lastVisited  = [...allStages]
        .filter(s => s.status === 'visited')
        .sort((a, b) => new Date(b.actual_visit_date || b.scheduled_date) - new Date(a.actual_visit_date || a.scheduled_date))[0];
      const nextUpcoming = [...allStages]
        .filter(s => ['pending', 'notified'].includes(s.status))
        .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))[0];

      return NextResponse.json({
        error:              'patient_exists_elsewhere',
        message:            'This patient is already registered at another TiniTraker hospital.',
        transfer_candidate: true,
        patient: {
          id:              existing.id,
          name:            existing.name,
          whatsapp_number: existing.whatsapp_number,
          patient_type:    existing.patient_type,
          status:          existing.status,
          age:             existing.age,
          address:         existing.address,
          stage_summary: {
            total:        allStages.length,
            visited,
            upcoming,
            skipped,
            progress_pct: allStages.length > 0 ? Math.round((visited / allStages.length) * 100) : 0,
            last_visited:  lastVisited  ? { name: lastVisited.template?.stage_name,  date: lastVisited.actual_visit_date  } : null,
            next_upcoming: nextUpcoming ? { name: nextUpcoming.template?.stage_name, date: nextUpcoming.scheduled_date    } : null,
          },
        },
      }, { status: 409 });
    }
    // ─────────────────────────────────────────────────────────────────────────

    let finalEdd       = edd    || null;
    let finalEddSource = edd_source || 'direct_entry';

    if (patient_type === 'pregnant') {
      if (!finalEdd && lmp_date) {
        finalEdd       = addDays(new Date(lmp_date), 280);
        finalEddSource = 'lmp_calculated';
      }
      if (!finalEdd)
        return NextResponse.json({ error: 'EDD or LMP date required for pregnant patients' }, { status: 400 });
    }

    if (patient_type === 'immunization' && !child_dob)
      return NextResponse.json({ error: 'child_dob required for immunization patients' }, { status: 400 });

    const patient = await Patient.create({
      hospital_id:          user.hospital_id,
      whatsapp_number,
      name,
      age:                  age || null,
      address:              address || null,
      patient_type,
      lmp_date:             lmp_date             || null,
      edd:                  finalEdd,
      edd_source:           finalEddSource,
      edd_last_updated:     patient_type === 'pregnant' ? new Date() : null,
      ultrasound_scan_date: ultrasound_scan_date || null,
      child_dob:            child_dob            || null,
      child_name:           child_name           || null,
      child_gender:         child_gender         || null,
      notes:                notes                || null,
      registered_by:        user.id,
    });

    if (patient_type === 'pregnant') {
      await generateStages(patient, 'pregnancy');
    } else {
      await generateStages(patient, 'immunization');
    }

    // ── In-app notification (fire-and-forget) ──
    const typeLabel = patient_type === 'pregnant' ? 'Pregnant Patient' : 'Immunization Patient';
    createAppNotif({
      hospital_id:  user.hospital_id,
      event_type:   'patient_registered',
      title:        `New patient registered: ${name}`,
      body:         `${typeLabel} registered by ${user.name || 'staff'}`,
      patient_id:   patient.id,
      patient_name: name,
      actor_id:     user.id,
      actor_name:   user.name || null,
      meta:         { patient_type },
    });

    return NextResponse.json(
      { message: 'Patient registered successfully', patient_id: patient.id },
      { status: 201 }
    );
  } catch (err) {
    console.error('Register patient error:', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
