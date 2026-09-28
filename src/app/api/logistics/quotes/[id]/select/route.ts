import { NextResponse } from 'next/server';
import { logisticsRepository } from '@/lib/logistics/repository';
import { logisticsAuthErrorResponse, requireLogisticsIdentity } from '@/lib/auth/logistics-auth';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireLogisticsIdentity();
    const { id } = await context.params;
    const rate = await logisticsRepository.selectQuote(id, identity.organizationId);
    await logisticsRepository.logAuditEvent({ organization_id: identity.organizationId, actor_id: identity.profileId, event_type: 'RATE_SELECTED', target_entity: 'logistics_rates', entity_id: rate.id, metadata: { source_reference: id } });
    return NextResponse.json({ rate });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return logisticsAuthErrorResponse(error);
    const message = error instanceof Error ? error.message : 'SELECTION_FAILED';
    return NextResponse.json({ error: message }, { status: message === 'QUOTE_EXPIRED' ? 409 : 400 });
  }
}
