import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { getRfqDetail } from '@/lib/rfq/service';

/** Cotizaciones de una RFQ (todas las versiones). La organización sale siempre de la sesión. */
export async function GET(request: Request) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const rfqId = z.string().uuid().parse(new URL(request.url).searchParams.get('rfq_id'));
    const detail = await getRfqDetail(identity.organizationId, rfqId);
    return NextResponse.json({ quotes: detail.quotes });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
