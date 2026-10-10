import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { FreightosProvider } from '@/lib/logistics/freightos-provider';

const schema = z.object({
  origin: z.string().trim().min(2).max(120),
  destination: z.string().trim().min(2).max(120),
  equipment: z.enum(['20GP', '40GP', '40HC']),
  quantity: z.coerce.number().int().positive().max(100),
  weight_kg: z.coerce.number().positive().max(100_000).optional(),
});

const statusCode: Record<string, number> = { RATE_LIMITED: 429, TIMEOUT: 504, ERROR: 502 };

export async function POST(request: Request) {
  try {
    await requireNiuIdentity();
    const input = schema.parse(await request.json());
    const result = await new FreightosProvider().estimate(input);
    return NextResponse.json(result, { status: statusCode[result.status] ?? 200 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        provider: 'Freightos', status: 'ERROR', estimates: [],
        message: 'Revisá origen, destino, contenedor, cantidad y peso.',
      }, { status: 400 });
    }
    return NextResponse.json({
      provider: 'Freightos', status: 'ERROR', estimates: [],
      message: 'No fue posible consultar estimaciones marítimas en este momento.',
    }, { status: 502 });
  }
}
