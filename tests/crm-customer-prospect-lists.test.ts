import { beforeEach, describe, expect, it } from 'vitest';
import { crmRepository, resetCrmMemory } from '@/lib/crm/repository';
import { commitAccountList, type AccountImportRow } from '@/lib/crm/account-import';
import { purchaseService } from '@/lib/crm/purchase-service';

const ORG = '00000000-0000-0000-0000-00000000aa01';

function row(index: number, companyName: string): AccountImportRow {
  return {
    index,
    company_name: companyName,
    contact_name: null,
    phone: null,
    email: null,
    country_code: 'PY',
    city: 'Asunción',
    tax_id: null,
    website: null,
    errors: [],
  };
}

beforeEach(() => resetCrmMemory());

describe('CRM current vs potential customers', () => {
  it('does not downgrade a current customer when it appears in the potential list', async () => {
    await commitAccountList(ORG, { lifecycleStage: 'CUSTOMER', rows: [row(0, 'Cliente A')] });
    const second = await commitAccountList(ORG, { lifecycleStage: 'PROSPECT', rows: [row(0, 'Cliente A')] });

    expect(second.keptCustomers).toBe(1);
    const company = (await crmRepository.listCompanies(ORG)).find((c) => c.name === 'Cliente A');
    expect(company?.lifecycle_stage).toBe('CUSTOMER');
  });

  it('purchase history never turns a potential customer into a current customer', async () => {
    await commitAccountList(ORG, { lifecycleStage: 'PROSPECT', rows: [row(0, 'Potencial A')] });
    const company = (await crmRepository.listCompanies(ORG)).find((c) => c.name === 'Potencial A')!;

    await purchaseService.commitImport(ORG, {
      rows: [
        { company_id: company.id, purchase_date: '2026-07-01', sku: 'CUP-12OZ-SW', product_name: 'Vaso 12 oz', quantity: 10000 },
        { company_id: company.id, purchase_date: '2026-08-01', sku: 'CUP-12OZ-SW', product_name: 'Vaso 12 oz', quantity: 10000 },
        { company_id: company.id, purchase_date: '2026-09-01', sku: 'CUP-12OZ-SW', product_name: 'Vaso 12 oz', quantity: 10000 },
      ],
    });

    expect((await crmRepository.getCompany(company.id, ORG))?.lifecycle_stage).toBe('PROSPECT');
  });

  it('purchase alerts are generated only for potential customers', async () => {
    await commitAccountList(ORG, { lifecycleStage: 'PROSPECT', rows: [row(0, 'Potencial A')] });
    await commitAccountList(ORG, { lifecycleStage: 'CUSTOMER', rows: [row(1, 'Actual B')] });

    const companies = await crmRepository.listCompanies(ORG);
    const potential = companies.find((c) => c.name === 'Potencial A')!;
    const current = companies.find((c) => c.name === 'Actual B')!;

    await purchaseService.commitImport(ORG, {
      rows: [potential, current].flatMap((company) => [
        { company_id: company.id, purchase_date: '2026-07-01', sku: 'CUP-12OZ-SW', product_name: 'Vaso 12 oz', quantity: 10000 },
        { company_id: company.id, purchase_date: '2026-08-01', sku: 'CUP-12OZ-SW', product_name: 'Vaso 12 oz', quantity: 10000 },
        { company_id: company.id, purchase_date: '2026-09-01', sku: 'CUP-12OZ-SW', product_name: 'Vaso 12 oz', quantity: 10000 },
      ]),
    });

    const alerts = await purchaseService.getAlerts(ORG, Date.UTC(2026, 9, 5));
    expect(alerts.length).toBeGreaterThan(0);
    expect(new Set(alerts.map((a) => a.company_id))).toEqual(new Set([potential.id]));
  });
});
