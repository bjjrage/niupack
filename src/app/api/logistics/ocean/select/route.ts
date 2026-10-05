import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { logisticsRepository } from '@/lib/logistics/repository';
import { CargoFiveProvider } from '@/lib/logistics/cargofive-provider';

const schema = z.object({ selection_token: z.string().min(20).max(30_000) });

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const { selection_token } = schema.parse(await request.json());
    const verified = new CargoFiveProvider().verifySelectionToken(selection_token, identity.organizationId);
    if (!verified.rate) {
      const status = verified.error === 'NOT_CONFIGURED' ? 503 : verified.error === 'EXPIRED_SELECTION' ? 409 : 400;
      return NextResponse.json({ error: verified.error }, { status });
    }
    if (verified.rate.valid_until && new Date(verified.rate.valid_until).getTime() < Date.now()) {
      return NextResponse.json({ error: 'RATE_EXPIRED' }, { status: 409 });
    }
    const rate = await logisticsRepository.createRate({ ...verified.rate, status: 'SELECTED' });
    await logisticsRepository.logAuditEvent({
      organization_id: identity.organizationId,
      actor_id: identity.profileId,
      event_type: 'RATE_SELECTED',
      target_entity: 'logistics_rates',
      entity_id: rate.id,
      metadata: { source_reference: rate.source_reference, provider: 'CARGOFIVE' },
    });
    return NextResponse.json({ rate }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_SELECTION' }, { status: 400 });
    return NextResponse.json({ error: 'RATE_SELECTION_FAILED' }, { status: 500 });
  }
}
