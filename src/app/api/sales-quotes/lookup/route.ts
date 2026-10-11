import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { getQuoteDefaults, searchCompanies, searchSkus } from '@/lib/sales-quotes/service';

/** Ayudas del formulario: SKU del catálogo, empresas del CRM y la última firma/condiciones usadas. */
export async function GET(request: Request) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const params = new URL(request.url).searchParams;
    const q = params.get('q') ?? '';
    const kind = params.get('kind');
    if (kind === 'skus') return NextResponse.json({ skus: await searchSkus(identity.organizationId, q) });
    if (kind === 'companies') return NextResponse.json({ companies: await searchCompanies(identity.organizationId, q) });
    if (kind === 'defaults') return NextResponse.json({ defaults: await getQuoteDefaults(identity.organizationId, identity.profileId) });
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  } catch (error) { return domainErrorResponse(error); }
}
