import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { saveProvider } from '@/lib/print-rfq/service';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    z.string().uuid().parse(id);
    return NextResponse.json({ provider: await saveProvider(identity.organizationId, await request.json().catch(() => ({})), id) });
  } catch (error) { return domainErrorResponse(error); }
}
