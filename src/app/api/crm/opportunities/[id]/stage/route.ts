import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmService } from '@/lib/crm/service';
import { stageChangeSchema } from '@/lib/crm/validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const input = stageChangeSchema.parse(await request.json());
    const opportunity = await crmService.changeOpportunityStage(identity.organizationId, id, input.stage, {
      actor: 'HUMAN',
      actorProfileId: identity.profileId,
      lost_reason: input.lost_reason ?? null,
    });
    return NextResponse.json({ opportunity });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && error.message === 'OPPORTUNITY_NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    return authErrorResponse(error);
  }
}
