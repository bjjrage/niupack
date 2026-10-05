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

  it('enforces tenant isolation across organizations', async () => {
    const ORG_B = '00000000-0000-0000-0000-00000000bb02';
    await commitAccountList(ORG, { lifecycleStage: 'CUSTOMER', rows: [row(0, 'Tenant A Co')] });
    await commitAccountList(ORG_B, { lifecycleStage: 'PROSPECT', rows: [row(0, 'Tenant B Co')] });

    const orgACompanies = await crmRepository.listCompanies(ORG);
    const orgBCompanies = await crmRepository.listCompanies(ORG_B);

    expect(orgACompanies.map((c) => c.name)).toEqual(['Tenant A Co']);
    expect(orgBCompanies.map((c) => c.name)).toEqual(['Tenant B Co']);
    expect(orgACompanies.some((c) => c.name === 'Tenant B Co')).toBe(false);
  });

  it('accepts CSV and XLSX buffers for preview', async () => {
    const { previewAccountList } = await import('@/lib/crm/account-import');
    const XLSX = await import('xlsx');

    // Test CSV preview with deterministic mapping
    const csvContent = 'Empresa,Contacto,Email,Telefono\nAcme Corp,Carlos Ruiz,carlos@acme.com,+595981111222\n';
    const csvBuffer = Buffer.from(csvContent, 'utf-8');
    const csvPreview = await previewAccountList({
      buffer: csvBuffer,
      filename: 'leads.csv',
      overrideMapping: { company_name: 0, contact_name: 1, email: 2, phone: 3 },
    });

    expect(csvPreview.columns).toContain('Empresa');
    expect(csvPreview.rows).toHaveLength(1);
    expect(csvPreview.rows[0].company_name).toBe('Acme Corp');
    expect(csvPreview.rows[0].contact_name).toBe('Carlos Ruiz');
    expect(csvPreview.rows[0].email).toBe('carlos@acme.com');
    expect(csvPreview.rows[0].errors).toHaveLength(0);

    // Test XLSX preview with deterministic mapping
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Empresa', 'Contacto', 'Email', 'Telefono'],
      ['Beta SRL', 'Ana Gomez', 'ana@beta.com', '+595982333444'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const xlsxPreview = await previewAccountList({
      buffer: xlsxBuffer,
      filename: 'leads.xlsx',
      overrideMapping: { company_name: 0, contact_name: 1, email: 2, phone: 3 },
    });

    expect(xlsxPreview.rows).toHaveLength(1);
    expect(xlsxPreview.rows[0].company_name).toBe('Beta SRL');
    expect(xlsxPreview.rows[0].errors).toHaveLength(0);
  });

  it('handles invalid rows gracefully without breaking valid ones and reports errors', async () => {
    const mixedRows: AccountImportRow[] = [
      row(0, 'Empresa Valida Uno'),
      {
        index: 1,
        company_name: '', // Invalid: missing company name
        contact_name: null,
        phone: null,
        email: 'invalid-email',
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
        errors: ['Empresa requerida', 'Email inválido'],
      },
      row(2, 'Empresa Valida Dos'),
    ];

    const result = await commitAccountList(ORG, { lifecycleStage: 'PROSPECT', rows: mixedRows });

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(1);

    const companies = await crmRepository.listCompanies(ORG);
    expect(companies.map((c) => c.name).sort()).toEqual(['Empresa Valida Dos', 'Empresa Valida Uno']);
  });
});
