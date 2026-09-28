import { NextResponse } from 'next/server';
import { logisticsRepository } from '@/lib/logistics/repository';
import { repository } from '@/lib/db/repository';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const rate = await logisticsRepository.selectQuote(id);
    await repository.logAuditEvent({ event_type: 'RATE_SELECTED', target_entity: 'logistics_rates', entity_id: rate.id, metadata: { source_reference: id } });
    return NextResponse.json({ rate });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SELECTION_FAILED';
    return NextResponse.json({ error: message }, { status: message === 'QUOTE_EXPIRED' ? 409 : 400 });
  }
}
