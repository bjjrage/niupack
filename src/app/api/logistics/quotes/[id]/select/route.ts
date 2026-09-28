import { NextResponse } from 'next/server';
import { logisticsRepository } from '@/lib/logistics/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await context.params;
    const rate = await logisticsRepository.selectQuote(id, identity.organizationId);
    await logisticsRepository.logAuditEvent({ organization_id: identity.organizationId, actor_id: identity.profileId, event_type: 'RATE_SELECTED', target_entity: 'logistics_rates', entity_id: rate.id, metadata: { source_reference: id } });
    return NextResponse.json({ rate });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    const code = error instanceof Error ? error.message : '';
    const safeCode = ['QUOTE_NOT_FOUND', 'QUOTE_EXPIRED'].includes(code) ? code : 'SELECTION_FAILED';
    return NextResponse.json({ error: safeCode }, { status: safeCode === 'QUOTE_EXPIRED' ? 409 : 400 });
  }
}
