import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { authErrorResponse, NiuAuthError, requireNiuIdentity, type NiuIdentity } from './identity';

export type NiuRole = NiuIdentity['role'];

/** Identidad de sesión + rol permitido. La organización siempre sale de la sesión del servidor, nunca del body. */
export async function requireIdentityWithRole(allowed: readonly NiuRole[]): Promise<NiuIdentity> {
  const identity = await requireNiuIdentity();
  if (!allowed.includes(identity.role)) throw new NiuAuthError('ROLE_NOT_ALLOWED', 403);
  return identity;
}

export const READ_ROLES: readonly NiuRole[] = ['admin', 'analyst', 'executive'];
export const WRITE_ROLES: readonly NiuRole[] = ['admin', 'analyst'];

interface CodedError { code?: string; status?: number }

/** Respuesta uniforme: los errores de dominio llevan `code` y `status`; nunca se devuelve éxito ante un fallo de base de datos. */
export function domainErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'INVALID_REQUEST', issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
  }
  const coded = error as CodedError | undefined;
  if (error instanceof Error && typeof coded?.status === 'number' && typeof coded.code === 'string' && coded.code.length > 3 && /^[A-Z][A-Z0-9_]+$/.test(coded.code)) {
    return NextResponse.json({ error: coded.code, message: error.message === coded.code ? undefined : error.message }, { status: coded.status });
  }
  if (error instanceof Error && /^(OCDS_|INVALID_)/.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof NiuAuthError || (error instanceof Error && (error.message.startsWith('SUPABASE_') || (coded?.status === 401 || coded?.status === 403)))) {
    return authErrorResponse(error);
  }
  return NextResponse.json({ error: 'OPERATION_FAILED', message: error instanceof Error ? error.message : 'Operación fallida' }, { status: 500 });
}
