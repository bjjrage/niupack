import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { MAX_FILE_BYTES, PrintRfqError, storeFile } from '@/lib/print-rfq/service';

/** Registra el arte a cotizar para un ítem (multipart: item_id + file). Queda con su huella SHA-256 y no se reescribe. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new PrintRfqError('PRINT_FILE_REQUIRED', 400, 'Falta el archivo de arte');
    if (file.size > MAX_FILE_BYTES) throw new PrintRfqError('PRINT_FILE_TOO_LARGE', 413, 'El archivo supera los 4 MB');
    const result = await storeFile(identity.organizationId, z.string().uuid().parse(id), {
      kind: 'ART', fileName: file.name, content: Buffer.from(await file.arrayBuffer()), rfqItemId: z.string().uuid().parse(form.get('item_id')), actor: identity.profileId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return domainErrorResponse(error); }
}
