import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { getTenderDetail } from '@/lib/licitaciones/service';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const { id } = await context.params;
    return NextResponse.json(await getTenderDetail(identity.organizationId, id));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
