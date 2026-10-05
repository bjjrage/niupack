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

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await previewAccountList({ buffer, filename: file.name });
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && ['EMPTY_FILE', 'FILE_TOO_LARGE', 'COMPANY_COLUMN_REQUIRED'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
