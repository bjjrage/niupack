import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { CargoFiveProvider } from '@/lib/logistics/cargofive-provider';
import { IContainersProvider } from '@/lib/logistics/icontainers-provider';

const querySchema = z.object({
  search: z.string().trim().min(2).max(100),
  place_type_id: z.enum(['1', '2']).optional(),
  provider: z.enum(['cargofive', 'icontainers']).optional(),
});
const statusCode: Record<string, number> = { NOT_CONFIGURED: 503, AUTH_FAILED: 401, RATE_LIMITED: 429, TIMEOUT: 504, ERROR: 502 };

export async function GET(request: Request) {
  try {
    await requireNiuIdentity();
    const url = new URL(request.url);
    const query = querySchema.parse({
      search: url.searchParams.get('search') ?? url.searchParams.get('term'),
      place_type_id: url.searchParams.get('place_type_id') ?? undefined,
      provider: url.searchParams.get('provider') ?? undefined,
    });
    if (query.provider === 'icontainers') {
      const result = await new IContainersProvider().searchPlaces(query.search, 'FCL');
      return NextResponse.json(result, { status: statusCode[result.status] ?? 200 });
    }
    if (query.search.length < 4) {
      return NextResponse.json({ status: 'ERROR', places: [], message: 'Ingresá al menos 4 caracteres para buscar un puerto o lugar.' }, { status: 400 });
    }
    const result = await new CargoFiveProvider().searchPlaces(query.search, query.place_type_id ? Number(query.place_type_id) as 1 | 2 : undefined);
    return NextResponse.json(result, { status: statusCode[result.status] ?? 200 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('AUTH_')) return authErrorResponse(error);
    if (error instanceof z.ZodError) return NextResponse.json({ status: 'ERROR', places: [], message: 'Ingresá al menos 4 caracteres para buscar un puerto o lugar.' }, { status: 400 });
    return NextResponse.json({ status: 'ERROR', places: [], message: 'No fue posible buscar puertos y lugares en este momento.' }, { status: 502 });
  }
}
