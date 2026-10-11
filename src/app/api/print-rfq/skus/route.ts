import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { searchSkus } from '@/lib/print-rfq/service';

/** Catálogo de SKU de NIUPACK para elegir el producto a imprimir. */
export async function GET(request: Request) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    return NextResponse.json({ skus: await searchSkus(identity.organizationId, new URL(request.url).searchParams.get('q') ?? '') });
  } catch (error) { return domainErrorResponse(error); }
}
