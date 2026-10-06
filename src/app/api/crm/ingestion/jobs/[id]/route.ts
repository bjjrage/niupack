import { NextResponse } from 'next/server';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { getIngestionCockpitSummary } from '@/lib/crm/ingestion/staging';

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
