import { NextResponse } from 'next/server';
import { requireNiuIdentity } from '@/lib/auth/identity';
import { commitIngestionJobBatch } from '@/lib/crm/ingestion/commit';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const result = await commitIngestionJobBatch(identity.organizationId, id, {
      batchSize: typeof body.batch_size === 'number' ? body.batch_size : 500,
      batchIndex: typeof body.batch_index === 'number' ? body.batch_index : 0,
      actorProfileId: identity.profileId,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'BATCH_COMMIT_FAILED';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
