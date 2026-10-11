import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { getWorkOrder, setWorkOrderStatus } from '@/lib/sales-quotes/service';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const { id } = await context.params;
    return NextResponse.json({ ...(await getWorkOrder(identity.organizationId, z.string().uuid().parse(id))), viewer_role: identity.role });
  } catch (error) { return domainErrorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const { status } = z.object({ status: z.enum(['PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'CANCELADA']) }).parse(await request.json().catch(() => ({})));
    await setWorkOrderStatus(identity.organizationId, identity.profileId, z.string().uuid().parse(id), status);
    return NextResponse.json({ ok: true });
  } catch (error) { return domainErrorResponse(error); }
}
