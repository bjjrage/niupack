import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { transitionRfq } from '@/lib/print-rfq/service';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const body = z.object({ action: z.enum(['CANCEL', 'REOPEN', 'CLOSE_DISCOVERY']), days: z.number().int().min(1).max(90).optional(), confirm: z.literal(true) }).parse(await request.json().catch(() => ({})));
    await transitionRfq(identity.organizationId, identity.profileId, z.string().uuid().parse(id), body.action, body.days);
    return NextResponse.json({ ok: true });
  } catch (error) { return domainErrorResponse(error); }
}
