import { describe, it, expect, beforeEach } from 'vitest';
import { resetCrmMemory, crmRepository } from '@/lib/crm/repository';
import { crmService, __resetProfileBindings } from '@/lib/crm/service';
import { purchaseService } from '@/lib/crm/purchase-service';
import { analyzeAll, median } from '@/lib/crm/purchase-analytics';
import { matchCompany, matchProduct, normalizeName, purchaseFingerprint } from '@/lib/crm/purchase-import';

const ORG = '00000000-0000-0000-0000-000000000001';
const ORG_B = '00000000-0000-0000-0000-0000000000b2';

async function company(name: string, tax?: string): Promise<string> {
  const c = await crmRepository.createCompany({
    organization_id: ORG,
    name,
    legal_name: null,
    tax_id: tax ?? null,
    external_id: null,
    country_code: 'BR',
    city: null,
    website: null,
    phone: null,
    email: null,
    source: 'MANUAL',
    notes: null,
    owner_profile_id: null,
    lifecycle_stage: 'PROSPECT',
  });
  return c.id;
}

async function seedPurchases(companyId: string, sku: string, dates: string[], qty = 500000): Promise<void> {
  await purchaseService.commitImport(ORG, {
    rows: dates.map((purchase_date, i) => ({
      company_id: companyId,
      purchase_date,
      sku,
      product_name: `Prod ${sku}`,
      quantity: qty,
      external_document_id: `DOC-${sku}-${i}`,
      line_number: 1,
    })),
  });
}

beforeEach(() => {
  resetCrmMemory();
  __resetProfileBindings();
});

describe('import idempotente', () => {
  it('reimportar no duplica (doc+línea y fingerprint)', async () => {
    const id = await company('ACME Brasil');
    const rows = [
      { company_id: id, purchase_date: '2026-09-08', sku: 'VP12', product_name: 'Vaso 12', quantity: 500000, external_document_id: 'NF-1', line_number: 1 },
      { company_id: id, purchase_date: '2026-09-08', sku: 'VP12', product_name: 'Vaso 12', quantity: 1000 },
    ];
    const r1 = await purchaseService.commitImport(ORG, { rows });
    expect(r1.inserted).toBe(2);
    const r2 = await purchaseService.commitImport(ORG, { rows });
    expect(r2.inserted).toBe(0);
    expect(r2.duplicates).toBe(2);
    expect(await crmRepository.listPurchases(ORG, id)).toHaveLength(2);
  });

  it('tenant isolation: org B no ve compras de org A', async () => {
    const id = await company('ACME Brasil');
    await purchaseService.commitImport(ORG, {
      rows: [{ company_id: id, purchase_date: '2026-09-08', sku: 'VP12', product_name: 'Vaso', quantity: 10 }],
    });
    expect(await crmRepository.listPurchases(ORG_B)).toHaveLength(0);
    await expect(purchaseService.getConsumption(ORG_B, id)).rejects.toThrow('CROSS_TENANT_REFERENCE');
  });
});

describe('matching', () => {
  it('tres variantes de nombre matchean un solo cliente', async () => {
    const id = await company('ACME S.A.', '12.345.678/0001-00');
    const companies = await crmRepository.listCompanies(ORG);
    const refs = companies.map((c) => ({ id: c.id, name: c.name, legal_name: c.legal_name, tax_id: c.tax_id, external_id: c.external_id ?? null }));
    for (const v of ['ACME SA', 'Acme S.A.', 'ACME S.A']) {
      expect(normalizeName(v)).toBe(normalizeName('ACME SA'));
      expect(matchCompany({ cliente: v }, refs, []).company_id).toBe(id);
    }
    expect(matchCompany({ cliente: 'ACME SA', tax_id: '12.345.678/0001-00' }, refs, []).company_id).toBe(id);
  });

  it('producto: SKU exacto gana; alias guardado se reutiliza', async () => {
    const skus = [{ sku: 'VP12-BL', name: 'Vaso Polipapel 12 oz', product_id: null }];
    expect(matchProduct({ producto: 'vp12-bl' }, skus, []).sku).toBe('VP12-BL');
    await crmRepository.saveProductAlias(ORG, normalizeName('vaso grande azul'), 'VP12-BL');
    const aliases = await crmRepository.listProductAliases(ORG);
    expect(matchProduct({ producto: 'Vaso Grande Azul' }, skus, aliases).sku).toBe('VP12-BL');
  });

  it('fingerprint estable para misma fila sin documento', () => {
    const a = purchaseFingerprint({ organization_id: ORG, company_id: 'c1', purchase_date: '2026-09-08', document: null, sku: 'VP12', quantity: 500 });
    const b = purchaseFingerprint({ organization_id: ORG, company_id: 'c1', purchase_date: '2026-09-08', document: null, sku: 'VP12', quantity: 500 });
    const c = purchaseFingerprint({ organization_id: ORG, company_id: 'c1', purchase_date: '2026-09-09', document: null, sku: 'VP12', quantity: 500 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('cadencia y estados', () => {
  it('mediana resiste outlier 90 días', () => {
    expect(median([30, 31, 29, 90, 32])).toBe(31);
  });

  it('dos cadencias distintas mismo cliente no se mezclan', async () => {
    const id = await company('ACME Brasil');
    // A: ~31 días (5 compras → 4 intervalos)
    await seedPurchases(id, 'A', ['2026-05-01', '2026-05-31', '2026-07-01', '2026-07-30', '2026-08-31']);
    // B: ~60 días (4 compras → 3 intervalos)
    await seedPurchases(id, 'B', ['2026-04-01', '2026-05-31', '2026-08-01', '2026-09-30']);
    const { stats } = await purchaseService.getConsumption(ORG, id, new Date('2026-10-03T12:00:00Z').getTime());
    const a = stats.find((s) => s.sku === 'A')!;
    const b = stats.find((s) => s.sku === 'B')!;
    expect(a.median_days_between_orders).toBe(31);
    expect(b.median_days_between_orders).toBe(60);
    expect(a.expected_next_purchase_at).toBe('2026-10-01');
    expect(b.expected_next_purchase_at).toBe('2026-11-29');
  });

  it('menos de 3 compras → INSUFFICIENT_DATA', async () => {
    const id = await company('Nuevo Cliente');
    await seedPurchases(id, 'X', ['2026-09-01', '2026-09-10']);
    const { stats } = await purchaseService.getConsumption(ORG, id);
    expect(stats[0].repurchase_status).toBe('INSUFFICIENT_DATA');
    expect(stats[0].expected_next_purchase_at).toBeNull();
  });

  it('CONTACT_SOON y OVERDUE según regla V1', async () => {
    const id = await company('ACME Brasil');
    // cadencia 30d, última 2026-09-08 → esperada 2026-10-08
    await seedPurchases(id, 'VP12', ['2026-07-10', '2026-08-09', '2026-09-08']);
    const soon = await purchaseService.getConsumption(ORG, id, new Date('2026-10-03T12:00:00Z').getTime());
    expect(soon.stats[0].repurchase_status).toBe('CONTACT_SOON');
    const late = await purchaseService.getConsumption(ORG, id, new Date('2026-10-20T12:00:00Z').getTime());
    expect(late.stats[0].repurchase_status).toBe('OVERDUE');
    const early = await purchaseService.getConsumption(ORG, id, new Date('2026-09-15T12:00:00Z').getTime());
    expect(early.stats[0].repurchase_status).toBe('ON_CYCLE');
  });

  it('365d y totales agregan sin mezclar frecuencias', async () => {
    const id = await company('ACME Brasil');
    await seedPurchases(id, 'A', ['2026-05-01', '2026-05-31', '2026-07-01'], 100);
    await seedPurchases(id, 'B', ['2026-09-01', '2026-09-02'], 7);
    const { stats, totals } = await purchaseService.getConsumption(ORG, id, new Date('2026-10-03T12:00:00Z').getTime());
    expect(stats.find((s) => s.sku === 'A')!.total_quantity_365d).toBe(300);
    expect(totals.active_skus).toBe(2);
    expect(totals.last_purchase_date).toBe('2026-09-02');
  });
});

describe('tareas de recompra idempotentes', () => {
  it('crea una vez por ciclo y sube a HIGH en OVERDUE', async () => {
    const owner = 'owner-9';
    const { __registerTestOwner } = await import('@/lib/crm/service');
    __registerTestOwner(ORG, { id: owner, full_name: 'Vendedora' });
    const c = await crmRepository.createCompany({
      organization_id: ORG, name: 'ACME', legal_name: null, tax_id: null, external_id: null,
      country_code: 'BR', city: null, website: null, phone: null, email: null,
      source: 'MANUAL', notes: null, owner_profile_id: owner, lifecycle_stage: 'CUSTOMER',
    });
    await seedPurchases(c.id, 'VP12', ['2026-07-10', '2026-08-09', '2026-09-08']);
    const t1 = await purchaseService.generateTasks(ORG, undefined, new Date('2026-10-03T12:00:00Z').getTime());
    expect(t1.created).toBe(1);
    const t2 = await purchaseService.generateTasks(ORG, undefined, new Date('2026-10-04T12:00:00Z').getTime());
    expect(t2.created).toBe(0);
    expect(t2.skipped).toBe(1);
    const t3 = await purchaseService.generateTasks(ORG, undefined, new Date('2026-10-20T12:00:00Z').getTime());
    expect(t3.bumped).toBe(1);
    const tasks = await crmService.listTasks(ORG);
    expect(tasks.filter((t) => (t.external_key ?? '').startsWith(`repurchase:${c.id}:VP12:`))).toHaveLength(1);
    expect(tasks[0].assigned_to).toBe(owner);
    expect(tasks[0].priority).toBe('HIGH');
  });

  it('sin owner no elige vendedor arbitrario', async () => {
    const c = await crmRepository.createCompany({
      organization_id: ORG, name: 'Sin dueño', legal_name: null, tax_id: null, external_id: null,
      country_code: 'BR', city: null, website: null, phone: null, email: null,
      source: 'MANUAL', notes: null, owner_profile_id: null, lifecycle_stage: 'CUSTOMER',
    });
    await seedPurchases(c.id, 'VP12', ['2026-07-10', '2026-08-09', '2026-09-08']);
    await purchaseService.generateTasks(ORG, undefined, new Date('2026-10-03T12:00:00Z').getTime());
    const tasks = await crmService.listTasks(ORG);
    expect(tasks[0].assigned_to).toBeNull();
  });
});

describe('forecast de recompra', () => {
  it('usa average_order_value y nunca inventa precio', async () => {
    const id = await company('ACME Brasil');
    await purchaseService.commitImport(ORG, {
      rows: [
        { company_id: id, purchase_date: '2026-07-10', sku: 'VP12', product_name: 'Vaso', quantity: 100, total_value: 1000 },
        { company_id: id, purchase_date: '2026-08-09', sku: 'VP12', product_name: 'Vaso', quantity: 100, total_value: 1000 },
        { company_id: id, purchase_date: '2026-09-08', sku: 'VP12', product_name: 'Vaso', quantity: 100, total_value: 1000 },
      ],
    });
    const alerts = await purchaseService.getAlerts(ORG, new Date('2026-10-03T12:00:00Z').getTime());
    expect(alerts[0].expected_value).toBe(1000);
    expect(alerts[0].average_order_quantity).toBe(100);
  });
});

describe('analyzeAll separa cliente+SKU', () => {
  it('dos clientes mismo SKU calculan independiente', () => {
    const rows = [
      { company_id: 'c1', sku: 'A', product_name: 'A', purchase_date: '2026-05-01', quantity: 10 },
      { company_id: 'c1', sku: 'A', product_name: 'A', purchase_date: '2026-05-31', quantity: 10 },
      { company_id: 'c1', sku: 'A', product_name: 'A', purchase_date: '2026-06-30', quantity: 10 },
      { company_id: 'c2', sku: 'A', product_name: 'A', purchase_date: '2026-09-01', quantity: 99 },
      { company_id: 'c2', sku: 'A', product_name: 'A', purchase_date: '2026-09-02', quantity: 99 },
      { company_id: 'c2', sku: 'A', product_name: 'A', purchase_date: '2026-09-03', quantity: 99 },
    ];
    const stats = analyzeAll(rows, new Date('2026-10-03T12:00:00Z').getTime());
    expect(stats.find((s) => s.company_id === 'c1')!.median_days_between_orders).toBe(30);
    expect(stats.find((s) => s.company_id === 'c2')!.median_days_between_orders).toBe(1);
  });
});
