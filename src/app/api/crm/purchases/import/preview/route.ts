import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { purchaseService } from '@/lib/crm/purchase-service';

/** Preview de importación: parsea el archivo, mapea columnas y matchea. No escribe nada. */
export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400 });
    }
    let mapping: Record<string, string> | undefined;
    const mappingRaw = form.get('mapping');
    if (typeof mappingRaw === 'string' && mappingRaw) {
      try {
        mapping = z.record(z.string()).parse(JSON.parse(mappingRaw));
      } catch {
        return NextResponse.json({ error: 'INVALID_MAPPING' }, { status: 400 });
      }
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await purchaseService.previewImport(identity.organizationId, { buffer, filename: file.name }, mapping);
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && ['EMPTY_FILE', 'FILE_TOO_LARGE'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
