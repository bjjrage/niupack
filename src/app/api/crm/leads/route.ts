import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { crmRepository } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';
import { leadCreateSchema } from '@/lib/crm/validation';

export async function GET(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? undefined;
    const leads = await crmService.listLeads(identity.organizationId, status ?? undefined);
    return NextResponse.json({ leads, persistence: crmRepository.persistenceMode() });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireNiuIdentity();
    const input = leadCreateSchema.parse(await request.json());
    // Idempotencia si el cliente envía external_* (p. ej. reintento de UI/bot).
    if (input.external_source && input.external_id) {
      const { lead } = await crmService.upsertInboundLead(identity.organizationId, {
        external_source: input.external_source,
        external_id: input.external_id,
        source_channel: input.source_channel ?? 'WEB',
        country_code: input.country_code ?? null,
        product_interest: input.product_interest ?? null,
        capacity: input.capacity ?? null,
        material: input.material ?? null,
        printing: input.printing ?? null,
        estimated_volume: input.estimated_volume ?? null,
        volume_period: input.volume_period ?? null,
        destination_city: input.destination_city ?? null,
        destination_state: input.destination_state ?? null,
        destination_country: input.destination_country ?? null,
        intent: input.intent ?? 'OTHER',
        qualification: input.qualification ?? 'LOW',
      });
      // Aplicar campos humanos permitidos sin pisar reglas BOT (owner/next_action solo vía PATCH humano).
      return NextResponse.json({ lead }, { status: 201 });
    }
    const lead = await crmRepository.createLead({
      organization_id: identity.organizationId,
      company_id: input.company_id ?? null,
      contact_id: input.contact_id ?? null,
      source: input.source ?? 'MANUAL',
      source_channel: input.source_channel ?? 'WEB',
      external_source: input.external_source ?? null,
      external_id: input.external_id ?? null,
      country_code: input.country_code ?? null,
      product_interest: input.product_interest ?? null,
      capacity: input.capacity ?? null,
      material: input.material ?? null,
      printing: input.printing ?? null,
      estimated_volume: input.estimated_volume ?? null,
      volume_period: input.volume_period ?? null,
      destination_city: input.destination_city ?? null,
      destination_state: input.destination_state ?? null,
      destination_country: input.destination_country ?? null,
      intent: input.intent ?? 'OTHER',
      qualification: input.qualification ?? 'LOW',
      status: input.status ?? 'NUEVO',
      owner_profile_id: input.owner_profile_id ?? identity.profileId,
      next_action: input.next_action ?? null,
      next_action_at: input.next_action_at ?? null,
    });
    await crmService.addActivity(
      identity.organizationId,
      { lead_id: lead.id, type: 'LEAD_CREATED', source: 'CRM_UI', title: 'Lead creado manualmente' },
      identity.profileId,
    );
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'INVALID_REQUEST', details: error.flatten() }, { status: 400 });
    if (error instanceof Error && ['LEAD_DUPLICATE_EXTERNAL', 'CRM_PERSISTENCE_NOT_CONFIGURED'].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'LEAD_DUPLICATE_EXTERNAL' ? 409 : 503 });
    }
    return authErrorResponse(error);
  }
}
