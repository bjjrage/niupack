import { NextResponse } from 'next/server';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { deleteIngestionJob, getIngestionCockpitSummary } from '@/lib/crm/ingestion/staging';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;

    const summary = await getIngestionCockpitSummary(identity.organizationId, id);
    if (!summary) {
      return NextResponse.json({ error: 'IMPORT_JOB_NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'JOB_FETCH_FAILED';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const body = await req.json().catch(() => null) as { expected_row_count?: unknown } | null;
    const expectedRowCount = body?.expected_row_count;
    if (typeof expectedRowCount !== 'number' || !Number.isInteger(expectedRowCount) || expectedRowCount < 0) {
      return NextResponse.json({ error: 'EXPECTED_ROW_COUNT_REQUIRED' }, { status: 400 });
    }

    const result = await deleteIngestionJob(identity.organizationId, id, expectedRowCount);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'JOB_DELETE_FAILED';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
