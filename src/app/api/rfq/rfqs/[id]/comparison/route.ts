import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { getComparison } from '@/lib/rfq/service';

/** Comparador por ítem y proveedor. Solo propone: no adjudica ni modifica costos o precios. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const rfqId = z.string().uuid().parse((await context.params).id);
    return NextResponse.json(await getComparison(identity.organizationId, rfqId));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
