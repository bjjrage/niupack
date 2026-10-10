import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { requirePersonnelAdminIdentity, personnelAuthErrorResponse } from '@/lib/auth/personnel-guard';

export async function GET(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const { searchParams } = new URL(req.url);
    const targetDate = searchParams.get('target_date') || undefined;
    const activeOnly = searchParams.get('active_only') !== 'false';

    const bands = await repository.getSalaryBands(identity.organizationId, targetDate, activeOnly);
    return NextResponse.json({
      success: true,
      bands,
    });
  } catch (error) {
    return personnelAuthErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const body = await req.json();

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'NAME_REQUIRED', message: 'El nombre de la banda es obligatorio.' }, { status: 400 });
    }

    const salary = Number(body.monthly_salary_pyg);
    if (isNaN(salary) || salary < 0) {
      return NextResponse.json({ error: 'INVALID_SALARY', message: 'El salario mensual debe ser un número mayor o igual a 0.' }, { status: 400 });
    }

    if (body.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(body.status)) {
      return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }
    const validFrom = typeof body.valid_from === 'string' && body.valid_from.trim()
      ? body.valid_from.trim()
      : new Date().toISOString().split('T')[0];

    const band = await repository.createSalaryBand(
      {
        organization_id: identity.organizationId,
        name,
        description: body.description?.trim(),
        status: body.status || 'ACTIVE',
      },
      salary,
      validFrom,
      identity.organizationId,
      identity.profileId
    );

    return NextResponse.json({
      success: true,
      band,
    });
  } catch (error) {
    return personnelAuthErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const body = await req.json();

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: 'ID_REQUIRED', message: 'El ID de la banda es obligatorio.' }, { status: 400 });
    }

    let newSalary: number | undefined = undefined;
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
      return NextResponse.json({ error: 'INVALID_NAME', message: 'El nombre de la banda es obligatorio.' }, { status: 400 });
    }
    if (body.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(body.status)) {
      return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }
    if (body.monthly_salary_pyg !== undefined) {
      const salary = Number(body.monthly_salary_pyg);
      if (isNaN(salary) || salary < 0) {
        return NextResponse.json({ error: 'INVALID_SALARY', message: 'El salario mensual debe ser mayor o igual a 0.' }, { status: 400 });
      }
      newSalary = salary;
    }

    const updated = await repository.updateSalaryBand(
      id,
      {
        name: body.name?.trim(),
        description: body.description?.trim(),
        status: body.status,
      },
      newSalary,
      typeof body.valid_from === 'string' ? body.valid_from.trim() : undefined,
      identity.organizationId,
      identity.profileId
    );

    return NextResponse.json({
      success: true,
      band: updated,
    });
  } catch (error) {
    return personnelAuthErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID_REQUIRED', message: 'El ID de la banda es obligatorio.' }, { status: 400 });
    }

    const result = await repository.deleteOrDeactivateSalaryBand(id, identity.organizationId);
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    if (error?.message === 'SALARY_BAND_NOT_FOUND') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error?.message?.includes('asignaciones activas')) {
      return NextResponse.json({ error: 'BAND_IN_USE', message: error.message }, { status: 409 });
    }
    return personnelAuthErrorResponse(error);
  }
}
