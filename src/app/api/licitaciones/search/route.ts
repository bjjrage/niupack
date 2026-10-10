import { NextResponse } from 'next/server';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { searchDncp } from '@/lib/licitaciones/dncp-client';

/** Búsqueda en el buscador oficial de DNCP. No guarda nada: importar es una acción explícita. */
export async function GET(request: Request) {
  try {
    await requireIdentityWithRole(WRITE_ROLES);
    const { searchParams } = new URL(request.url);
    const result = await searchDncp(searchParams.get('q') ?? '', Number(searchParams.get('page') ?? 1));
    return NextResponse.json({ ...result, source: 'DNCP datos abiertos (contrataciones.gov.py)' });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
