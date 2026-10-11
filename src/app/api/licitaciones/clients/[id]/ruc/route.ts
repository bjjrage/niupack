import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { setClientRuc, suggestRuc } from '@/lib/licitaciones/scanner';

/** Sugerencias de RUC tomadas de proveedores reales de DNCP. Son solo propuestas: las confirma una persona. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const companyId = z.string().uuid().parse((await context.params).id);
    return NextResponse.json({ suggestions: await suggestRuc(identity.organizationId, companyId), source: 'DNCP datos abiertos' });
  } catch (error) {
    return domainErrorResponse(error);
  }
}

/** Confirma el RUC del cliente (se guarda en su ficha del CRM) y empieza a vigilarlo. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const companyId = z.string().uuid().parse((await context.params).id);
    const { ruc } = z.object({ ruc: z.string().trim().min(6).max(14) }).parse(await request.json());
    return NextResponse.json(await setClientRuc(identity.organizationId, companyId, ruc));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
