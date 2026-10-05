import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { previewAccountList } from '@/lib/crm/account-import';

export async function POST(request: Request) {
  try {
    await requireNiuIdentity();
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

    const overrideMappingStr = form.get('mapping')?.toString();
    let overrideMapping: Record<string, number | null> | undefined;
    if (overrideMappingStr) {
      try {
        overrideMapping = JSON.parse(overrideMappingStr);
      } catch {
        // ignore parse error, fallback
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await previewAccountList({
      buffer,
      filename: file.name,
      overrideSheetName,
      overrideHeaderRowIndex: overrideHeaderRowIndex !== undefined && !isNaN(overrideHeaderRowIndex)
        ? overrideHeaderRowIndex
        : undefined,
      overrideMapping,
    });
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && ['EMPTY_FILE', 'FILE_TOO_LARGE'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
