import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmService } from '@/lib/crm/service';
import { companySchema } from '@/lib/crm/validation';

/** Edita datos de la cuenta (contacto, estado, responsable). Solo campos enviados. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const raw = (await request.json()) as Record<string, unknown>;
    const parsed = companySchema.partial().parse(raw);
    // zod rellena opcionales con null: conservar solo lo que el cliente mandó.
    const updates = Object.fromEntries(Object.entries(parsed).filter(([k]) => k in raw));
    const company = await crmService.updateCompany(identity.organizationId, id, updates, identity.profileId);
    return NextResponse.json({ company });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && error.message === 'COMPANY_NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    return authErrorResponse(error);
  }
}
