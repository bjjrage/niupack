import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { reviewCandidate } from '@/lib/licitaciones/service';

const schema = z.object({ decision: z.enum(['APROBADA', 'DESCARTADA', 'PENDIENTE']), note: z.string().trim().max(1000).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    return NextResponse.json({ candidate: await reviewCandidate(identity.organizationId, id, identity.profileId, body.decision, body.note) });
  } catch (error) {
    return domainErrorResponse(error);
  }
}
