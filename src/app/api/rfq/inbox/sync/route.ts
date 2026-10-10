import { NextResponse } from 'next/server';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';

/** La lectura automática de Gmail no está implementada: se informa tal cual, sin respuestas simuladas. */
export async function POST() {
  try {
    await requireIdentityWithRole(WRITE_ROLES);
    return NextResponse.json({
      error: 'GMAIL_SYNC_NOT_AVAILABLE',
      message: 'La sincronización automática de Gmail no está disponible. Registrá la oferta desde la RFQ (enlace del proveedor, PDF o carga manual).',
    }, { status: 501 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
