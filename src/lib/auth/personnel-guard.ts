import { NextRequest, NextResponse } from 'next/server';
import { requireNiuIdentity, NiuIdentity } from './identity';
import { verifyPackingToken } from './packing-token';

/**
 * Enforces administrative access to personnel and salary band endpoints.
 * Rejects packing operators (e.g. mobile stopwatch QR tokens) with 403 Forbidden.
 */
export async function requirePersonnelAdminIdentity(req: NextRequest): Promise<NiuIdentity> {
  const tokenHeader = req.headers.get('x-packing-token');
  const authHeader = req.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const urlToken = new URL(req.url).searchParams.get('token');

  const candidateToken = tokenHeader || bearerToken || urlToken;
  if (candidateToken) {
    const verified = verifyPackingToken(candidateToken);
    if (verified && verified.role === 'packing_operator') {
      const forbiddenError = new Error('FORBIDDEN_OPERATOR_NO_SALARY_ACCESS');
      (forbiddenError as any).status = 403;
      throw forbiddenError;
    }
  }

  return await requireNiuIdentity();
}

export function personnelAuthErrorResponse(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') {
    return NextResponse.json({ error: 'DUPLICATE_VALUE', message: 'El código o nombre ya existe en esta organización.' }, { status: 409 });
  }
  if (error instanceof Error && (error as any).status === 403) {
    return NextResponse.json(
      { error: error.message, message: 'Acceso restringido: no autorizado para gestionar salarios o personal.' },
      { status: 403 }
    );
  }
  if (error instanceof Error && (error as any).status === 401) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof Error) {
    const code = error.message;
    if (code.endsWith('_NOT_FOUND')) {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code.includes('ALREADY_EXISTS') || code.includes('ALLOCATION_EXCEEDED') || code.includes('ya tiene imputaciones')) {
      return NextResponse.json({ error: code, message: code }, { status: 409 });
    }
    if (
      code.startsWith('INVALID_') ||
      code === 'PERSONNEL_INACTIVE' ||
      code === 'PERSONNEL_NOT_ACTIVE_ON_DATE' ||
      code.includes('ya está aprobada') ||
      code.includes('está anulada') ||
      code.includes('no pertenece a la sesión') ||
      code.includes('supera el segmento') ||
      code.includes('debe sumar') ||
      code.includes('banda salarial indicada') ||
      code.includes('duración asignada') ||
      code.includes('determinar la duración')
    ) {
      return NextResponse.json({ error: code, message: code }, { status: 400 });
    }
  }
  return NextResponse.json({ error: 'AUTH_FAILED', message: (error as Error)?.message }, { status: 500 });
}
