import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmService } from '@/lib/crm/service';
import { leadUpdateSchema } from '@/lib/crm/validation';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const lead = await crmService.getLead(id, identity.organizationId);
    if (!lead) return NextResponse.json({ error: 'LEAD_NOT_FOUND' }, { status: 404 });
    return NextResponse.json({ lead });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const input = leadUpdateSchema.parse(await request.json());
    // Nunca confiar en organization_id del browser; se deriva de la identidad.
    const { organization_id: _ignored, ...updates } = input as Record<string, unknown>;
    const lead = await crmService.updateLead(id, identity.organizationId, updates as never, identity.profileId);
    return NextResponse.json({ lead });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'LEAD_NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') return NextResponse.json({ error: error.message }, { status: 403 });
    return authErrorResponse(error);
  }
}
