import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { IContainersProvider } from '@/lib/logistics/icontainers-provider';

const querySchema = z.object({
  term: z.string().trim().min(2).max(100),
});

const statusCode: Record<string, number> = {
  NOT_CONFIGURED: 503,
  AUTH_FAILED: 401,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  DESTINATION_UNSUPPORTED: 422,
  ERROR: 502,
};

export async function GET(request: Request) {
  try {
    await requireNiuIdentity();
    const url = new URL(request.url);
    const query = querySchema.parse({
      term: url.searchParams.get('term') ?? url.searchParams.get('search'),
    });

    const result = await new IContainersProvider().searchPlaces(query.term, 'FCL');
    return NextResponse.json(result, { status: statusCode[result.status] ?? 200 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        provider: 'iContainers',
        status: 'ERROR',
        places: [],
        message: 'Ingresá al menos 2 caracteres para buscar puertos.',
      }, { status: 400 });
    }
    return NextResponse.json({
      provider: 'iContainers',
      status: 'ERROR',
      places: [],
      message: 'No fue posible buscar puertos con iContainers en este momento.',
    }, { status: 502 });
  }
}
