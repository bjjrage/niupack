import { NextRequest, NextResponse } from 'next/server';
import { requireNiuIdentity, authErrorResponse } from '@/lib/auth/identity';

export async function GET(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(req.url);
    const line = searchParams.get('line')?.trim() || 'Polipapel';
    const sku = searchParams.get('sku')?.trim() || '';

    // Mobile path with scoped parameters
    const query = new URLSearchParams({ line });
    if (sku) query.set('sku', sku);
    query.set('org', identity.organizationId);

    const relativeUrl = `/cost/processes/packing-mobile?${query.toString()}`;

    return NextResponse.json({
      success: true,
      line,
      relative_url: relativeUrl,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
