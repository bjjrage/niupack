// Tools CRM para NIUPACKBOT: ÚNICA vía BOT -> CRM (vía crmService, nunca supabase directo).
import { crmService } from '@/lib/crm/service';
import type { ExtractedCommercial } from '../types';

export const crmTools = {
  async upsertInboundLead(
    organizationId: string,
    input: { externalSource: string; externalId: string; channel: string; contactName?: string | null; whatsapp?: string | null; extracted: ExtractedCommercial },
  ) {
    return crmService.upsertInboundLead(organizationId, {
      external_source: input.externalSource,
      external_id: input.externalId,
      source_channel: input.channel,
      contact_name: input.contactName ?? null,
      whatsapp_phone: input.whatsapp ?? null,
      country_code: input.extracted.country ?? null,
      language: input.extracted.language ?? null,
      product_interest: input.extracted.product_interest ?? null,
      capacity: input.extracted.capacity ?? null,
      material: input.extracted.material ?? null,
      printing: input.extracted.printing ?? null,
      estimated_volume: input.extracted.estimated_volume ?? null,
      volume_period: input.extracted.volume_period ?? null,
      destination_city: input.extracted.destination_city ?? null,
      destination_state: input.extracted.destination_state ?? null,
      destination_country: input.extracted.destination_country ?? input.extracted.country ?? null,
      intent: input.extracted.intent ?? 'OTHER',
      qualification: input.extracted.qualification ?? 'LOW',
    });
  },

  createOpportunityFromLead: (organizationId: string, leadId: string) =>
    crmService.createOpportunityFromLead(organizationId, leadId, { stage: 'CALIFICADO' }),

  addActivity: (
    organizationId: string,
    input: { lead_id?: string | null; conversation_id?: string | null; type: 'BOT_MESSAGE' | 'HUMAN_MESSAGE' | 'NOTE'; title?: string | null; body?: string | null; metadata?: Record<string, unknown> },
  ) => crmService.addActivity(organizationId, { ...input, source: 'NIUPACKBOT' }),

  createFollowUpTask: (organizationId: string, input: { lead_id: string; title: string; description?: string | null; external_key: string }) =>
    crmService.createTask(organizationId, { ...input, source: 'NIUPACKBOT', priority: 'MEDIUM' }),

  requestHumanHandoff: (organizationId: string, input: { lead_id?: string | null; conversation_id: string; reason?: string | null }) =>
    crmService.requestHumanHandoff(organizationId, input),
};
