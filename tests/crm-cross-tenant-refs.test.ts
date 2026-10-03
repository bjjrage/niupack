import { describe, it, expect, beforeEach } from 'vitest';
import { resetCrmMemory, crmRepository } from '@/lib/crm/repository';
import { crmService, __resetProfileBindings } from '@/lib/crm/service';
import { resetBotMemory } from '@/lib/niupackbot/repository';

const ORG_A = '00000000-0000-0000-0000-0000000000a1';
const ORG_B = '00000000-0000-0000-0000-0000000000b2';

beforeEach(() => {
  resetCrmMemory();
  resetBotMemory();
  __resetProfileBindings();
});

describe('Cross-tenant FK validation', () => {
  it('forged company_id cross-tenant => reject', async () => {
    const compB = await crmRepository.createCompany({
      organization_id: ORG_B,
      name: 'Empresa B',
      legal_name: null,
      tax_id: null,
      country_code: 'BR',
      city: null,
      website: null,
      phone: null,
      email: null,
      source: 'MANUAL',
      notes: null,
      owner_profile_id: null,
    });
    await expect(
      crmService.createContact(ORG_A, { full_name: 'Ana', company_id: compB.id }),
    ).rejects.toThrow('CROSS_TENANT_REFERENCE');
    await expect(
      crmService.createLeadManual(ORG_A, {
        company_id: compB.id,
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
      }),
    ).rejects.toThrow('CROSS_TENANT_REFERENCE');
  });

  it('forged contact_id cross-tenant => reject', async () => {
    const contactB = await crmRepository.createContact({
      organization_id: ORG_B,
      company_id: null,
      full_name: 'Contacto B',
      job_title: null,
      phone: null,
      whatsapp_phone: '+551100000099',
      email: null,
      language: null,
      country_code: 'BR',
      source: 'MANUAL',
      owner_profile_id: null,
    });
    await expect(
      crmService.createLeadManual(ORG_A, {
        company_id: null,
        contact_id: contactB.id,
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
      }),
    ).rejects.toThrow('CROSS_TENANT_REFERENCE');

    const leadA = await crmService.createLeadManual(ORG_A, {
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
    await expect(crmService.updateLead(leadA.id, ORG_A, { contact_id: contactB.id } as never)).rejects.toThrow(
      'CROSS_TENANT_REFERENCE',
    );
  });

  it('forged lead_id / opportunity_id cross-tenant => reject', async () => {
    const { lead: leadB } = await crmService.upsertInboundLead(ORG_B, {
      external_source: 'WHATSAPP_TWILIO',
      external_id: 'whatsapp:+559900000001',
      source_channel: 'WHATSAPP',
      intent: 'RFQ',
      qualification: 'HIGH',
    });
    await expect(crmService.createOpportunityFromLead(ORG_A, leadB.id)).rejects.toThrow();
    await expect(
      crmService.createOpportunityManual(ORG_A, {
        company_id: null,
        contact_id: null,
        lead_id: leadB.id,
        title: 'Opp forjada',
        stage: 'NUEVO',
        product_interest: null,
        sku: null,
        capacity: null,
        material: null,
        printing: null,
        estimated_volume: null,
        volume_period: null,
        estimated_value: null,
        currency: 'USD',
        destination_city: null,
        destination_state: null,
        destination_country: null,
        owner_profile_id: null,
        next_action: null,
        next_action_at: null,
        won_at: null,
        lost_at: null,
        lost_reason: null,
      }),
    ).rejects.toThrow('CROSS_TENANT_REFERENCE');

    const { lead: leadA } = await crmService.upsertInboundLead(ORG_A, {
      external_source: 'WHATSAPP_TWILIO',
      external_id: 'whatsapp:+559900000002',
      source_channel: 'WHATSAPP',
      intent: 'RFQ',
      qualification: 'HIGH',
    });
    const oppA = await crmService.createOpportunityFromLead(ORG_A, leadA.id);
    await expect(crmService.changeOpportunityStage(ORG_B, oppA.id, 'COTIZACIÓN', { actor: 'HUMAN' })).rejects.toThrow();
    await expect(
      crmService.createTask(ORG_B, { title: 'T forjada', lead_id: leadA.id, source: 'CRM' }),
    ).rejects.toThrow('CROSS_TENANT_REFERENCE');
  });

  it('forged owner_profile_id / assigned_to cross-tenant => reject', async () => {
    const profileX = '11111111-1111-1111-1111-111111111111';
    // Vincular perfil X a ORG_B primero.
    await crmService.createCompany(ORG_B, { name: 'B Co', owner_profile_id: profileX } as never);
    await expect(crmService.createCompany(ORG_A, { name: 'A Co', owner_profile_id: profileX } as never)).rejects.toThrow(
      'CROSS_TENANT_REFERENCE',
    );

    const profileY = '22222222-2222-2222-2222-222222222222';
    await crmService.createTask(ORG_A, { title: 'T A', source: 'CRM', assigned_to: profileY });
    await expect(crmService.createTask(ORG_B, { title: 'T B', source: 'CRM', assigned_to: profileY })).rejects.toThrow(
      'CROSS_TENANT_REFERENCE',
    );
  });

  it('referencias válidas mismo tenant pasan', async () => {
    const comp = await crmService.createCompany(ORG_A, { name: 'A Co' } as never);
    const contact = await crmService.createContact(ORG_A, { full_name: 'Ana A', company_id: comp.id });
    const lead = await crmService.createLeadManual(ORG_A, {
      company_id: comp.id,
      contact_id: contact.id,
      source: 'MANUAL',
      source_channel: 'WEB',
      external_source: null,
      external_id: null,
      country_code: 'BR',
      product_interest: 'vaso polipapel',
      capacity: '12 oz',
      material: null,
      printing: null,
      estimated_volume: 10000,
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
    const opp = await crmService.createOpportunityFromLead(ORG_A, lead.id);
    const task = await crmService.createTask(ORG_A, { title: 'Seguir', lead_id: lead.id, opportunity_id: opp.id, company_id: comp.id, source: 'CRM' });
    expect(task.lead_id).toBe(lead.id);
  });
});
