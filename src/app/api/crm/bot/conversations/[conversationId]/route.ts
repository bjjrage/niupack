import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { AutoLeadBridgeError, getAutoLeadConversation } from '@/lib/crm/autolead-bridge';

export async function GET(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    await requireNiuIdentity();
    const { conversationId } = await context.params;
    if (!conversationId) return NextResponse.json({ ok: false, error: 'MISSING_CONVERSATION_ID' }, { status: 400 });

    const result = await getAutoLeadConversation(conversationId);
    return NextResponse.json({ ok: true, conversation_id: conversationId, ...result });
  } catch (error) {
    if (error instanceof AutoLeadBridgeError) {
      const status = error.code === 'BOT_BRIDGE_NOT_CONFIGURED' || error.code === 'BOT_BRIDGE_UNAVAILABLE' ? 503 : 502;
      return NextResponse.json({ ok: false, error: error.code }, { status });
    }
    return authErrorResponse(error);
  }
}
