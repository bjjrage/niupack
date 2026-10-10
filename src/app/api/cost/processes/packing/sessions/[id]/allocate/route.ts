import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requirePersonnelAdminIdentity, personnelAuthErrorResponse } from '@/lib/auth/personnel-guard';
import { repository } from '@/lib/db/repository';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allocationRequestId(value: unknown, organizationId: string, sessionId: string, allocations: unknown): string {
  if (value !== undefined) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error('INVALID_REQUEST_ID');
    return value;
  }
  const hex = createHash('sha256')
    .update(`${organizationId}:${sessionId}:${JSON.stringify(allocations)}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });
    const session = await repository.getPackingSession(id, identity.organizationId);
    if (!session) return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });

    const allocations = await repository.getPackingLaborAllocations(id, identity.organizationId);
    return NextResponse.json({ success: true, session_id: id, allocations }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
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
    if (!UUID_PATTERN.test(sessionId)) return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 });

    const body = await req.json();
    const allocations = body.allocations as Array<{
      segment_id?: string;
      salary_band_id: string;
      headcount: number;
      duration_hours?: number;
    }>;

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({
        error: 'ALLOCATIONS_REQUIRED',
        message: 'Debe especificar la distribuci�n de personal por banda salarial.',
      }, { status: 400 });
    }

    for (const allocation of allocations) {
      if (
        typeof allocation.salary_band_id !== 'string' || !allocation.salary_band_id.trim() ||
        !Number.isSafeInteger(Number(allocation.headcount)) || Number(allocation.headcount) <= 0 ||
        (allocation.segment_id !== undefined && (typeof allocation.segment_id !== 'string' || !UUID_PATTERN.test(allocation.segment_id))) ||
        (allocation.duration_hours !== undefined && (!Number.isFinite(Number(allocation.duration_hours)) || Number(allocation.duration_hours) <= 0))
      ) {
        return NextResponse.json({
          error: 'INVALID_ALLOCATION_ENTRY',
          message: 'Cada entrada debe tener una banda salarial, cantidad entera de personas mayor a 0 y una duraci�n v�lida.',
        }, { status: 400 });
      }
    }

    const requestId = allocationRequestId(body.request_id, identity.organizationId, sessionId, allocations);
    const updatedSession = await repository.approvePackingSessionWithLaborAllocations(
      sessionId,
      allocations,
      identity.profileId,
      identity.organizationId,
      { requestId, actorProfileId: identity.profileId }
    );

    return NextResponse.json({
      success: true,
      session: updatedSession,
      allocations: await repository.getPackingLaborAllocations(sessionId, identity.organizationId),
      server_now: (updatedSession as typeof updatedSession & { server_now?: string }).server_now,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error: any) {
    if (error?.message === 'INVALID_REQUEST_ID') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error?.message?.includes('no encontrada') || error?.message?.includes('cerrada') || error?.message?.includes('aprobada') || error?.message?.includes('anulada') || error?.message?.includes('banda salarial') || error?.message?.includes('segmento') || error?.message?.includes('duraci�n') || error?.message?.includes('personas')) {
      return NextResponse.json({ error: 'SESSION_ERROR', message: error.message }, { status: 400 });
    }
    return personnelAuthErrorResponse(error);
  }
}
