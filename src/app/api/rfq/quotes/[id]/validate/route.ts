import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { quoteInputSchema, validateQuote } from '@/lib/rfq/service';

/** Validación humana de lo extraído o ingresado: corrige y confirma. Nada de IA/heurística pasa a oficial sin este paso. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const quoteId = z.string().uuid().parse((await context.params).id);
    const changes = quoteInputSchema.partial().parse(await request.json().catch(() => ({})));
    return NextResponse.json(await validateQuote(identity.organizationId, identity.profileId, quoteId, changes));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
