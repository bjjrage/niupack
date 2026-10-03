import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { AutoLeadBridgeError, getAutoLeadLeads } from '@/lib/crm/autolead-bridge';

export async function GET(request: Request) {
  try {
    await requireNiuIdentity();
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
    const since = url.searchParams.get('since') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const result = await getAutoLeadLeads({ limit, offset, since, status });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AutoLeadBridgeError) {
      const responseStatus = error.code === 'BOT_BRIDGE_NOT_CONFIGURED' || error.code === 'BOT_BRIDGE_UNAVAILABLE' ? 503 : 502;
      return NextResponse.json({ ok: false, error: error.code }, { status: responseStatus });
    }
    return authErrorResponse(error);
  }
}
