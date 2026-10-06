import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { purchaseService } from '@/lib/crm/purchase-service';

/** Preview de importación histórica: parsea el archivo, mapea columnas con LLM y matchea contra Maestro de SKUs. */
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

    const overrideSheetName = form.get('sheet_name')?.toString();
    const overrideHeaderRowIndexStr = form.get('header_row_index')?.toString();
    const overrideHeaderRowIndex =
      overrideHeaderRowIndexStr !== undefined && overrideHeaderRowIndexStr !== ''
        ? parseInt(overrideHeaderRowIndexStr, 10)
        : undefined;

    let overrideMapping: Record<string, number | null> | undefined;
    const mappingRaw = form.get('mapping');
    if (typeof mappingRaw === 'string' && mappingRaw) {
      try {
        overrideMapping = z.record(z.number().nullable()).parse(JSON.parse(mappingRaw));
      } catch {
        return NextResponse.json({ error: 'INVALID_MAPPING' }, { status: 400 });
      }
    }

    let pendingResolutions: Record<string, string> | undefined;
    const resolutionsRaw = form.get('pending_resolutions');
    if (typeof resolutionsRaw === 'string' && resolutionsRaw) {
      try {
        pendingResolutions = z.record(z.string()).parse(JSON.parse(resolutionsRaw));
      } catch {
        // ignore
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await purchaseService.previewImport(identity.organizationId, {
      buffer,
      filename: file.name,
      overrideSheetName,
      overrideHeaderRowIndex: overrideHeaderRowIndex !== undefined && !isNaN(overrideHeaderRowIndex)
        ? overrideHeaderRowIndex
        : undefined,
      overrideMapping,
      pendingResolutions,
    });
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && ['EMPTY_FILE', 'FILE_TOO_LARGE'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
