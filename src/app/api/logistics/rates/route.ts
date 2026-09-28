import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logisticsRepository } from '@/lib/logistics/repository';
import { logisticsAuthErrorResponse, requireLogisticsIdentity } from '@/lib/auth/logistics-auth';

const schema = z.object({
  origin: z.object({ country: z.string(), city: z.string().optional(), port: z.string().optional() }),
  destination: z.object({ country: z.string(), city: z.string().optional(), port: z.string().optional() }),
  mode: z.enum(['OCEAN','ROAD']), amount: z.coerce.number().nonnegative(), currency: z.string().length(3),
  valid_from: z.string().optional(), valid_until: z.string().optional(), transit_days: z.coerce.number().int().nonnegative().optional(),
  weight_kg: z.coerce.number().nonnegative().optional(), volume_m3: z.coerce.number().nonnegative().optional(), equipment: z.string().optional(),
  components: z.record(z.string(), z.number()).optional(), status: z.enum(['INDICATIVE','CONFIRMED']).default('CONFIRMED'),
});

export async function GET() {
  try { const identity = await requireLogisticsIdentity(); return NextResponse.json({ rates: await logisticsRepository.listRates(identity.organizationId), persistence: logisticsRepository.persistenceMode() }); }
  catch (error) { return logisticsAuthErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const identity = await requireLogisticsIdentity();
    const body = schema.parse(await request.json());
    const rate = await logisticsRepository.createRate({ ...body, organization_id: identity.organizationId, source: 'MANUAL_RATE', components: body.components ?? {} });
    return NextResponse.json({ rate }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return logisticsAuthErrorResponse(error);
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    return NextResponse.json({ error: 'RATE_CREATION_FAILED' }, { status: 400 });
  }
}
