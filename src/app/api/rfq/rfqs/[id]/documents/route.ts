import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { MAX_DOCUMENT_BYTES } from '@/lib/rfq/pdf';
import { RfqError, uploadQuoteDocument } from '@/lib/rfq/service';

/** Sube el PDF de una oferta, lo conserva y devuelve lo extraído con su evidencia (pendiente de validación humana). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const rfqId = z.string().uuid().parse((await context.params).id);
    const form = await request.formData();
    const supplierId = z.string().uuid().parse(form.get('supplier_id'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new RfqError('FILE_REQUIRED', 400, 'Adjuntá un archivo PDF.');
    if (file.size > MAX_DOCUMENT_BYTES) throw new RfqError('INVALID_DOCUMENT_SIZE', 413, 'El PDF no puede superar 5 MB.');
    const result = await uploadQuoteDocument(identity.organizationId, identity.profileId, rfqId, supplierId, {
      name: file.name || 'cotizacion.pdf', type: file.type, bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
