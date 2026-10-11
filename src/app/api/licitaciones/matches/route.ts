import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { listClientMatches } from '@/lib/licitaciones/scanner';

/** Licitaciones con inyectables donde participan los clientes de la organización. */
export async function GET() {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    return NextResponse.json({ matches: await listClientMatches(identity.organizationId) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
