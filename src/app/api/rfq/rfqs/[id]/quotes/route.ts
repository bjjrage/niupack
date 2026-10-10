import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { quoteInputSchema, registerExtractedQuote, registerManualQuote } from '@/lib/rfq/service';

const bodySchema = z.object({
  supplier_id: z.string().uuid(),
  quote: quoteInputSchema,
  // Si viene de un PDF, se registra como EXTRACTED (sin validar) y vinculada al documento original.
  document_id: z.string().uuid().optional(),
});

/** Carga interna de una cotización (llamada, correo o PDF). El comparador no usa lo extraído hasta que una persona lo valide. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const rfqId = z.string().uuid().parse((await context.params).id);
    const body = bodySchema.parse(await request.json());
    const result = body.document_id
      ? await registerExtractedQuote(identity.organizationId, identity.profileId, rfqId, body.supplier_id, body.document_id, body.quote)
      : await registerManualQuote(identity.organizationId, identity.profileId, rfqId, body.supplier_id, body.quote);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
