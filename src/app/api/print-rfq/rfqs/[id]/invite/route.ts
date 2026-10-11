import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { inviteProviders } from '@/lib/print-rfq/service';

/** Genera un enlace propio por imprenta. No envía nada: la persona lo comparte por el canal que prefiera. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const body = z.object({ provider_ids: z.array(z.string().uuid()).min(1) }).parse(await request.json().catch(() => ({})));
    return NextResponse.json(await inviteProviders(identity.organizationId, identity.profileId, z.string().uuid().parse(id), body.provider_ids));
  } catch (error) { return domainErrorResponse(error); }
}
