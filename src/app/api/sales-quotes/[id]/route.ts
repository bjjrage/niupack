import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { getQuote, saveQuote } from '@/lib/sales-quotes/service';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const { id } = await context.params;
    return NextResponse.json({ ...(await getQuote(identity.organizationId, z.string().uuid().parse(id))), viewer_role: identity.role });
  } catch (error) { return domainErrorResponse(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    return NextResponse.json(await saveQuote(identity.organizationId, identity.profileId, await request.json().catch(() => ({})), z.string().uuid().parse(id)));
  } catch (error) { return domainErrorResponse(error); }
}
