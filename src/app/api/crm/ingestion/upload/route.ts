import { NextResponse } from 'next/server';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { createIngestionJob } from '@/lib/crm/ingestion/staging';
import type { DatasetType, TargetLifecycle } from '@/lib/crm/ingestion/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const identity = await requireNiuIdentity();
    const form = await req.formData();
    const file = form.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    }

    const targetLifecycle = (form.get('target_lifecycle') as TargetLifecycle) || 'PROSPECT';
    const sheetName = (form.get('sheet_name') as string) || undefined;
    const headerRowIndexRaw = form.get('header_row_index');
    const headerRowIndex = headerRowIndexRaw != null ? Number(headerRowIndexRaw) : undefined;
    const datasetType = (form.get('dataset_type') as DatasetType) || undefined;

    let mapping: Record<string, number | null> | undefined;
    const mappingRaw = form.get('mapping');
    if (typeof mappingRaw === 'string') {
      try {
        mapping = JSON.parse(mappingRaw);
      } catch {
        // ignore invalid JSON mapping
      }
    }

    let pendingResolutions: Record<string, string> | undefined;
    const pendingRaw = form.get('pending_resolutions');
    if (typeof pendingRaw === 'string') {
      try {
        pendingResolutions = JSON.parse(pendingRaw);
      } catch {
        // ignore
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await createIngestionJob(identity.organizationId, {
      buffer,
      filename: (file as File).name || 'upload.xlsx',
      targetLifecycle,
      createdBy: identity.profileId,
      overrideSheetName: sheetName,
      overrideHeaderRowIndex: headerRowIndex,
      overrideMapping: mapping,
      overrideDatasetType: datasetType,
      pendingResolutions,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'INGESTION_UPLOAD_FAILED';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
