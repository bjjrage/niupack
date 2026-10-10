import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireNiuIdentity, authErrorResponse, NiuAuthError } from '@/lib/auth/identity';
import { buildPackingOperatorLink, generatePackingToken, isAllowedPackingLine, verifyPackingToken } from '@/lib/auth/packing-token';
import { repository } from '@/lib/db/repository';

async function issuePackingToken(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    if (identity.role !== 'admin') throw new NiuAuthError('FORBIDDEN_PACKING_TOKEN_ADMIN_ONLY', 403);
    const { searchParams } = new URL(req.url);
    const line = searchParams.get('line')?.trim() || 'Polipapel';
    if (!isAllowedPackingLine(line)) {
      return NextResponse.json({ error: 'INVALID_PACKING_LINE' }, { status: 400 });
    }

    const tokenId = randomUUID();
    let token: string;
    try {
      token = generatePackingToken(identity.organizationId, line, 7, tokenId);
    } catch (error) {
      if (error instanceof Error && error.message === 'PACKING_TOKEN_SECRET_REQUIRED') {
        return NextResponse.json({ error: 'PACKING_TOKEN_SECRET_REQUIRED' }, { status: 503 });
      }
      throw error;
    }
    const payload = verifyPackingToken(token);
    if (!payload) throw new Error('PACKING_TOKEN_SIGNING_FAILED');
    const expiresAt = new Date(payload.exp * 1000).toISOString();

    // Persist the jti before disclosing the link; every mobile request checks this registry.
    await repository.createPackingOperatorToken({
      token_id: tokenId,
      organization_id: identity.organizationId,
      line_name: line,
      issued_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, identity.organizationId);

    const relativeUrl = buildPackingOperatorLink(new URL(req.url).origin, token).replace(new URL(req.url).origin, '');

    return NextResponse.json({
      success: true,
      line,
      token_id: tokenId,
      token,
      relative_url: relativeUrl,
      expires_in_days: 7,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function GET() {
  return NextResponse.json({ error: 'METHOD_NOT_ALLOWED' }, {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'no-store, max-age=0' },
  });
}
export async function POST(req: NextRequest) {
  return issuePackingToken(req);
}

export async function DELETE(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    if (identity.role !== 'admin') throw new NiuAuthError('FORBIDDEN_PACKING_TOKEN_ADMIN_ONLY', 403);
    const body = await req.json();
    const tokenId = typeof body.token_id === 'string' ? body.token_id : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenId)) {
      return NextResponse.json({ error: 'INVALID_PACKING_TOKEN_ID' }, { status: 400 });
    }
    const revoked = await repository.revokePackingOperatorToken(
      tokenId,
      identity.organizationId,
      identity.profileId,
      typeof body.reason === 'string' ? body.reason.slice(0, 240) : undefined
    );
    if (!revoked) return NextResponse.json({ error: 'PACKING_TOKEN_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ success: true, token_id: tokenId }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
