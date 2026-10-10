import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { convertCandidateToProspect } from '@/lib/licitaciones/service';

const schema = z.object({
  create_opportunity: z.boolean().default(false),
  opportunity_title: z.string().trim().max(200).optional(),
  link_company_id: z.string().uuid().optional(),
  force_create: z.boolean().default(false),
});

/** "Agregar a prospectos": crea o vincula la empresa como PROSPECT. Nunca la convierte en cliente ni contacta a nadie. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const body = schema.parse(await request.json().catch(() => ({})));
    const result = await convertCandidateToProspect(identity.organizationId, identity.profileId, id, {
      createOpportunity: body.create_opportunity, opportunityTitle: body.opportunity_title,
      linkCompanyId: body.link_company_id, forceCreate: body.force_create,
    });
    return NextResponse.json(result);
  } catch (error) {
    return domainErrorResponse(error);
  }
}
