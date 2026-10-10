import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';

/**
 * Retirado: este matcher usaba tipos de cambio y fletes fijos, asignaba el primer SKU del catálogo como respaldo
 * y guardaba el resultado en memoria sin organización. Lo reemplaza el comparador de RFQ (/api/rfq/rfqs/{id}/comparison),
 * que normaliza con el FX de NIUPACK, exige datos explícitos y compara contra la hoja de costos vigente del SKU.
 */
const GONE = {
  error: 'QUOTE_MATCHER_RETIRED',
  message: 'El matcher de cotizaciones fue reemplazado por el comparador de la RFQ. Abrí la RFQ y usá la pestaña Comparador.',
};

export async function GET() {
  try {
    await requireIdentityWithRole(READ_ROLES);
    return NextResponse.json(GONE, { status: 410 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}

export async function POST() {
  try {
    await requireIdentityWithRole(READ_ROLES);
    return NextResponse.json(GONE, { status: 410 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
