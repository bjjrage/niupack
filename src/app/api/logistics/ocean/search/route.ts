import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SeaRatesProvider } from '@/lib/logistics/providers';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';

const schema = z.object({
  origin: z.object({ country: z.string(), city: z.string().optional(), port: z.string().optional() }),
  destination: z.object({ country: z.string(), city: z.string().optional(), port: z.string().optional() }),
  shipment_date: z.string(), load_type: z.enum(['FCL','LCL']), equipment: z.enum(['20GP','40GP','40HC','LCL']),
  weight_kg: z.coerce.number().nonnegative(), volume_m3: z.coerce.number().nonnegative(),
});

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const input = schema.parse(await request.json());
    return NextResponse.json(await new SeaRatesProvider().searchRates(input, identity.organizationId));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    if (error instanceof z.ZodError) return NextResponse.json({ status: 'ERROR', rates: [], message: 'INVALID_REQUEST' }, { status: 400 });
    return NextResponse.json({ status: 'ERROR', rates: [], message: 'SEARCH_FAILED' }, { status: 400 });
  }
}
