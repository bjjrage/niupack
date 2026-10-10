import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { createRfq, listRfqs, listSuppliers, rfqInputSchema } from '@/lib/rfq/service';

export async function GET() {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const [rfqs, suppliers] = await Promise.all([listRfqs(identity.organizationId), listSuppliers(identity.organizationId)]);
    return NextResponse.json({ rfqs, suppliers, role: identity.role });
  } catch (error) {
    return domainErrorResponse(error);
  }
}

/** Crea una RFQ multi-ítem. Nada viene pre-cargado: el código lo genera el servidor y los datos los ingresa la persona. */
export async function POST(request: Request) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const input = rfqInputSchema.parse(await request.json());
    const created = await createRfq(identity.organizationId, identity.profileId, input);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
