import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logisticsRepository } from '@/lib/logistics/repository';
import { logisticsAuthErrorResponse, requireLogisticsIdentity } from '@/lib/auth/logistics-auth';

const schema = z.object({
  origin_country: z.string().min(2), origin_city: z.string().min(2), origin_address: z.string().optional(),
  destination_country: z.string().min(2), destination_city: z.string().min(2), destination_address: z.string().optional(),
  pickup_date: z.string().min(8), delivery_target_date: z.string().optional(), cargo_description: z.string().min(3),
  weight_kg: z.coerce.number().nonnegative(), volume_m3: z.coerce.number().nonnegative(), pallet_count: z.coerce.number().int().nonnegative(),
  equipment_type: z.enum(['FTL','LTL','TRUCK','SEMI','OTHER']), commercial_term: z.string().min(2), notes: z.string().optional(),
  quote_deadline: z.string().datetime(), currency_preferences: z.array(z.string().min(3)).min(1),
});

export async function GET() {
  try {
    const identity = await requireLogisticsIdentity();
    return NextResponse.json({ rfqs: await logisticsRepository.listRfqs(identity.organizationId), persistence: logisticsRepository.persistenceMode() });
  } catch (error) { return logisticsAuthErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requireLogisticsIdentity();
    const input = schema.parse(await request.json());
    const rfq = await logisticsRepository.createRfq({
      ...input, organization_id: identity.organizationId, code: `LRFQ-${Date.now().toString().slice(-8)}`,
      status: 'DRAFT', transport_mode: 'ROAD', created_by: 'NIUPACK_OS',
    });
    await logisticsRepository.logAuditEvent({ organization_id: identity.organizationId, actor_id: identity.profileId, event_type: 'RFQ_CREATED', target_entity: 'logistics_rfqs', entity_id: rfq.id, metadata: { code: rfq.code } });
    return NextResponse.json({ rfq }, { status: 201 });
  } catch (error) { return error instanceof Error && ['AUTH_REQUIRED','AUTH_NOT_CONFIGURED','AUTH_PROFILE_NOT_LINKED','AUTH_PROFILE_LINK_FAILED'].includes(error.message) ? logisticsAuthErrorResponse(error) : NextResponse.json({ error: error instanceof Error ? error.message : 'INVALID_REQUEST' }, { status: 400 }); }
}
