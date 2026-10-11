import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { acknowledgeMatch } from '@/lib/licitaciones/scanner';

/** Marca una detección como vista (deja de aparecer como nueva). */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const matchId = z.string().uuid().parse((await context.params).id);
    return NextResponse.json(await acknowledgeMatch(identity.organizationId, matchId, identity.profileId));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
