import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { purchaseService } from '@/lib/crm/purchase-service';

const rowSchema = z.object({
  company_id: z.string().min(1),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sku: z.string().min(1).max(80),
  product_name: z.string().min(1).max(200),
  quantity: z.coerce.number().positive(),
  unit: z.string().max(12).optional().nullable(),
  unit_price: z.coerce.number().nonnegative().optional().nullable(),
  total_value: z.coerce.number().nonnegative().optional().nullable(),
  currency: z.string().max(4).optional().nullable(),
  contact_id: z.string().optional().nullable(),
  document_number: z.string().max(80).optional().nullable(),
  external_document_id: z.string().max(80).optional().nullable(),
  line_number: z.coerce.number().int().positive().optional().nullable(),
  product_id: z.string().optional().nullable(),
  source: z.string().max(40).optional().nullable(),
});

/** Confirma la importación con filas ya resueltas. Idempotente. */
export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const body = z
      .object({
        rows: z.array(rowSchema).max(2000),
        saveAliases: z
          .array(z.object({ kind: z.enum(['customer', 'product']), alias: z.string().max(200), target: z.string().max(120) }))
          .optional(),
      })
      .parse(await request.json());
    const result = await purchaseService.commitImport(identity.organizationId, { ...body, actorProfileId: identity.profileId });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    return authErrorResponse(error);
  }
}
