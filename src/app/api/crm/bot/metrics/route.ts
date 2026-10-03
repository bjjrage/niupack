import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { AutoLeadBridgeError, getAutoLeadMetrics } from '@/lib/crm/autolead-bridge';

export async function GET() {
  try {
    await requireNiuIdentity();
    return NextResponse.json({ ok: true, metrics: await getAutoLeadMetrics() });
  } catch (error) {
    if (error instanceof AutoLeadBridgeError) {
      const status = error.code === 'BOT_BRIDGE_NOT_CONFIGURED' || error.code === 'BOT_BRIDGE_UNAVAILABLE' ? 503 : 502;
      return NextResponse.json({ ok: false, error: error.code }, { status });
    }
    return authErrorResponse(error);
  }
}
