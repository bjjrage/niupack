import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import {
  extractProductAttributes,
  matchProductRecordWithAttributes,
  type SkuRef,
} from '@/lib/crm/ingestion/reconciliation';
import {
  createIngestionJob,
  resolveProductGroup,
  getIngestionCockpitSummary,
} from '@/lib/crm/ingestion/staging';
import { crmRepository } from '@/lib/crm/repository';
import { repository as dbRepo } from '@/lib/db/repository';

const TEST_ORG = 'test-org-reconciliation';
const OTHER_ORG = 'other-org-isolated';

const MASTER_SKUS: SkuRef[] = [
  { sku: 'CUP-4OZ-SW', name: 'Vaso 4 oz SW', category: 'cups', size_oz: 4, wall_type: 'single' },
  { sku: 'CUP-6OZ-SW', name: 'Vaso 6 oz SW', category: 'cups', size_oz: 6, wall_type: 'single' },
  { sku: 'CUP-8OZ-SW', name: 'Vaso 8 oz SW', category: 'cups', size_oz: 8, wall_type: 'single' },
  { sku: 'CUP-12OZ-SW', name: 'Vaso 12 oz SW', category: 'cups', size_oz: 12, wall_type: 'single' },
  { sku: 'CUP-12OZ-DW', name: 'Vaso 12 oz DW', category: 'cups', size_oz: 12, wall_type: 'double' },
  { sku: 'CUP-16OZ-SW', name: 'Vaso 16 oz SW', category: 'cups', size_oz: 16, wall_type: 'single' },
  { sku: 'CUP-21OZ-SW', name: 'Vaso 21 oz SW', category: 'cups', size_oz: 21, wall_type: 'single' },
  { sku: 'CUP-24OZ-SW', name: 'Vaso 24 oz SW', category: 'cups', size_oz: 24, wall_type: 'single' },
  { sku: 'CUP-9OZ-DW', name: 'Vaso 9 oz DW', category: 'cups', size_oz: 9, wall_type: 'double' },
  { sku: 'POT-3OZ', name: 'Pote 3 oz', category: 'bowls', size_oz: 3, wall_type: 'n/a' },
  { sku: 'POT-8OZ', name: 'Pote 8 oz', category: 'bowls', size_oz: 8, wall_type: 'n/a' },
  { sku: 'POT-20OZ', name: 'Pote 20 oz', category: 'bowls', size_oz: 20, wall_type: 'n/a' },
];

function buildExcelBuffer(rows: any[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ACUMULADO');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('Deterministic Product Reconciliation Engine', () => {
  // Test 1: VASOSDE8OZCONDISEÑO + único SKU cup 8 oz -> ATTRIBUTE_UNIQUE_MATCH
  it('1. VASOSDE8OZCONDISEÑO + único SKU cup 8 oz -> ATTRIBUTE_UNIQUE_MATCH', () => {
    const res = matchProductRecordWithAttributes(
      {
        producto: 'VASOSDE8OZCONDISEÑO',
        line: 'POLIPAPEL',
        subline: 'VASOS8',
      },
      MASTER_SKUS,
      [],
    );

    expect(res.match_type).toBe('ATTRIBUTE_UNIQUE_MATCH');
    expect(res.sku).toBe('CUP-8OZ-SW');
    expect(res.status).toBe('RESOLVED_CUP');
    expect(res.candidates).toBeNull();
  });

  // Test 2: VASO12OZ + SW y DW existentes -> AMBIGUOUS
  it('2. VASO12OZ + SW y DW existentes -> AMBIGUOUS', () => {
    const res = matchProductRecordWithAttributes(
      { producto: 'VASO12OZ', line: 'POLIPAPEL', subline: 'VASOS12' },
      MASTER_SKUS,
      [],
    );

    expect(res.match_type).toBe('AMBIGUOUS');
    expect(res.sku).toBeNull();
    expect(res.status).toBe('PRODUCT_UNRESOLVED');
    expect(res.candidates?.map((c) => c.sku).sort()).toEqual(['CUP-12OZ-DW', 'CUP-12OZ-SW']);
  });

  // Test 3: VASO12OZDOBLEPARED -> CUP-12OZ-DW
  it('3. VASO12OZDOBLEPARED -> CUP-12OZ-DW', () => {
    const res = matchProductRecordWithAttributes(
      { producto: 'VASO12OZDOBLEPARED' },
      MASTER_SKUS,
      [],
    );

    expect(res.match_type).toBe('ATTRIBUTE_UNIQUE_MATCH');
    expect(res.sku).toBe('CUP-12OZ-DW');
    expect(res.status).toBe('RESOLVED_CUP');
  });

  // Test 4: Producto sin capacidad interpretable -> NO_MATCH
  it('4. Producto sin capacidad interpretable -> NO_MATCH', () => {
    const res = matchProductRecordWithAttributes(
      { producto: 'PRODUCTO DESCONOCIDO XYZ', line: 'VARIOS' },
      MASTER_SKUS,
      [],
    );

    expect(res.match_type).toBe('NO_MATCH');
    expect(res.sku).toBeNull();
    expect(res.status).toBe('PRODUCT_UNRESOLVED');
  });

  // Test 5: targetSku inexistente en resolveProductGroup -> throws SKU_NOT_FOUND_IN_MASTER
  it('5. targetSku inexistente en resolveProductGroup -> throws SKU_NOT_FOUND_IN_MASTER', async () => {
    // Attempting to resolve with an invented / non-existent SKU must throw
    await expect(
      resolveProductGroup(TEST_ORG, 'mock-job-id', 'VASO EXTRA', 'INVENTED-SKU-999'),
    ).rejects.toThrow('SKU_NOT_FOUND_IN_MASTER');
  });

  // Test 6: pendingResolution con SKU inexistente -> NO RESOLVE
  it('6. pendingResolution con SKU inexistente -> NO RESOLVE', async () => {
    const header = ['CLIENTES', 'Producto', 'FechaFacturacion', 'Cantidad'];
    const row = ['CAFETERIA SOL', 'VASO MISTERIOSO', '2026-03-01', 1000];
    const buffer = buildExcelBuffer([header, row]);

    const cockpit = await createIngestionJob(TEST_ORG, {
      buffer,
      filename: 'test-pending-invented.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideHeaderRowIndex: 0,
      overrideMapping: {
        customer_name: 0,
        product_description: 1,
        purchase_date: 2,
        quantity: 3,
      },
      pendingResolutions: {
        'VASO MISTERIOSO': 'FAKE-SKU-INVENTADO',
      },
    });

    expect(cockpit.unresolved_products_count).toBe(1);
    expect(cockpit.resolved_cups_count).toBe(0);
    const rowInDb = (await crmRepository.listImportRows(TEST_ORG, cockpit.job_id))[0];
    expect(rowInDb.sku).toBeNull();
    expect(rowInDb.product_status).toBe('PRODUCT_UNRESOLVED');
  });

  // Test 7: alias nunca puede apuntar a SKU inexistente
  it('7. alias nunca puede apuntar a SKU inexistente', () => {
    const res = matchProductRecordWithAttributes(
      { producto: 'VASO VIEJO' },
      MASTER_SKUS,
      [{ alias_normalized: 'vaso viejo', sku: 'SKU-BORRADO-DE-BASE' }],
    );

    // Because 'SKU-BORRADO-DE-BASE' is not in Master, aliasHit is disregarded
    expect(res.sku).not.toBe('SKU-BORRADO-DE-BASE');
  });

  // Test 8: 85 filas mismo raw product -> una resolución grupal -> 85 rows actualizadas
  it('8. 85 filas mismo raw product -> una resolución grupal -> 85 rows actualizadas', async () => {
    const rows: (string | number)[][] = [['CLIENTES', 'Producto', 'FechaFacturacion', 'Cantidad', 'Linea', 'SUB-LINEA']];
    for (let i = 0; i < 85; i++) {
      rows.push([`CLIENTE ${i}`, 'VASOSDE8OZCONDISEÑO', '2026-02-15', 500, 'POLIPAPEL', 'VASOS8']);
    }
    const buffer = buildExcelBuffer(rows);

    const cockpit = await createIngestionJob(TEST_ORG, {
      buffer,
      filename: '85-filas.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideHeaderRowIndex: 0,
      overrideMapping: {
        customer_name: 0,
        product_description: 1,
        purchase_date: 2,
        quantity: 3,
        product_line: 4,
        product_subline: 5,
      },
    });

    expect(cockpit.total_movements).toBe(85);
    expect(cockpit.resolved_cups_count).toBe(85);
    expect(cockpit.unresolved_products_count).toBe(0);

    const staged = await crmRepository.listImportRows(TEST_ORG, cockpit.job_id);
    expect(staged.length).toBe(85);
    expect(staged.every((r) => r.sku === 'CUP-8OZ-SW' && r.product_status === 'RESOLVED_CUP')).toBe(true);
  });

  // Test 9: SKU exacto sigue ganando
  it('9. SKU exacto sigue ganando', () => {
    const res = matchProductRecordWithAttributes(
      { producto: 'CUP-16OZ-SW', sku_raw: 'CUP-16OZ-SW' },
      MASTER_SKUS,
      [],
    );

    expect(res.match_type).toBe('EXACT_SKU');
    expect(res.sku).toBe('CUP-16OZ-SW');
    expect(res.status).toBe('RESOLVED_CUP');
  });

  // Test 10: alias existente sigue ganando
  it('10. alias existente sigue ganando', () => {
    const res = matchProductRecordWithAttributes(
      { producto: 'VASO PERSONALIZADO FIESTA' },
      MASTER_SKUS,
      [{ alias_normalized: 'vaso personalizado fiesta', sku: 'CUP-4OZ-SW' }],
    );

    expect(res.match_type).toBe('ALIAS_CONFIRMED');
    expect(res.sku).toBe('CUP-4OZ-SW');
    expect(res.status).toBe('RESOLVED_CUP');
  });

  // Test 11: non-cup real -> RESOLVED_NON_CUP
  it('11. non-cup real -> RESOLVED_NON_CUP', () => {
    const res = matchProductRecordWithAttributes(
      { producto: 'POTES DE 20 OZ', line: 'POLIPAPEL', subline: 'BOWLS20' },
      MASTER_SKUS,
      [],
    );

    expect(res.match_type).toBe('ATTRIBUTE_UNIQUE_MATCH');
    expect(res.sku).toBe('POT-20OZ');
    expect(res.status).toBe('RESOLVED_NON_CUP');
  });

  // Test 12: ambiguous nunca elige arbitrariamente
  it('12. ambiguous nunca elige arbitrariamente', () => {
    const res = matchProductRecordWithAttributes(
      { producto: 'VASO 12 OZ' },
      MASTER_SKUS,
      [],
    );

    expect(res.match_type).toBe('AMBIGUOUS');
    expect(res.sku).toBeNull();
    expect(res.status).toBe('PRODUCT_UNRESOLVED');
    expect(res.candidates?.length).toBe(2);
  });

  // Test 13: tenant isolation intacta
  it('13. tenant isolation intacta', async () => {
    const bufferA = buildExcelBuffer([
      ['CLIENTES', 'Producto', 'FechaFacturacion', 'Cantidad'],
      ['CLIENTE ORG A', 'VASO ESPECIAL LOCAL', '2026-03-01', 100],
    ]);

    // Save alias only for TEST_ORG
    await crmRepository.saveProductAlias(TEST_ORG, 'vaso especial local', 'CUP-6OZ-SW');

    // Ingest for OTHER_ORG
    const cockpitB = await createIngestionJob(OTHER_ORG, {
      buffer: bufferA,
      filename: 'isolation.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideHeaderRowIndex: 0,
      overrideMapping: { customer_name: 0, product_description: 1, purchase_date: 2, quantity: 3 },
    });

    // In OTHER_ORG, the alias from TEST_ORG must NOT be used
    const rowsB = await crmRepository.listImportRows(OTHER_ORG, cockpitB.job_id);
    expect(rowsB[0].sku).not.toBe('CUP-6OZ-SW');
  });

  // Test 14: job continúa committed_at null
  it('14. job continúa committed_at null', async () => {
    const buffer = buildExcelBuffer([
      ['CLIENTES', 'Producto', 'FechaFacturacion', 'Cantidad'],
      ['CLIENTE C', 'VASOSDE8OZCONDISEÑO', '2026-03-01', 500],
    ]);

    const cockpit = await createIngestionJob(TEST_ORG, {
      buffer,
      filename: 'commit-null.xlsx',
      targetLifecycle: 'CUSTOMER',
      overrideHeaderRowIndex: 0,
      overrideMapping: { customer_name: 0, product_description: 1, purchase_date: 2, quantity: 3 },
    });

    const job = await crmRepository.getImportJob(cockpit.job_id, TEST_ORG);
    expect(job?.committed_at).toBeNull();
  });

  // Test 15: crm_customer_purchases permanece 0
  it('15. crm_customer_purchases permanece 0 tras staging y reconciliación', async () => {
    const purchases = await crmRepository.listPurchases(TEST_ORG);
    expect(purchases.length).toBe(0);
  });
});
