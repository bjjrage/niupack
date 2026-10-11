import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { reviewQuote } from '@/lib/print-rfq/service';

/** Revisión humana: una persona transcribe el presupuesto original y resuelve las diferencias. No corrige precios. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const body = z.object({ version_id: z.string().uuid(), facts: z.array(z.unknown()).max(200), resolution: z.string() }).parse(await request.json().catch(() => ({})));
    return NextResponse.json(await reviewQuote(identity.organizationId, identity.profileId, z.string().uuid().parse(id), body.version_id, body.facts, body.resolution));
  } catch (error) { return domainErrorResponse(error); }
}
