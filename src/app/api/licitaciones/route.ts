import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { listCandidates, listTenders } from '@/lib/licitaciones/service';

export async function GET() {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const [tenders, candidates] = await Promise.all([listTenders(identity.organizationId), listCandidates(identity.organizationId)]);
    return NextResponse.json({ tenders, candidates, role: identity.role });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
