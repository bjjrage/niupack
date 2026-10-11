import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { confirmOrders } from '@/lib/print-rfq/service';

/** Crea las órdenes de compra exactas del preview. Es idempotente: confirmar dos veces devuelve las mismas órdenes. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(['admin']);
    const { id } = await context.params;
    const body = z.object({ hash: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.boolean() }).parse(await request.json().catch(() => ({})));
    return NextResponse.json(await confirmOrders(identity.organizationId, identity.profileId, z.string().uuid().parse(id), body.hash, body.confirm));
  } catch (error) { return domainErrorResponse(error); }
}
