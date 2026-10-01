import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';

export async function GET(req: Request) {
  try {
    const identity = await requireNiuIdentity();
    const sku = new URL(req.url).searchParams.get('sku')?.trim();
    if (!sku) return NextResponse.json({ error: 'SKU is required' }, { status: 400 });
    const sheet = await repository.getActiveCostSheetForSKU(sku, identity.organizationId);
    return NextResponse.json({ sheet: sheet ?? null, configured: Boolean(sheet) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'COST_V1_CONFIGURATION_REQUIRED', message: 'Use the six-rubric V1 configuration endpoint.' },
    { status: 410 }
  );
}
