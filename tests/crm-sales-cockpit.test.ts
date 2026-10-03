import { describe, it, expect, beforeEach } from 'vitest';
import { resetCrmMemory } from '@/lib/crm/repository';
import { crmService, __resetProfileBindings, __registerTestOwner } from '@/lib/crm/service';
import { opportunityProbability } from '@/lib/crm/types';

const ORG_A = '00000000-0000-0000-0000-0000000000a1';
const ORG_B = '00000000-0000-0000-0000-0000000000b2';

const LEAD_BASE = {
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
  estimated_volume: 100000,
  volume_period: 'MONTHLY' as const,
  destination_city: 'Curitiba',
  destination_state: null,
  destination_country: 'BR',
  intent: 'RFQ' as const,
  qualification: 'HIGH' as const,
  status: 'NUEVO' as const,
  owner_profile_id: null,
  next_action: null,
  next_action_at: null,
};

beforeEach(() => {
  resetCrmMemory();
  __resetProfileBindings();
});

describe('Owners tenant-safe', () => {
  it('lista solo perfiles de la organización', async () => {
    __registerTestOwner(ORG_A, { id: 'owner-a1', full_name: 'Marcelo Echauri', email: 'm@x.com' });
    __registerTestOwner(ORG_B, { id: 'owner-b1', full_name: 'Otro Vendedor', email: 'o@x.com' });
    const owners = await crmService.listOwners(ORG_A);
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ id: 'owner-a1', full_name: 'Marcelo Echauri' });
  });

  it('tareas muestran responsable por nombre via owners', async () => {
    __registerTestOwner(ORG_A, { id: 'owner-a2', full_name: 'Ana López' });
    const task = await crmService.createTask(ORG_A, { title: 'Llamar', source: 'CRM', assigned_to: 'owner-a2', task_type: 'CALL' });
    const owners = await crmService.listOwners(ORG_A);
    const name = owners.find((o) => o.id === task.assigned_to)?.full_name;
    expect(name).toBe('Ana López');
  });
});

describe('Sales dashboard monetario', () => {
  it('suma valores por etapa y calcula forecast ponderado', async () => {
    const l1 = await crmService.createLeadManual(ORG_A, { ...LEAD_BASE });
    const l2 = await crmService.createLeadManual(ORG_A, { ...LEAD_BASE, destination_country: 'PY', destination_city: 'Asunción' });
    const o1 = await crmService.createOpportunityFromLead(ORG_A, l1.id, { stage: 'COTIZACIÓN' });
    await crmService.updateOpportunity(o1.id, ORG_A, { estimated_value: 10000, probability: 60 });
    const o2 = await crmService.createOpportunityFromLead(ORG_A, l2.id, { stage: 'NEGOCIACIÓN' });
    await crmService.updateOpportunity(o2.id, ORG_A, { estimated_value: 20000 });

    const dash = await crmService.getSalesDashboard(ORG_A);
    expect(dash.pipeline_open_count).toBe(2);
    expect(dash.pipeline_open_value).toBe(30000);
    expect(dash.quotes_count).toBe(1);
    expect(dash.quotes_value).toBe(10000);
    expect(dash.negotiation_count).toBe(1);
    expect(dash.negotiation_value).toBe(20000);
    // 10000*60% + 20000*80%(default NEGOCIACIÓN) = 6000 + 16000
    expect(dash.weighted_forecast).toBe(22000);
    expect(dash.stage_breakdown.find((s) => s.stage === 'COTIZACIÓN')).toMatchObject({ count: 1, value: 10000 });
    expect(dash.market_breakdown.find((m) => m.market === 'BR')?.count).toBe(1);
    expect(dash.market_breakdown.find((m) => m.market === 'PY')?.count).toBe(1);
  });

  it('sin valores cargados muestra cero, no inventa', async () => {
    const lead = await crmService.createLeadManual(ORG_A, { ...LEAD_BASE });
    await crmService.createOpportunityFromLead(ORG_A, lead.id, { stage: 'NUEVO' });
    const dash = await crmService.getSalesDashboard(ORG_A);
    expect(dash.pipeline_open_count).toBe(1);
    expect(dash.pipeline_open_value).toBe(0);
    expect(dash.weighted_forecast).toBe(0);
  });

  it('ganadas del mes y ganadas vs perdidas', async () => {
    const lead = await crmService.createLeadManual(ORG_A, { ...LEAD_BASE });
    const opp = await crmService.createOpportunityFromLead(ORG_A, lead.id, { stage: 'NEGOCIACIÓN' });
    await crmService.updateOpportunity(opp.id, ORG_A, { estimated_value: 5000 });
    await crmService.changeOpportunityStage(ORG_A, opp.id, 'GANADO', { actor: 'HUMAN' });
    const dash = await crmService.getSalesDashboard(ORG_A);
    expect(dash.won_month_count).toBe(1);
    expect(dash.won_month_value).toBe(5000);
    expect(dash.won_count).toBe(1);
  });
});

describe('probability defaults', () => {
  it('usa defaults por etapa cuando no hay probability', () => {
    expect(opportunityProbability('NUEVO', null)).toBe(10);
    expect(opportunityProbability('COTIZACIÓN', null)).toBe(60);
    expect(opportunityProbability('NEGOCIACIÓN', null)).toBe(80);
    expect(opportunityProbability('NUEVO', 55)).toBe(55);
    expect(opportunityProbability('NUEVO', 150)).toBe(100);
  });
});

describe('lifecycle / expected_close / task_type', () => {
  it('company acepta lifecycle_stage', async () => {
    const c = await crmService.createCompany(ORG_A, { name: 'ACME Brasil', lifecycle_stage: 'PROSPECT' } as never);
    expect(c.lifecycle_stage).toBe('PROSPECT');
  });

  it('opportunity acepta expected_close_at y probability', async () => {
    const lead = await crmService.createLeadManual(ORG_A, { ...LEAD_BASE });
    const opp = await crmService.createOpportunityManual(ORG_A, {
      company_id: null,
      contact_id: null,
      lead_id: lead.id,
      title: 'Opp fechas',
      stage: 'CALIFICADO',
      product_interest: null,
      sku: null,
      capacity: null,
      material: null,
      printing: null,
      estimated_volume: null,
      volume_period: null,
      estimated_value: 18500,
      currency: 'USD',
      destination_city: null,
      destination_state: null,
      destination_country: null,
      owner_profile_id: null,
      next_action: 'Llamar comprador',
      next_action_at: new Date(Date.now() + 86400000).toISOString(),
      expected_close_at: '2026-10-15',
      probability: 80,
      won_at: null,
      lost_at: null,
      lost_reason: null,
    });
    expect(opp.expected_close_at).toBe('2026-10-15');
    expect(opp.probability).toBe(80);
  });

  it('task acepta task_type y se filtra por assignee', async () => {
    __registerTestOwner(ORG_A, { id: 'owner-t1', full_name: 'Vendedor Uno' });
    const t = await crmService.createTask(ORG_A, { title: 'WhatsApper', source: 'CRM', task_type: 'WHATSAPP', assigned_to: 'owner-t1' });
    expect(t.task_type).toBe('WHATSAPP');
    const all = await crmService.listTasks(ORG_A);
    expect(all.filter((x) => x.assigned_to === 'owner-t1')).toHaveLength(1);
  });

  it('attention incluye tareas vencidas y opps sin próxima acción', async () => {
    const lead = await crmService.createLeadManual(ORG_A, { ...LEAD_BASE });
    await crmService.createOpportunityFromLead(ORG_A, lead.id, { stage: 'CALIFICADO' });
    await crmService.createTask(ORG_A, { title: 'Vencida', source: 'CRM', due_at: new Date(Date.now() - 86400000).toISOString() });
    const dash = await crmService.getSalesDashboard(ORG_A);
    expect(dash.attention_items.some((a) => a.kind === 'OVERDUE_TASK')).toBe(true);
    expect(dash.attention_items.some((a) => a.kind === 'MISSING_NEXT_ACTION')).toBe(true);
  });
});
