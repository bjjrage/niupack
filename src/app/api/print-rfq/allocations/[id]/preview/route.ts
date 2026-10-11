import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { previewOrders } from '@/lib/print-rfq/service';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(['admin']);
    const { id } = await context.params;
    return NextResponse.json(await previewOrders(identity.organizationId, identity.profileId, z.string().uuid().parse(id)));
  } catch (error) { return domainErrorResponse(error); }
}
