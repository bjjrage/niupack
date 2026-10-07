import { NextResponse } from 'next/server';
import { requireNiuIdentity } from '@/lib/auth/identity';
import {
  getIngestionCockpitSummary,
  resolveProductGroup,
} from '@/lib/crm/ingestion/staging';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const body = await req.json();

    if (!body.raw_product || !body.target_sku) {
      return NextResponse.json({ error: 'PRODUCT_AND_SKU_REQUIRED' }, { status: 400 });
    }

    await resolveProductGroup(
      identity.organizationId,
      id,
      body.raw_product,
      body.target_sku,
      body.save_alias !== false,
    );

    const updatedSummary = await getIngestionCockpitSummary(identity.organizationId, id);
    return NextResponse.json(updatedSummary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'GROUP_RESOLUTION_FAILED';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
