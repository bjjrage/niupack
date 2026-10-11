import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { setInvitationLink } from '@/lib/print-rfq/service';

export async function POST(request: Request, context: { params: Promise<{ id: string; invitationId: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id, invitationId } = await context.params;
    const { action } = z.object({ action: z.enum(['REVOKE', 'RENEW']) }).parse(await request.json().catch(() => ({})));
    await setInvitationLink(identity.organizationId, identity.profileId, z.string().uuid().parse(id), z.string().uuid().parse(invitationId), action);
    return NextResponse.json({ ok: true });
  } catch (error) { return domainErrorResponse(error); }
}
