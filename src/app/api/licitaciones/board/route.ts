import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { listTenderBoard } from '@/lib/licitaciones/scanner';

const querySchema = z.object({ filter: z.enum(['en_curso', 'adjudicadas', 'cerradas', 'todas']).default('en_curso'), q: z.string().trim().max(100).optional() });

/** Licitaciones con inyectables: en curso, adjudicadas, con sus participantes, ganadores y productos adjudicados. */
export async function GET(request: Request) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const params = new URL(request.url).searchParams;
    const { filter, q } = querySchema.parse({ filter: params.get('filter') ?? undefined, q: params.get('q') ?? undefined });
    return NextResponse.json({ tenders: await listTenderBoard(identity.organizationId, filter, q) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
