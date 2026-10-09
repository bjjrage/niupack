import { NextRequest, NextResponse } from 'next/server';
import { requireNiuIdentity, authErrorResponse } from '@/lib/auth/identity';
import { generatePackingToken } from '@/lib/auth/packing-token';

export async function GET(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(req.url);
    const line = searchParams.get('line')?.trim() || 'Polipapel';

    // Generate signed HMAC token with 7 days expiration
    const token = generatePackingToken(identity.organizationId, line, 7);
    const relativeUrl = `/planta/empaque?token=${encodeURIComponent(token)}`;

    return NextResponse.json({
      success: true,
      line,
      token,
      relative_url: relativeUrl,
      expires_in_days: 7,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
