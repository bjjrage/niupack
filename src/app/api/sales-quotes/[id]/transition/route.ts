import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { transitionQuote } from '@/lib/sales-quotes/service';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const body = z.object({ action: z.enum(['SEND', 'REOPEN', 'REJECT', 'VOID']), note: z.string().max(500).optional() }).parse(await request.json().catch(() => ({})));
    await transitionQuote(identity.organizationId, identity.profileId, z.string().uuid().parse(id), body.action, body.note);
    return NextResponse.json({ ok: true });
  } catch (error) { return domainErrorResponse(error); }
}
