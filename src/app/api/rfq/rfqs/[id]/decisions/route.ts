import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { decisionSchema, recordDecision } from '@/lib/rfq/service';

/** Decisión humana, append-only, con la foto del comparador. No adjudica, no emite órdenes de compra ni cambia precios oficiales. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const rfqId = z.string().uuid().parse((await context.params).id);
    const input = decisionSchema.parse(await request.json());
    return NextResponse.json(await recordDecision(identity.organizationId, identity.profileId, rfqId, input), { status: 201 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
