import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { saveAllocation } from '@/lib/print-rfq/service';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const body = z.object({ lines: z.array(z.unknown()), justification: z.string(), revision: z.number().int().min(0) }).parse(await request.json().catch(() => ({})));
    return NextResponse.json(await saveAllocation(identity.organizationId, identity.profileId, z.string().uuid().parse(id), body.lines, body.justification, body.revision), { status: 201 });
  } catch (error) { return domainErrorResponse(error); }
}
