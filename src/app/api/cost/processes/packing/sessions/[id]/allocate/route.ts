import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { requirePersonnelAdminIdentity, personnelAuthErrorResponse } from '@/lib/auth/personnel-guard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const { id } = await params;
    const session = await repository.getPackingSession(id, identity.organizationId);
    if (!session) return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });

    const allocations = await repository.getPackingLaborAllocations(id, identity.organizationId);
    return NextResponse.json({ success: true, session_id: id, allocations });
  } catch (error) {
    return personnelAuthErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: 'SESSION_ID_REQUIRED' }, { status: 400 });
    }

    const body = await req.json();
    const allocations = body.allocations as Array<{
      segment_id?: string;
      salary_band_id: string;
      headcount: number;
      duration_hours?: number;
    }>;

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json(
        { error: 'ALLOCATIONS_REQUIRED', message: 'Debe especificar la distribución de personal por banda salarial.' },
        { status: 400 }
      );
    }

    // Check that all allocations have positive headcount
    for (const a of allocations) {
      if (typeof a.salary_band_id !== 'string' || !a.salary_band_id.trim() || !Number.isInteger(Number(a.headcount)) || Number(a.headcount) <= 0) {
        return NextResponse.json(
          { error: 'INVALID_ALLOCATION_ENTRY', message: 'Cada entrada debe tener una banda salarial y cantidad de personas mayor a 0.' },
          { status: 400 }
        );
      }
    }

    const updatedSession = await repository.approvePackingSessionWithLaborAllocations(
      sessionId,
      allocations,
      identity.profileId,
      identity.organizationId
    );

    return NextResponse.json({
      success: true,
      session: updatedSession,
      allocations: await repository.getPackingLaborAllocations(sessionId, identity.organizationId),
    });
  } catch (error: any) {
    if (error?.message?.includes('no encontrada') || error?.message?.includes('cerrada') || error?.message?.includes('aprobada') || error?.message?.includes('anulada') || error?.message?.includes('banda salarial') || error?.message?.includes('segmento') || error?.message?.includes('duración') || error?.message?.includes('personas')) {
      return NextResponse.json({ error: 'SESSION_ERROR', message: error.message }, { status: 400 });
    }
    return personnelAuthErrorResponse(error);
  }
}
