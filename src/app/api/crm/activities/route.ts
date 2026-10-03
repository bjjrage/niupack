import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';
import { activityCreateSchema } from '@/lib/crm/validation';

/** Timeline filtrado por oportunidad, cuenta o lead (al menos un filtro es obligatorio). */
export async function GET(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(request.url);
    const filter = {
      opportunity_id: searchParams.get('opportunity_id') ?? undefined,
      company_id: searchParams.get('company_id') ?? undefined,
      lead_id: searchParams.get('lead_id') ?? undefined,
    };
    if (!filter.opportunity_id && !filter.company_id && !filter.lead_id) {
      return NextResponse.json({ error: 'FILTER_REQUIRED' }, { status: 400 });
    }
    const activities = await crmRepository.listActivities(identity.organizationId, filter);
    return NextResponse.json({ activities: activities.slice(0, 50) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Crea una entrada de timeline (nota, mensaje humano, etc.) con validación cross-tenant. */
export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const input = activityCreateSchema.parse(await request.json());
    const activity = await crmService.addActivity(
      identity.organizationId,
      {
        lead_id: input.lead_id ?? null,
        opportunity_id: input.opportunity_id ?? null,
        company_id: input.company_id ?? null,
        contact_id: input.contact_id ?? null,
        conversation_id: input.conversation_id ?? null,
        type: input.type,
        source: input.source ?? 'CRM_UI',
        title: input.title ?? null,
        body: input.body ?? null,
        metadata: input.metadata ?? {},
        external_key: input.external_key ?? null,
      },
      identity.profileId,
    );
    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') return NextResponse.json({ error: error.message }, { status: 403 });
    return authErrorResponse(error);
  }
}
