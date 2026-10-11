import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { getPurchaseOrder } from '@/lib/print-rfq/service';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const { id } = await context.params;
    return NextResponse.json(await getPurchaseOrder(identity.organizationId, z.string().uuid().parse(id)));
  } catch (error) { return domainErrorResponse(error); }
}
