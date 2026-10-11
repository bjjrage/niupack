import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { listTenderBoard, listTenderEntities } from '@/lib/licitaciones/scanner';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const querySchema = z.object({
  filter: z.enum(['en_curso', 'adjudicadas', 'cerradas', 'todas']).default('en_curso'),
  q: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(300).optional(),
  from: day,
  to: day,
  dismissed: z.enum(['1', '0']).optional(),
});

/** Licitaciones con inyectables: en curso, adjudicadas, con sus participantes, ganadores y productos adjudicados. */
export async function GET(request: Request) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const params = new URL(request.url).searchParams;
    const get = (key: string) => params.get(key) || undefined;
    const query = querySchema.parse({ filter: get('filter'), q: get('q'), entity: get('entity'), from: get('from'), to: get('to'), dismissed: get('dismissed') });
    const [tenders, entities] = await Promise.all([
      listTenderBoard(identity.organizationId, query.filter, { search: query.q, entity: query.entity, from: query.from, to: query.to, dismissed: query.dismissed === '1' }),
      listTenderEntities(identity.organizationId),
    ]);
    return NextResponse.json({ tenders, entities });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
