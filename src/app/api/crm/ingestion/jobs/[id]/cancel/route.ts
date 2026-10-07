import { NextResponse } from 'next/server';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { cancelIngestionJob } from '@/lib/crm/ingestion/staging';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;

    await cancelIngestionJob(identity.organizationId, id);
    return NextResponse.json({ ok: true, status: 'CANCELLED' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'JOB_CANCEL_FAILED';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
