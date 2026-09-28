import { NextResponse } from 'next/server';
import { z } from 'zod';
import { repository } from '@/lib/db/repository';
import { logisticsRepository } from '@/lib/logistics/repository';

const schema = z.object({
  origin: z.object({ country: z.string(), city: z.string().optional(), port: z.string().optional() }),
  destination: z.object({ country: z.string(), city: z.string().optional(), port: z.string().optional() }),
  mode: z.enum(['OCEAN','ROAD']), amount: z.coerce.number().nonnegative(), currency: z.string().length(3),
  valid_from: z.string().optional(), valid_until: z.string().optional(), transit_days: z.coerce.number().int().nonnegative().optional(),
  weight_kg: z.coerce.number().nonnegative().optional(), volume_m3: z.coerce.number().nonnegative().optional(), equipment: z.string().optional(),
  components: z.record(z.string(), z.number()).optional(), status: z.enum(['INDICATIVE','CONFIRMED']).default('CONFIRMED'),
});

export async function GET() { return NextResponse.json({ rates: await logisticsRepository.listRates(), persistence: logisticsRepository.persistenceMode() }); }
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const organization = await repository.getOrganization();
    const rate = await logisticsRepository.createRate({ ...body, organization_id: organization.id, source: 'MANUAL_RATE', components: body.components ?? {} });
    return NextResponse.json({ rate }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'INVALID_REQUEST' }, { status: 400 }); }
}
