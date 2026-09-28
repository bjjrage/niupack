import { NextResponse } from 'next/server';
import { z } from 'zod';
import { repository } from '@/lib/db/repository';
import { SeaRatesProvider } from '@/lib/logistics/providers';

const schema = z.object({
  origin: z.object({ country: z.string(), city: z.string().optional(), port: z.string().optional() }),
  destination: z.object({ country: z.string(), city: z.string().optional(), port: z.string().optional() }),
  shipment_date: z.string(), load_type: z.enum(['FCL','LCL']), equipment: z.enum(['20GP','40GP','40HC','LCL']),
  weight_kg: z.coerce.number().nonnegative(), volume_m3: z.coerce.number().nonnegative(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const organization = await repository.getOrganization();
    return NextResponse.json(await new SeaRatesProvider().searchRates(input, organization.id));
  } catch (error) {
    return NextResponse.json({ status: 'ERROR', rates: [], message: error instanceof Error ? error.message : 'INVALID_REQUEST' }, { status: 400 });
  }
}
