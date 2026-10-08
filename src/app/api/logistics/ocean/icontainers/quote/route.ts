import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { IContainersProvider } from '@/lib/logistics/icontainers-provider';

const schema = z.object({
  origin: z.object({
    port_code: z.string().trim().min(2).max(10),
    name: z.string().trim().optional(),
    country_code: z.string().trim().optional(),
  }),
  destination: z.object({
    port_code: z.string().trim().min(2).max(10),
    name: z.string().trim().optional(),
    country_code: z.string().trim().optional(),
  }),
  equipment: z.enum(['20GP', '40GP', '40HC']),
  quantity: z.coerce.number().int().positive().max(100),
  shipment_date: z.string().trim().optional(),
  weight_kg: z.coerce.number().positive().max(100_000).optional(),
  validate_paraguay: z.boolean().optional(),
});

const statusCode: Record<string, number> = {
  NOT_CONFIGURED: 503,
  AUTH_FAILED: 401,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  DESTINATION_UNSUPPORTED: 422,
  ERROR: 502,
};

export async function POST(request: Request) {
  try {
    await requireNiuIdentity();
    const input = schema.parse(await request.json());

    // Pilot is strictly read-only: no booking, no automatic rate persistence
    const result = await new IContainersProvider().createFclQuote(input);
    return NextResponse.json(result, { status: statusCode[result.status] ?? 200 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        provider: 'iContainers',
        status: 'ERROR',
        rates: [],
        message: 'Revisá los parámetros de la consulta (puerto de origen, destino, contenedor y cantidad).',
      }, { status: 400 });
    }
    return NextResponse.json({
      provider: 'iContainers',
      status: 'ERROR',
      rates: [],
      message: 'No fue posible cotizar con iContainers Brutus en este momento.',
    }, { status: 502 });
  }
}
