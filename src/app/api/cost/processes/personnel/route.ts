import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { requirePersonnelAdminIdentity, personnelAuthErrorResponse } from '@/lib/auth/personnel-guard';
import { IndustrialSector } from '@/types';

const sectors: IndustrialSector[] = ['FORMADO', 'CALIDAD', 'EMPAQUE'];
const isDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export async function GET(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active_only') !== 'false';
    const sectorParam = searchParams.get('sector');
    if (sectorParam && !sectors.includes(sectorParam as IndustrialSector)) {
      return NextResponse.json({ error: 'INVALID_SECTOR' }, { status: 400 });
    }
    const sector = (sectorParam as IndustrialSector) || undefined;

    let personnel = await repository.getPersonnel(identity.organizationId, sector);
    if (activeOnly) {
      personnel = personnel.filter((p) => p.status === 'ACTIVE');
    }
    return NextResponse.json({
      success: true,
      personnel,
    });
  } catch (error) {
    return personnelAuthErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const body = await req.json();

    const employee_code = typeof body.employee_code === 'string' ? body.employee_code.trim() : '';
    if (!employee_code) {
      return NextResponse.json({ error: 'CODE_REQUIRED', message: 'El código de empleado es obligatorio.' }, { status: 400 });
    }

    const display_name = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    if (!display_name) {
      return NextResponse.json({ error: 'NAME_REQUIRED', message: 'El nombre del empleado es obligatorio.' }, { status: 400 });
    }

    const hire_date = typeof body.hire_date === 'string' && body.hire_date.trim()
      ? body.hire_date.trim()
      : new Date().toISOString().split('T')[0];
    if (!isDate(hire_date)) {
      return NextResponse.json({ error: 'INVALID_HIRE_DATE' }, { status: 400 });
    }
    if (body.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(body.status)) {
      return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }
    const salary_band_id = typeof body.salary_band_id === 'string' ? body.salary_band_id.trim() : '';
    const sector = typeof body.sector === 'string' ? body.sector : '';
    if (sector && !sectors.includes(sector as IndustrialSector)) {
      return NextResponse.json({ error: 'INVALID_SECTOR' }, { status: 400 });
    }
    if (body.status !== 'INACTIVE' && !salary_band_id) {
      return NextResponse.json({ error: 'SALARY_BAND_REQUIRED', message: 'Cada empleado activo debe tener una banda salarial vigente.' }, { status: 400 });
    }
    if (body.status === 'INACTIVE' && (salary_band_id || sector)) {
      return NextResponse.json({ error: 'INACTIVE_PERSONNEL_CANNOT_BE_ASSIGNED' }, { status: 400 });
    }

    const member = await repository.createPersonnel(
      {
        organization_id: identity.organizationId,
        employee_code,
        display_name,
        hire_date,
        status: body.status || 'ACTIVE',
      },
      salary_band_id || undefined,
      (sector as IndustrialSector) || undefined,
      identity.organizationId
    );

    const refreshed = await repository.getPersonnelMember(member.id, identity.organizationId);

    return NextResponse.json({
      success: true,
      personnel: refreshed || member,
    });
  } catch (error: any) {
    if (error?.message === 'EMPLOYEE_CODE_ALREADY_EXISTS') {
      return NextResponse.json({ error: 'CODE_ALREADY_EXISTS', message: error.message }, { status: 409 });
    }
    return personnelAuthErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const body = await req.json();

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: 'ID_REQUIRED', message: 'El ID del empleado es obligatorio.' }, { status: 400 });
    }

    if (body.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(body.status)) {
      return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }
    if (body.employee_code !== undefined && (typeof body.employee_code !== 'string' || !body.employee_code.trim())) {
      return NextResponse.json({ error: 'INVALID_EMPLOYEE_CODE' }, { status: 400 });
    }
    if (body.display_name !== undefined && (typeof body.display_name !== 'string' || !body.display_name.trim())) {
      return NextResponse.json({ error: 'INVALID_DISPLAY_NAME' }, { status: 400 });
    }
    if (body.hire_date !== undefined && (typeof body.hire_date !== 'string' || !isDate(body.hire_date.trim()))) {
      return NextResponse.json({ error: 'INVALID_HIRE_DATE' }, { status: 400 });
    }
    if (body.termination_date !== undefined && body.termination_date !== null && (typeof body.termination_date !== 'string' || !isDate(body.termination_date.trim()))) {
      return NextResponse.json({ error: 'INVALID_TERMINATION_DATE' }, { status: 400 });
    }

    const salary_band_id = typeof body.salary_band_id === 'string' ? body.salary_band_id.trim() : '';
    const salary_valid_from = typeof body.salary_valid_from === 'string' ? body.salary_valid_from.trim() : '';
    if (salary_band_id && !isDate(salary_valid_from)) {
      return NextResponse.json({ error: 'INVALID_SALARY_VALID_FROM' }, { status: 400 });
    }

    const updated = await repository.updatePersonnel(
      id,
      {
        employee_code: body.employee_code?.trim(),
        display_name: body.display_name?.trim(),
        status: body.status,
        hire_date: typeof body.hire_date === 'string' ? body.hire_date.trim() : undefined,
        termination_date: body.termination_date !== undefined ? body.termination_date : undefined,
      },
      identity.organizationId
    );

    if (salary_band_id) {
      await repository.savePersonnelSalaryAssignment({
        organization_id: identity.organizationId,
        personnel_id: id,
        salary_band_id,
        valid_from: salary_valid_from,
        valid_to: null,
      }, identity.organizationId);
    }

    return NextResponse.json({
      success: true,
      personnel: updated,
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
      return NextResponse.json({ error: 'ID_REQUIRED', message: 'El ID del empleado es obligatorio.' }, { status: 400 });
    }

    const result = await repository.deleteOrDeactivatePersonnel(id, identity.organizationId);
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return personnelAuthErrorResponse(error);
  }
}
