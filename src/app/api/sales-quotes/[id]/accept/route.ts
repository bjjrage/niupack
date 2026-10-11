import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { acceptQuote } from '@/lib/sales-quotes/service';

/** Registra la aceptación del cliente y genera la OT con las líneas elegidas. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const body = z.object({ line_ids: z.array(z.string().uuid()).min(1), acceptor: z.string().trim().min(1).max(200), note: z.string().max(500).optional() }).parse(await request.json().catch(() => ({})));
    return NextResponse.json(await acceptQuote(identity.organizationId, identity.profileId, z.string().uuid().parse(id), body.line_ids, body.acceptor, body.note), { status: 201 });
  } catch (error) { return domainErrorResponse(error); }
}
