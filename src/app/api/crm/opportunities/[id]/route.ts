import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';
import { opportunityUpdateSchema } from '@/lib/crm/validation';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const opportunity = await crmRepository.getOpportunity(id, identity.organizationId);
    if (!opportunity) return NextResponse.json({ error: 'OPPORTUNITY_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ opportunity });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const input = opportunityUpdateSchema.parse(await request.json());
    const opportunity = await crmService.updateOpportunity(id, identity.organizationId, input as never, identity.profileId);
    return NextResponse.json({ opportunity });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && error.message === 'OPPORTUNITY_NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    return authErrorResponse(error);
  }
}
