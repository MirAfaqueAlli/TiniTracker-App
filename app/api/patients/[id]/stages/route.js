import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { withAuth } from '@/lib/middleware/withAuth';
import { PatientStage, StageTemplate } from '@/lib/db/models/index';
import { doctorStageType } from '@/lib/utils/rbac';

// GET /api/patients/[id]/stages
export async function GET(request, { params }) {
  const { user, errorResponse } = await withAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const stageType = doctorStageType(user);
    const templateWhere = stageType ? { type: stageType } : {};

    const stages = await PatientStage.findAll({
      where:   { patient_id: id },
      include: [{
        model: StageTemplate,
        as: 'template',
        ...(stageType ? { where: templateWhere, required: true } : {})
      }],
      order:   [['template', 'order_index', 'ASC']]
    });
    return NextResponse.json(stages);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch stages' }, { status: 500 });
  }
}
