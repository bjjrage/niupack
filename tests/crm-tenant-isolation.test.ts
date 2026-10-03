import { describe, it, expect, beforeEach } from 'vitest';
import { crmRepository, resetCrmMemory } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';

const ORG_A = '00000000-0000-0000-0000-0000000000a1';
const ORG_B = '00000000-0000-0000-0000-0000000000b2';

beforeEach(() => {
  resetCrmMemory();
});

describe('CRM tenant isolation', () => {
  it('Org A no ve datos de Org B', async () => {
    const a = await crmRepository.createLead({
      organization_id: ORG_A,
      company_id: null,
      contact_id: null,
      source: 'MANUAL',
      source_channel: 'WEB',
      external_source: null,
      external_id: null,
      country_code: 'BR',
      product_interest: 'vaso polipapel',
      capacity: '12 oz',
      material: null,
      printing: null,
      estimated_volume: 1000,
      volume_period: 'MONTHLY',
      destination_city: 'Curitiba',
      destination_state: null,
      destination_country: 'BR',
      intent: 'RFQ',
      qualification: 'MEDIUM',
      status: 'NUEVO',
      owner_profile_id: null,
      next_action: null,
      next_action_at: null,
    });
    const leadsB = await crmRepository.listLeads(ORG_B);
    expect(leadsB).toHaveLength(0);
    const leaked = await crmRepository.getLead(a.id, ORG_B);
    expect(leaked).toBeUndefined();
    const own = await crmRepository.getLead(a.id, ORG_A);
    expect(own?.id).toBe(a.id);
  });

  it('forged organization_id no modifica otro tenant', async () => {
    const a = await crmRepository.createLead({
      organization_id: ORG_A,
      company_id: null,
      contact_id: null,
      source: 'MANUAL',
      source_channel: 'WEB',
      external_source: null,
      external_id: null,
      country_code: null,
      product_interest: null,
      capacity: null,
      material: null,
      printing: null,
      estimated_volume: null,
      volume_period: null,
      destination_city: null,
      destination_state: null,
      destination_country: null,
      intent: 'OTHER',
      qualification: 'LOW',
      status: 'NUEVO',
      owner_profile_id: null,
      next_action: null,
      next_action_at: null,
    });
    await expect(crmRepository.updateLead(a.id, ORG_B, { product_interest: 'hack' } as never)).rejects.toThrow();
    const intact = await crmRepository.getLead(a.id, ORG_A);
    expect(intact?.product_interest).not.toBe('hack');
  });

  it('idempotencia por external_source/external_id no duplica', async () => {
    const first = await crmService.upsertInboundLead(ORG_A, {
      external_source: 'WHATSAPP_TWILIO',
      external_id: 'whatsapp:+5511999999999',
      source_channel: 'WHATSAPP',
      contact_name: 'Cliente',
      whatsapp_phone: '+5511999999999',
      product_interest: 'vaso polipapel',
      estimated_volume: 500000,
      volume_period: 'MONTHLY',
      destination_city: 'Curitiba',
      destination_country: 'BR',
      intent: 'RFQ',
      qualification: 'HIGH',
    });
    const second = await crmService.upsertInboundLead(ORG_A, {
      external_source: 'WHATSAPP_TWILIO',
      external_id: 'whatsapp:+5511999999999',
      source_channel: 'WHATSAPP',
      product_interest: 'vaso polipapel',
      estimated_volume: 500000,
      volume_period: 'MONTHLY',
      destination_city: 'Curitiba',
      destination_country: 'BR',
      intent: 'RFQ',
      qualification: 'HIGH',
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.lead.id).toBe(first.lead.id);
    const all = await crmRepository.listLeads(ORG_A);
    expect(all).toHaveLength(1);
  });

  it('BOT no retrocede NEGOCIACIÓN → NUEVO ni cierra', async () => {
    const { lead } = await crmService.upsertInboundLead(ORG_A, {
      external_source: 'WHATSAPP_TWILIO',
      external_id: 'whatsapp:+552',
      source_channel: 'WHATSAPP',
      intent: 'RFQ',
      qualification: 'HIGH',
    });
    const opp = await crmService.createOpportunityFromLead(ORG_A, lead.id, { stage: 'NEGOCIACIÓN' });
    const kept = await crmService.changeOpportunityStage(ORG_A, opp.id, 'NUEVO', { actor: 'BOT' });
    expect(kept.stage).toBe('NEGOCIACIÓN');
    const kept2 = await crmService.changeOpportunityStage(ORG_A, opp.id, 'GANADO', { actor: 'BOT' });
    expect(kept2.stage).toBe('NEGOCIACIÓN');
    const human = await crmService.changeOpportunityStage(ORG_A, opp.id, 'GANADO', { actor: 'HUMAN' });
    expect(human.stage).toBe('GANADO');
  });

  it('BOT no pisa owner/next_action humanos (field authority)', async () => {
    const { lead } = await crmService.upsertInboundLead(ORG_A, {
      external_source: 'WHATSAPP_TWILIO',
      external_id: 'whatsapp:+553',
      source_channel: 'WHATSAPP',
      intent: 'OTHER',
      qualification: 'LOW',
    });
    await crmService.updateLead(lead.id, ORG_A, { owner_profile_id: 'human-owner', next_action: 'Llamar mañana' } as never);
    const { lead: enriched } = await crmService.upsertInboundLead(ORG_A, {
      external_source: 'WHATSAPP_TWILIO',
      external_id: 'whatsapp:+553',
      source_channel: 'WHATSAPP',
      product_interest: 'vaso polipapel',
      intent: 'RFQ',
      qualification: 'MEDIUM',
    });
    expect(enriched.owner_profile_id).toBe('human-owner');
    expect(enriched.next_action).toBe('Llamar mañana');
    // qualification solo upgrade
    expect(enriched.qualification).toBe('MEDIUM');
    const { lead: downgradeAttempt } = await crmService.upsertInboundLead(ORG_A, {
      external_source: 'WHATSAPP_TWILIO',
      external_id: 'whatsapp:+553',
      source_channel: 'WHATSAPP',
      intent: 'OTHER',
      qualification: 'LOW',
    });
    expect(downgradeAttempt.qualification).toBe('MEDIUM');
  });

  it('pipeline persiste y Lead360 trae timeline', async () => {
    const { lead } = await crmService.upsertInboundLead(ORG_A, {
      external_source: 'WHATSAPP_TWILIO',
      external_id: 'whatsapp:+554',
      source_channel: 'WHATSAPP',
      product_interest: 'vaso polipapel',
      capacity: '12 oz',
      estimated_volume: 500000,
      volume_period: 'MONTHLY',
      destination_city: 'Curitiba',
      destination_country: 'BR',
      intent: 'RFQ',
      qualification: 'HIGH',
    });
    const opp = await crmService.createOpportunityFromLead(ORG_A, lead.id, { stage: 'CALIFICADO' });
    await crmService.changeOpportunityStage(ORG_A, opp.id, 'COTIZACIÓN', { actor: 'HUMAN' });
    const view = await crmService.getLead360(ORG_A, lead.id);
    expect(view?.opportunities[0]?.stage).toBe('COTIZACIÓN');
    expect(view?.activities.length).toBeGreaterThan(0);
    expect(view?.lead.id).toBe(lead.id);
  });
});
