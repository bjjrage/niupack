import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logisticsRepository } from '@/lib/logistics/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { logisticsRfqCreateSchema } from '@/lib/logistics/rfq-schema';

export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    return NextResponse.json({ rfqs: await logisticsRepository.listRfqs(identity.organizationId), persistence: logisticsRepository.persistenceMode() });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const input = logisticsRfqCreateSchema.parse(await request.json());
    const rfq = await logisticsRepository.createRfq({
      ...input, organization_id: identity.organizationId, code: `LRFQ-${Date.now().toString().slice(-8)}`,
      status: 'DRAFT', transport_mode: 'ROAD', created_by: 'NIUPACK_OS',
    });
    await logisticsRepository.logAuditEvent({ organization_id: identity.organizationId, actor_id: identity.profileId, event_type: 'RFQ_CREATED', target_entity: 'logistics_rfqs', entity_id: rfq.id, metadata: { code: rfq.code } });
    return NextResponse.json({ rfq }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ['AUTH_REQUIRED','AUTH_NOT_CONFIGURED','AUTH_PROFILE_NOT_LINKED','AUTH_PROFILE_LINK_FAILED'].includes(error.message)) return authErrorResponse(error);
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    return NextResponse.json({ error: 'RFQ_CREATION_FAILED' }, { status: 400 });
  }
}
