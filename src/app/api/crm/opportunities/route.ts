import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';
import { opportunityCreateSchema } from '@/lib/crm/validation';

export async function GET(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage') ?? undefined;
    const opportunities = await crmService.listOpportunities(identity.organizationId, stage ?? undefined);
    return NextResponse.json({ opportunities, persistence: crmRepository.persistenceMode() });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const raw = await request.json();
    // Crear desde lead (idempotente: un open por lead) o crear libre.
    if (raw.lead_id) {
      const opp = await crmService.createOpportunityFromLead(
        identity.organizationId,
        String(raw.lead_id),
        { title: raw.title, stage: raw.stage, owner_profile_id: raw.owner_profile_id ?? identity.profileId },
        identity.profileId,
      );
      return NextResponse.json({ opportunity: opp }, { status: 201 });
    }
    const input = opportunityCreateSchema.parse(raw);
    const opp = await crmService.createOpportunityManual(
      identity.organizationId,
      {
        company_id: input.company_id ?? null,
        contact_id: input.contact_id ?? null,
        lead_id: input.lead_id ?? null,
        title: input.title,
        stage: input.stage ?? 'NUEVO',
      product_interest: input.product_interest ?? null,
      sku: input.sku ?? null,
      capacity: input.capacity ?? null,
      material: input.material ?? null,
      printing: input.printing ?? null,
      estimated_volume: input.estimated_volume ?? null,
      volume_period: input.volume_period ?? null,
      estimated_value: input.estimated_value ?? null,
      currency: input.currency ?? 'USD',
      destination_city: input.destination_city ?? null,
      destination_state: input.destination_state ?? null,
      destination_country: input.destination_country ?? null,
      owner_profile_id: input.owner_profile_id ?? identity.profileId,
      next_action: input.next_action ?? null,
      next_action_at: input.next_action_at ?? null,
      expected_close_at: input.expected_close_at ?? null,
      probability: input.probability ?? null,
      won_at: null,
      lost_at: null,
      lost_reason: null,
    }, identity.profileId);
    return NextResponse.json({ opportunity: opp }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && ['LEAD_NOT_FOUND', 'CRM_PERSISTENCE_NOT_CONFIGURED'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
