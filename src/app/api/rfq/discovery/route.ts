import { NextResponse } from 'next/server';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';

/**
 * El descubrimiento automático de proveedores por web no está disponible.
 * Antes devolvía una lista fija presentada como "búsqueda con OpenAI" y la guardaba en memoria; eso era un resultado inventado.
 * Los proveedores se cargan y aprueban en el Maestro de proveedores, y las RFQ se dirigen a esos proveedores.
 */
export async function POST() {
  try {
    await requireIdentityWithRole(WRITE_ROLES);
    return NextResponse.json({
      error: 'DISCOVERY_NOT_AVAILABLE',
      message: 'El descubrimiento automático de proveedores no está disponible. Cargá proveedores en el Maestro de proveedores y seleccionalos al crear la RFQ.',
    }, { status: 501 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
