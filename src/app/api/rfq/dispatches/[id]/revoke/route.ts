import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { revokeInvitationLink } from '@/lib/rfq/service';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const dispatchId = z.string().uuid().parse((await context.params).id);
    await revokeInvitationLink(identity.organizationId, identity.profileId, dispatchId);
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
