import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { crmRepository, resetCrmMemory } from '@/lib/crm/repository';
import { repository as dbRepo } from '@/lib/db/repository';
import { purchaseService } from '@/lib/crm/purchase-service';
import { OpenAIService } from '@/lib/openai/openai-service';
import {
  createIngestionJob,
  getIngestionCockpitSummary,
  resolveProductGroup,
  cancelIngestionJob,
} from '@/lib/crm/ingestion/staging';
import {
  commitIngestionJobBatch,
  commitEntireIngestionJob,
} from '@/lib/crm/ingestion/commit';
import { redactCellValue } from '@/lib/crm/ingestion/schema-inference';

const ORG_A = '00000000-0000-0000-0000-00000000aa01';
const ORG_B = '00000000-0000-0000-0000-00000000bb02';

function makeXlsx(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function mockOpenAI(responseJson: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (typeof url === 'string' && url.includes('api.openai.com')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(responseJson) } }],
        }),
      } as unknown as Response;
    }
    return { ok: false } as unknown as Response;
  });
}

beforeEach(() => {
  resetCrmMemory();
  OpenAIService.setApiKey('test-key-mock-commercial-12345');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('COMMERCIAL DATA INGESTION — 28 Tests Obligatorios', () => {
  // 1. ACCOUNT_LIST: 100 empresas -> crea 100 cuentas
  it('1. ACCOUNT_LIST: 100 empresas -> crea 100 cuentas', async () => {
    const rows: unknown[][] = [['Empresa', 'Contacto', 'Teléfono']];
    for (let i = 1; i <= 100; i++) {
      rows.push([`Empresa Test ${i}`, `Contacto ${i}`, `+595981000${i}`]);
    }
    const buffer = makeXlsx({ Hoja1: rows });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'cuentas100.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideDatasetType: 'ACCOUNT_LIST',
      overrideMapping: { company_name: 0, contact_name: 1, phone: 2 },
    });

    expect(summary.total_movements).toBe(100);
    const commit = await commitEntireIngestionJob(ORG_A, summary.job_id);

    expect(commit.inserted_companies).toBe(100);
    const inCrm = await crmRepository.listCompanies(ORG_A);
    expect(inCrm).toHaveLength(100);
    expect(inCrm[0].lifecycle_stage).toBe('CUSTOMER');
  });

  // 2. TRANSACTION_HISTORY: 1483 movimientos, 127 clientes únicos -> 127 cuentas + 1483 staging rows
  it('2. TRANSACTION_HISTORY: 1483 movimientos, 127 clientes únicos -> 127 cuentas + 1483 staging rows', async () => {
    const rows: unknown[][] = [['Cliente', 'Fecha', 'SKU', 'Cantidad', 'Factura']];
    for (let i = 1; i <= 1483; i++) {
      const clientIdx = (i % 127) + 1;
      rows.push([`Cliente Unico ${clientIdx}`, '2026-08-01', 'CUP-8OZ-SW', '1000', `F-${i}`]);
    }
    const buffer = makeXlsx({ Ventas: rows });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'transaccional1483.xlsx',
      targetLifecycle: 'PROSPECT',
      overrideDatasetType: 'TRANSACTION_HISTORY',
      overrideMapping: {
        customer_name: 0,
        purchase_date: 1,
        sku: 2,
        product_description: 2,
        quantity: 3,
        document_number: 4,
      },
    });

    expect(summary.total_movements).toBe(1483);
    expect(summary.unique_clients_count).toBe(127);
    expect(summary.resolved_cups_count).toBe(1483);

    const commit = await commitEntireIngestionJob(ORG_A, summary.job_id);
    expect(commit.inserted_companies).toBe(127);
    expect(commit.inserted_purchases).toBe(1483);

    const companies = await crmRepository.listCompanies(ORG_A);
    expect(companies).toHaveLength(127);
    const purchases = await crmRepository.listPurchases(ORG_A);
    expect(purchases).toHaveLength(1483);
  });

  // 3. MIXED_TRANSACTIONAL_EXPORT: contacto + transacciones -> cuentas + contactos + historial
  it('3. MIXED_TRANSACTIONAL_EXPORT: contacto + transacciones -> cuentas + contactos + historial', async () => {
    const buffer = makeXlsx({
      ERP: [
        ['Empresa', 'Contacto', 'Email', 'Telefono', 'Fecha Pedido', 'Vaso', 'Cant'],
        ['Distribuidora Norte', 'Lucas Gomez', 'lucas@norte.com', '+595981112233', '2026-07-10', 'CUP-8OZ-SW', '5000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'erp_mixed.xlsx',
      targetLifecycle: 'PROSPECT',
      overrideDatasetType: 'MIXED_TRANSACTIONAL_EXPORT',
      overrideMapping: {
        customer_name: 0,
        contact_name: 1,
        email: 2,
        phone: 3,
        purchase_date: 4,
        sku: 5,
        product_description: 5,
        quantity: 6,
      },
    });

    expect(summary.dataset_type).toBe('MIXED_TRANSACTIONAL_EXPORT');
    const commit = await commitEntireIngestionJob(ORG_A, summary.job_id);

    expect(commit.inserted_companies).toBe(1);
    expect(commit.inserted_purchases).toBe(1);

    const companies = await crmRepository.listCompanies(ORG_A);
    expect(companies[0].name).toBe('Distribuidora Norte');

    const contacts = await crmRepository.listContacts(ORG_A);
    expect(contacts[0].full_name).toBe('Lucas Gomez');
    expect(contacts[0].email).toBe('lucas@norte.com');
  });

  // 4. LLM detecta sheet correcta
  it('4. LLM detecta sheet correcta', async () => {
    const buffer = makeXlsx({
      Instrucciones: [['Por favor ver pestaña de ventas']],
      VentasOficiales: [
        ['Cliente', 'Fecha', 'Producto', 'Cantidad'],
        ['Bar Central', '2026-08-01', 'CUP-8OZ-SW', '2000'],
      ],
    });

    mockOpenAI({
      dataset_type: 'TRANSACTION_HISTORY',
      sheet_name: 'VentasOficiales',
      header_row_index: 0,
      mapping: { customer_name: 0, purchase_date: 1, product_description: 2, quantity: 3 },
    });

    const summary = await createIngestionJob(ORG_A, { buffer, filename: 'sheets.xlsx', targetLifecycle: 'CUSTOMER' });
    expect(summary.sheet_name).toBe('VentasOficiales');
    expect(summary.llm_inferred).toBe(true);
  });

  // 5. LLM detecta header row real
  it('5. LLM detecta header row real', async () => {
    const buffer = makeXlsx({
      Data: [
        ['REPORTE OFICIAL 2026'],
        ['CONFIDENCIAL'],
        ['Cliente', 'Fecha', 'Producto', 'Cantidad'],
        ['Hotel Sol', '2026-08-01', 'CUP-8OZ-SW', '3000'],
      ],
    });

    mockOpenAI({
      dataset_type: 'TRANSACTION_HISTORY',
      sheet_name: 'Data',
      header_row_index: 2,
      mapping: { customer_name: 0, purchase_date: 1, product_description: 2, quantity: 3 },
    });

    const summary = await createIngestionJob(ORG_A, { buffer, filename: 'header.xlsx', targetLifecycle: 'CUSTOMER' });
    expect(summary.header_row_index).toBe(2);
    expect(summary.total_movements).toBe(1);
  });

  // 6. LLM detecta mapping
  it('6. LLM detecta mapping', async () => {
    const buffer = makeXlsx({
      Hoja1: [
        ['Razón Social', 'Día', 'Ítem', 'Unidades'],
        ['Café Expreso', '2026-08-02', 'CUP-8OZ-SW', '1500'],
      ],
    });

    mockOpenAI({
      dataset_type: 'TRANSACTION_HISTORY',
      sheet_name: 'Hoja1',
      header_row_index: 0,
      mapping: { customer_name: 0, purchase_date: 1, product_description: 2, quantity: 3 },
    });

    const summary = await createIngestionJob(ORG_A, { buffer, filename: 'map.xlsx', targetLifecycle: 'CUSTOMER' });
    expect(summary.mapping.customer_name).toBe(0);
    expect(summary.mapping.purchase_date).toBe(1);
    expect(summary.mapping.product_description).toBe(2);
    expect(summary.mapping.quantity).toBe(3);
  });

  // 7. LLM unavailable: manual mapping funciona
  it('7. LLM unavailable: manual mapping funciona', async () => {
    const buffer = makeXlsx({
      Hoja1: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Empresa X', '2026-08-01', 'CUP-8OZ-SW', '500'],
      ],
    });

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('OPENAI_DOWN'));

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'fallback.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideSheetName: 'Hoja1',
      overrideHeaderRowIndex: 0,
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });

    expect(summary.llm_inferred).toBe(false);
    expect(summary.total_movements).toBe(1);
    expect(summary.status).toBe('READY');
  });

  // 8. PII no se manda cruda a LLM
  it('8. PII no se manda cruda a LLM', () => {
    expect(redactCellValue('juan@empresa.com')).toBe('<EMAIL>');
    expect(redactCellValue('+595981223344')).toBe('<PHONE>');
    expect(redactCellValue('80012345-6')).toBe('<TAX_ID>');
    expect(redactCellValue('https://empresa.com.py')).toBe('<URL>');
    expect(redactCellValue('Vaso Polipapel 8 oz')).toBe('Vaso Polipapel 8 oz');
  });

  // 9. Cliente existente: no duplica empresa
  it('9. Cliente existente: no duplica empresa', async () => {
    await crmRepository.createCompany({
      organization_id: ORG_A,
      name: 'Acme Corp',
      legal_name: null,
      tax_id: '80099988-1',
      external_id: null,
      country_code: 'PY',
      city: null,
      website: null,
      phone: null,
      email: null,
      source: 'MANUAL',
      notes: null,
      owner_profile_id: null,
      lifecycle_stage: 'CUSTOMER',
    });

    const buffer = makeXlsx({
      Ventas: [
        ['Cliente', 'RUC', 'Fecha', 'SKU', 'Cantidad'],
        ['Acme Corp', '80099988-1', '2026-08-01', 'CUP-8OZ-SW', '1000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'dup_client.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, tax_id: 1, purchase_date: 2, sku: 3, quantity: 4 },
    });

    await commitEntireIngestionJob(ORG_A, summary.job_id);

    const companies = await crmRepository.listCompanies(ORG_A);
    expect(companies).toHaveLength(1);
  });

  // 10. CUSTOMER no se degrada a PROSPECT
  it('10. CUSTOMER no se degrada a PROSPECT', async () => {
    const c = await crmRepository.createCompany({
      organization_id: ORG_A,
      name: 'Cliente Vitalicio',
      legal_name: null,
      tax_id: null,
      external_id: null,
      country_code: 'PY',
      city: null,
      website: null,
      phone: null,
      email: null,
      source: 'MANUAL',
      notes: null,
      owner_profile_id: null,
      lifecycle_stage: 'CUSTOMER',
    });

    const buffer = makeXlsx({
      Datos: [
        ['Empresa', 'Fecha', 'SKU', 'Cantidad'],
        ['Cliente Vitalicio', '2026-08-01', 'CUP-8OZ-SW', '1000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'downgrade.xlsx',
      targetLifecycle: 'PROSPECT',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });

    await commitEntireIngestionJob(ORG_A, summary.job_id);

    const updated = await crmRepository.getCompany(c.id, ORG_A);
    expect(updated?.lifecycle_stage).toBe('CUSTOMER');
  });

  // 11. PROSPECT con historial sigue PROSPECT
  it('11. PROSPECT con historial sigue PROSPECT', async () => {
    const c = await crmRepository.createCompany({
      organization_id: ORG_A,
      name: 'Prospecto Prueba',
      legal_name: null,
      tax_id: null,
      external_id: null,
      country_code: 'PY',
      city: null,
      website: null,
      phone: null,
      email: null,
      source: 'MANUAL',
      notes: null,
      owner_profile_id: null,
      lifecycle_stage: 'PROSPECT',
    });

    const buffer = makeXlsx({
      Datos: [
        ['Empresa', 'Fecha', 'SKU', 'Cantidad'],
        ['Prospecto Prueba', '2026-08-01', 'CUP-8OZ-SW', '1000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'prospect_hist.xlsx',
      targetLifecycle: 'PROSPECT',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });

    await commitEntireIngestionJob(ORG_A, summary.job_id);

    const updated = await crmRepository.getCompany(c.id, ORG_A);
    expect(updated?.lifecycle_stage).toBe('PROSPECT');
  });

  // 12. SKU exacto real: resuelve
  it('12. SKU exacto real: resuelve', async () => {
    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Bar A', '2026-08-01', 'CUP-8OZ-SW', '2000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'sku_exacto.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });

    expect(summary.resolved_cups_count).toBe(1);
    expect(summary.unresolved_products_count).toBe(0);
  });

  // 13. Alias SKU: resuelve
  it('13. Alias SKU: resuelve', async () => {
    await crmRepository.saveProductAlias(ORG_A, 'vaso termico 8', 'CUP-8OZ-SW');

    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'Producto', 'Cantidad'],
        ['Bar A', '2026-08-01', 'Vaso Termico 8', '2000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'alias_sku.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, product_description: 2, quantity: 3 },
    });

    expect(summary.resolved_cups_count).toBe(1);
  });

  // 14. Producto desconocido: sku null. Nunca inventado
  it('14. Producto desconocido: sku null. Nunca inventado', async () => {
    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'Producto', 'Cantidad'],
        ['Bar A', '2026-08-01', 'Vaso Misterioso Antiguo 1999', '2000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'prod_desconocido.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, product_description: 2, quantity: 3 },
    });

    expect(summary.unresolved_products_count).toBe(1);
    const rows = await crmRepository.listImportRows(ORG_A, summary.job_id);
    expect(rows[0].sku).toBeNull();
  });

  // 15. Múltiples candidatos: queda pending
  it('15. Múltiples candidatos: queda pending', async () => {
    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'Producto', 'Cantidad'],
        ['Bar A', '2026-08-01', 'Vaso Single Wall', '2000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'candidatos.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, product_description: 2, quantity: 3 },
    });

    expect(summary.unresolved_products_count).toBe(1);
    expect(summary.status).toBe('NEEDS_REVIEW');
  });

  // 16. 327 movimientos mismo product_raw: una sola decisión de alias
  it('16. 327 movimientos mismo product_raw: una sola decisión de alias', async () => {
    const rows: unknown[][] = [['Cliente', 'Fecha', 'Producto', 'Cantidad']];
    for (let i = 0; i < 327; i++) {
      rows.push(['Cliente Regular', '2026-08-01', 'Vaso 8 Onzas Sin Marca', '1000']);
    }
    const buffer = makeXlsx({ Data: rows });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: '327movs.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, product_description: 2, quantity: 3 },
    });

    expect(summary.unresolved_product_groups).toHaveLength(1);
    expect(summary.unresolved_product_groups[0].occurrences).toBe(327);

    const res = await resolveProductGroup(ORG_A, summary.job_id, 'Vaso 8 Onzas Sin Marca', 'CUP-8OZ-SW', true);
    expect(res.updatedRows).toBe(327);

    const updatedSummary = await getIngestionCockpitSummary(ORG_A, summary.job_id);
    expect(updatedSummary?.unresolved_products_count).toBe(0);
    expect(updatedSummary?.status).toBe('READY');

    const aliases = await crmRepository.listProductAliases(ORG_A);
    expect(aliases.some((a) => a.sku === 'CUP-8OZ-SW')).toBe(true);
  });

  // 17. Reimportación: 0 duplicados nuevos
  it('17. Reimportación: 0 duplicados nuevos', async () => {
    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad', 'Factura'],
        ['Cliente Frecuente', '2026-08-01', 'CUP-8OZ-SW', '1000', 'FAC-001'],
      ],
    });

    const s1 = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'reimport.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3, document_number: 4 },
    });
    const c1 = await commitEntireIngestionJob(ORG_A, s1.job_id);
    expect(c1.inserted_purchases).toBe(1);
    expect(c1.duplicate_purchases).toBe(0);

    const s2 = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'reimport.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3, document_number: 4 },
    });
    const c2 = await commitEntireIngestionJob(ORG_A, s2.job_id);
    expect(c2.inserted_purchases).toBe(0);
    expect(c2.duplicate_purchases).toBe(1);

    expect(await crmRepository.listPurchases(ORG_A)).toHaveLength(1);
  });

  // 18. Batch commit: simular fallo intermedio. Reanuda desde punto correcto
  it('18. Batch commit: simular fallo intermedio. Reanuda desde punto correcto', async () => {
    const rows: unknown[][] = [['Cliente', 'Fecha', 'SKU', 'Cantidad', 'Factura']];
    for (let i = 1; i <= 6; i++) {
      rows.push(['Cliente Batch', '2026-08-01', 'CUP-8OZ-SW', '1000', `DOC-${i}`]);
    }
    const buffer = makeXlsx({ Data: rows });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'batch_resume.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3, document_number: 4 },
    });

    // Batch size 3 -> Total 2 batches
    const b0 = await commitIngestionJobBatch(ORG_A, summary.job_id, { batchSize: 3, batchIndex: 0 });
    expect(b0.inserted_purchases).toBe(3);
    expect(b0.status).toBe('COMMITTING');

    // Batch 1 (reanuda y termina)
    const b1 = await commitIngestionJobBatch(ORG_A, summary.job_id, { batchSize: 3, batchIndex: 1 });
    expect(b1.inserted_purchases).toBe(3);
    expect(b1.status).toBe('COMPLETED');

    expect(await crmRepository.listPurchases(ORG_A)).toHaveLength(6);
  });

  // 19. Tenant isolation jobs
  it('19. Tenant isolation jobs', async () => {
    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Empresa Org A', '2026-08-01', 'CUP-8OZ-SW', '1000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'iso_job.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });

    const fromB = await crmRepository.getImportJob(summary.job_id, ORG_B);
    expect(fromB).toBeNull();
  });

  // 20. Tenant isolation rows
  it('20. Tenant isolation rows', async () => {
    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Empresa Org A', '2026-08-01', 'CUP-8OZ-SW', '1000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'iso_rows.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });

    const rowsB = await crmRepository.listImportRows(ORG_B, summary.job_id);
    expect(rowsB).toHaveLength(0);
  });

  // 21. Tenant isolation purchases
  it('21. Tenant isolation purchases', async () => {
    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Empresa Org A', '2026-08-01', 'CUP-8OZ-SW', '1000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'iso_purchases.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });
    await commitEntireIngestionJob(ORG_A, summary.job_id);

    const pB = await crmRepository.listPurchases(ORG_B);
    expect(pB).toHaveLength(0);
  });

  // 22. Cliente × SKU separado
  it('22. Cliente × SKU separado', async () => {
    const c = await crmRepository.createCompany({
      organization_id: ORG_A,
      name: 'Cliente Multi SKU',
      legal_name: null,
      tax_id: null,
      external_id: null,
      country_code: 'PY',
      city: null,
      website: null,
      phone: null,
      email: null,
      source: 'MANUAL',
      notes: null,
      owner_profile_id: null,
      lifecycle_stage: 'CUSTOMER',
    });

    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Cliente Multi SKU', '2026-06-01', 'CUP-8OZ-SW', '1000'],
        ['Cliente Multi SKU', '2026-07-01', 'CUP-8OZ-SW', '1000'],
        ['Cliente Multi SKU', '2026-08-01', 'CUP-8OZ-SW', '1000'],
        ['Cliente Multi SKU', '2026-05-01', 'CUP-16OZ-SW', '5000'],
        ['Cliente Multi SKU', '2026-07-01', 'CUP-16OZ-SW', '5000'],
        ['Cliente Multi SKU', '2026-08-30', 'CUP-16OZ-SW', '5000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'multi_sku.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });
    await commitEntireIngestionJob(ORG_A, summary.job_id);

    const consumption = await purchaseService.getConsumption(ORG_A, c.id);
    expect(consumption.stats).toHaveLength(2);
    const s8 = consumption.stats.find((s) => s.sku === 'CUP-8OZ-SW')!;
    const s16 = consumption.stats.find((s) => s.sku === 'CUP-16OZ-SW')!;
    expect(s8.median_days_between_orders).toBe(31);
    expect(s16.median_days_between_orders).toBe(61);
  });

  // 23. Cadencia actual intacta
  it('23. Cadencia actual intacta', async () => {
    const c = await crmRepository.createCompany({
      organization_id: ORG_A,
      name: 'Cliente Cadencia',
      legal_name: null,
      tax_id: null,
      external_id: null,
      country_code: 'PY',
      city: null,
      website: null,
      phone: null,
      email: null,
      source: 'MANUAL',
      notes: null,
      owner_profile_id: null,
      lifecycle_stage: 'CUSTOMER',
    });

    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Cliente Cadencia', '2026-05-01', 'CUP-8OZ-SW', '1000'],
        ['Cliente Cadencia', '2026-05-31', 'CUP-8OZ-SW', '1000'],
        ['Cliente Cadencia', '2026-07-01', 'CUP-8OZ-SW', '1000'],
        ['Cliente Cadencia', '2026-07-30', 'CUP-8OZ-SW', '1000'],
        ['Cliente Cadencia', '2026-08-31', 'CUP-8OZ-SW', '1000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'cadencia.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });
    await commitEntireIngestionJob(ORG_A, summary.job_id);

    const consumption = await purchaseService.getConsumption(ORG_A, c.id, new Date('2026-09-05T12:00:00Z').getTime());
    expect(consumption.stats[0].median_days_between_orders).toBe(31);
    expect(consumption.stats[0].expected_next_purchase_at).toBe('2026-10-01');
  });

  // 24. Alertas solo PROSPECT
  it('24. Alertas solo PROSPECT', async () => {
    const cust = await crmRepository.createCompany({
      organization_id: ORG_A,
      name: 'Cliente Overdue',
      legal_name: null,
      tax_id: null,
      external_id: null,
      country_code: 'PY',
      city: null,
      website: null,
      phone: null,
      email: null,
      source: 'MANUAL',
      notes: null,
      owner_profile_id: null,
      lifecycle_stage: 'CUSTOMER',
    });

    const pros = await crmRepository.createCompany({
      organization_id: ORG_A,
      name: 'Prospecto Overdue',
      legal_name: null,
      tax_id: null,
      external_id: null,
      country_code: 'PY',
      city: null,
      website: null,
      phone: null,
      email: null,
      source: 'MANUAL',
      notes: null,
      owner_profile_id: null,
      lifecycle_stage: 'PROSPECT',
    });

    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad', 'Importe'],
        ['Cliente Overdue', '2026-06-01', 'CUP-8OZ-SW', '1000', '100'],
        ['Cliente Overdue', '2026-07-01', 'CUP-8OZ-SW', '1000', '100'],
        ['Cliente Overdue', '2026-07-31', 'CUP-8OZ-SW', '1000', '100'],
        ['Prospecto Overdue', '2026-06-01', 'CUP-8OZ-SW', '1000', '100'],
        ['Prospecto Overdue', '2026-07-01', 'CUP-8OZ-SW', '1000', '100'],
        ['Prospecto Overdue', '2026-07-31', 'CUP-8OZ-SW', '1000', '100'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'alertas.xlsx',
      targetLifecycle: 'PROSPECT',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3, total_value: 4 },
    });
    await commitEntireIngestionJob(ORG_A, summary.job_id);

    const alerts = await purchaseService.getAlerts(ORG_A, new Date('2026-10-05T12:00:00Z').getTime());
    const companyIds = alerts.map((a) => a.company_id);
    expect(companyIds).toContain(pros.id);
    expect(companyIds).not.toContain(cust.id);
  });

  // 25. Archivo 10k rows: no explota memoria/UI
  it('25. Archivo 10k rows: no explota memoria/UI', async () => {
    const rows: unknown[][] = [['Cliente', 'Fecha', 'SKU', 'Cantidad']];
    for (let i = 0; i < 10000; i++) {
      rows.push([`Cliente ${i % 50}`, '2026-08-01', 'CUP-8OZ-SW', '100']);
    }
    const buffer = makeXlsx({ BigSheet: rows });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: '10k.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });

    expect(summary.total_movements).toBe(10000);
    expect(summary.sample_rows.length).toBeLessThanOrEqual(50);
  });

  // 26. Preview no devuelve/renderiza miles de editores
  it('26. Preview no devuelve/renderiza miles de editores', async () => {
    const rows: unknown[][] = [['Cliente', 'Fecha', 'Producto', 'Cantidad']];
    for (let i = 0; i < 2000; i++) {
      rows.push(['Cliente X', '2026-08-01', `Producto Raro ${i % 3}`, '100']);
    }
    const buffer = makeXlsx({ Data: rows });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'few_groups.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, product_description: 2, quantity: 3 },
    });

    // 2000 rows, but only 3 distinct product descriptions -> only 3 groups!
    expect(summary.unresolved_product_groups).toHaveLength(3);
    expect(summary.total_movements).toBe(2000);
  });

  // 27. Cerrar y reabrir job: estado persistido
  it('27. Cerrar y reabrir job: estado persistido', async () => {
    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Cliente Persistente', '2026-08-01', 'CUP-8OZ-SW', '2000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'reabrir.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });

    const reloaded = await getIngestionCockpitSummary(ORG_A, summary.job_id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.job_id).toBe(summary.job_id);
    expect(reloaded?.total_movements).toBe(1);
    expect(reloaded?.status).toBe(summary.status);
  });

  // 28. Cancelar job: no escribe CRM definitivo
  it('28. Cancelar job: no escribe CRM definitivo', async () => {
    const buffer = makeXlsx({
      Data: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Cliente Cancelado', '2026-08-01', 'CUP-8OZ-SW', '5000'],
      ],
    });

    const summary = await createIngestionJob(ORG_A, {
      buffer,
      filename: 'cancel.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideMapping: { customer_name: 0, purchase_date: 1, sku: 2, quantity: 3 },
    });

    await cancelIngestionJob(ORG_A, summary.job_id);

    const reloaded = await getIngestionCockpitSummary(ORG_A, summary.job_id);
    expect(reloaded?.status).toBe('CANCELLED');

    await expect(commitEntireIngestionJob(ORG_A, summary.job_id)).rejects.toThrow('JOB_IS_CANCELLED');
    expect(await crmRepository.listCompanies(ORG_A)).toHaveLength(0);
    expect(await crmRepository.listPurchases(ORG_A)).toHaveLength(0);
  });
});
