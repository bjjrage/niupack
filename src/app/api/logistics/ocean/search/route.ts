import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CargoFiveProvider } from '@/lib/logistics/cargofive-provider';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';

const placeSchema = z.object({
  provider_place_id: z.coerce.number().int().positive(),
  place_type_id: z.union([z.literal(1), z.literal(2)]),
  country: z.string().min(1),
  city: z.string().optional(),
  port: z.string().optional(),
  display_name: z.string().min(1),
  unlocode: z.string().optional(),
});
const schema = z.object({
  origin: placeSchema,
  destination: placeSchema,
  shipment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  load_type: z.literal('FCL'),
  equipment: z.enum(['20GP','40GP','40HC']),
  quantity: z.coerce.number().int().positive().max(100),
  weight_kg: z.coerce.number().positive().max(100_000),
  volume_m3: z.coerce.number().nonnegative().optional().default(0),
});

const statusCode: Record<string, number> = { NOT_CONFIGURED: 503, RATE_LIMITED: 429, TIMEOUT: 504, ERROR: 502 };

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const input = schema.parse(await request.json());
    const result = await new CargoFiveProvider().searchRates(input, identity.organizationId);
    return NextResponse.json(result, { status: statusCode[result.status] ?? 200 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    if (error instanceof z.ZodError) return NextResponse.json({ provider: 'CargoFive', status: 'ERROR', rates: [], message: 'Revisá origen, destino, fecha, equipo, cantidad y peso bruto.' }, { status: 400 });
    return NextResponse.json({ provider: 'CargoFive', status: 'ERROR', rates: [], message: 'No fue posible obtener tarifas marítimas en este momento.' }, { status: 502 });
  }
}
