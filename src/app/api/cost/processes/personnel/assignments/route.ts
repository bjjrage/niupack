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
    const personnelId = searchParams.get('personnel_id') || undefined;
    const sectorParam = searchParams.get('sector');
    if (sectorParam && !sectors.includes(sectorParam as IndustrialSector)) {
      return NextResponse.json({ error: 'INVALID_SECTOR' }, { status: 400 });
    }
    const sector = (sectorParam as IndustrialSector) || undefined;
    const targetDate = searchParams.get('target_date') || undefined;
    const activeOnly = searchParams.get('active_only') !== 'false';

    let assignments = await repository.getPersonnelAssignments(
      identity.organizationId,
      sector,
      activeOnly,
      targetDate
    );
    if (personnelId) {
      assignments = assignments.filter((a) => a.personnel_id === personnelId);
    }

    return NextResponse.json({
      success: true,
      assignments,
    });
  } catch (error) {
    return personnelAuthErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const body = await req.json();

    const personnel_id = typeof body.personnel_id === 'string' ? body.personnel_id.trim() : '';
    if (!personnel_id) {
      return NextResponse.json({ error: 'PERSONNEL_ID_REQUIRED', message: 'El empleado es obligatorio.' }, { status: 400 });
    }

    const sector = body.sector as IndustrialSector;
    if (!sectors.includes(sector)) {
      return NextResponse.json({ error: 'SECTOR_REQUIRED', message: 'El sector es obligatorio.' }, { status: 400 });
    }

    const allocation_percent = body.allocation_percent === undefined ? 100 : Number(body.allocation_percent);
    if (!Number.isFinite(allocation_percent) || allocation_percent <= 0 || allocation_percent > 100) {
      return NextResponse.json({
        error: 'INVALID_ALLOCATION',
        message: 'El porcentaje de asignación debe estar entre 1% y 100%.',
      }, { status: 400 });
    }

    const valid_from = typeof body.valid_from === 'string' && body.valid_from.trim()
      ? body.valid_from.trim()
      : new Date().toISOString().split('T')[0];
    const valid_to = typeof body.valid_to === 'string' && body.valid_to.trim() ? body.valid_to.trim() : null;
    if (!isDate(valid_from) || (valid_to && (!isDate(valid_to) || valid_to < valid_from))) {
      return NextResponse.json({ error: 'INVALID_ASSIGNMENT_DATES' }, { status: 400 });
    }

    const person = await repository.getPersonnelMember(personnel_id, identity.organizationId);
    if (!person?.current_band_id) {
      return NextResponse.json({ error: 'PERSONNEL_SALARY_BAND_REQUIRED', message: 'Asigná una banda salarial vigente a la persona antes de distribuirla.' }, { status: 400 });
    }
    const machine_generation = body.machine_generation === 'GEN1' || body.machine_generation === 'GEN2'
      ? body.machine_generation
      : null;
    if (sector === 'FORMADO' && !machine_generation) {
      return NextResponse.json({ error: 'MACHINE_GENERATION_REQUIRED' }, { status: 400 });
    }
    if (body.machine_generation !== undefined && body.machine_generation !== null && machine_generation === null) {
      return NextResponse.json({ error: 'INVALID_MACHINE_GENERATION' }, { status: 400 });
    }

    const assignment = await repository.savePersonnelAssignment(
      {
        organization_id: identity.organizationId,
        personnel_id,
        salary_band_id: person.current_band_id,
        sector,
        machine_generation,
        line_id: body.line_id || undefined,
        allocation_percent,
        valid_from,
        valid_to,
      },
      identity.organizationId
    );

    return NextResponse.json({
      success: true,
      assignment,
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
      return NextResponse.json({ error: 'ID_REQUIRED', message: 'El ID de la asignación es obligatorio.' }, { status: 400 });
    }

    const result = await repository.deletePersonnelAssignment(id, identity.organizationId);
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return personnelAuthErrorResponse(error);
  }
}
