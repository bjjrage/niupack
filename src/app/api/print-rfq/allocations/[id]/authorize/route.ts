import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { authorizeAllocation } from '@/lib/print-rfq/service';

/** Autorizar un compromiso de compra es decisión de un administrador. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(['admin']);
    const { id } = await context.params;
    const { confirm } = z.object({ confirm: z.boolean() }).parse(await request.json().catch(() => ({})));
    await authorizeAllocation(identity.organizationId, identity.profileId, z.string().uuid().parse(id), confirm);
    return NextResponse.json({ ok: true });
  } catch (error) { return domainErrorResponse(error); }
}
