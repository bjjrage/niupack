import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { crmRepository, resetCrmMemory } from '@/lib/crm/repository';
import { repository } from '@/lib/db/repository';
import { purchaseService } from '@/lib/crm/purchase-service';
import { normalizeName } from '@/lib/crm/purchase-import';
import { OpenAIService } from '@/lib/openai/openai-service';

const ORG = '00000000-0000-0000-0000-00000000aa01';
const ORG_B = '00000000-0000-0000-0000-00000000bb02';

function makeXlsxBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function mockOpenAIResponse(inferredJson: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (typeof url === 'string' && url.includes('api.openai.com')) {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(inferredJson),
              },
            },
          ],
        }),
      } as unknown as Response;
    }
    return { ok: false } as unknown as Response;
  });
}

async function createTestCompany(
  orgId: string,
  name: string,
  stage: 'CUSTOMER' | 'PROSPECT' = 'PROSPECT',
  taxId?: string,
): Promise<string> {
  const c = await crmRepository.createCompany({
    organization_id: orgId,
    name,
    legal_name: null,
    tax_id: taxId ?? null,
    external_id: null,
    country_code: 'PY',
    city: 'Asunción',
    website: null,
    phone: null,
    email: null,
    source: 'MANUAL',
    notes: null,
    owner_profile_id: null,
    lifecycle_stage: stage,
  });
  return c.id;
}

beforeEach(() => {
  resetCrmMemory();
  OpenAIService.setApiKey('test-key-mock-1234567890');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NIUPACK CRM - Importación Histórica de Vasos (15 Tests Obligatorios)', () => {
  // 1. Historial vaso 8 oz con 5 compras -> 5 movimientos persistidos individualmente
  it('1. Historial vaso 8 oz con 5 compras -> 5 movimientos persistidos individualmente', async () => {
    const companyId = await createTestCompany(ORG, 'Cafetería El Grano');
    const dates = ['2026-05-01', '2026-05-31', '2026-07-01', '2026-07-30', '2026-08-31'];

    const commitRes = await purchaseService.commitImport(ORG, {
      rows: dates.map((date, i) => ({
        company_id: companyId,
        purchase_date: date,
        sku: 'CUP-8OZ-SW',
        product_name: 'Vaso Polipapel 8 oz',
        quantity: 10000,
        external_document_id: `FAC-${i + 1}`,
        line_number: 1,
      })),
    });

    expect(commitRes.inserted).toBe(5);
    expect(commitRes.duplicates).toBe(0);

    const persisted = await crmRepository.listPurchases(ORG, companyId);
    expect(persisted).toHaveLength(5);
    const persistedDates = persisted.map((p) => p.purchase_date).sort();
    expect(persistedDates).toEqual(dates);
  });

  // 2. Cadencia 30, 31, 29, 32 días -> mediana correcta
  it('2. Cadencia 30, 31, 29, 32 días -> mediana correcta', async () => {
    const companyId = await createTestCompany(ORG, 'Café Deli');
    // Fechas con intervalos:
    // 2026-05-01 a 2026-05-31: 30 días
    // 2026-05-31 a 2026-07-01: 31 días
    // 2026-07-01 a 2026-07-30: 29 días
    // 2026-07-30 a 2026-08-31: 32 días
    // Ordenados: [29, 30, 31, 32] -> Mediana = (30 + 31) / 2 = 30.5
    const dates = ['2026-05-01', '2026-05-31', '2026-07-01', '2026-07-30', '2026-08-31'];

    await purchaseService.commitImport(ORG, {
      rows: dates.map((date, i) => ({
        company_id: companyId,
        purchase_date: date,
        sku: 'CUP-8OZ-SW',
        product_name: 'Vaso 8 oz',
        quantity: 5000,
        external_document_id: `INV-${i}`,
        line_number: 1,
      })),
    });

    const consumption = await purchaseService.getConsumption(ORG, companyId, new Date('2026-09-05T12:00:00Z').getTime());
    expect(consumption.stats).toHaveLength(1);
    const cupStats = consumption.stats[0];
    expect(cupStats.sku).toBe('CUP-8OZ-SW');
    expect(cupStats.purchase_count).toBe(5);
    // Intervalos: [29, 30, 31, 32]. Mediana cruda = 30.5, redondeada por el motor a 31
    expect(cupStats.median_days_between_orders).toBe(31);
    expect(cupStats.min_days_between_orders).toBe(29);
    expect(cupStats.max_days_between_orders).toBe(32);
    expect(cupStats.expected_next_purchase_at).toBe('2026-10-01');
  });

  // 3. Dos SKUs mismo cliente -> patrones separados
  it('3. Dos SKUs mismo cliente -> patrones separados', async () => {
    const companyId = await createTestCompany(ORG, 'Restaurante Multi-Vaso');

    // SKU A: CUP-8OZ-SW con cadencia ~30 días (3 compras: 2026-06-01, 2026-07-01, 2026-07-31)
    // SKU B: CUP-16OZ-SW con cadencia ~60 días (3 compras: 2026-05-01, 2026-07-01, 2026-08-30)
    await purchaseService.commitImport(ORG, {
      rows: [
        { company_id: companyId, purchase_date: '2026-06-01', sku: 'CUP-8OZ-SW', product_name: 'Vaso 8', quantity: 2000, external_document_id: 'A1', line_number: 1 },
        { company_id: companyId, purchase_date: '2026-07-01', sku: 'CUP-8OZ-SW', product_name: 'Vaso 8', quantity: 2000, external_document_id: 'A2', line_number: 1 },
        { company_id: companyId, purchase_date: '2026-07-31', sku: 'CUP-8OZ-SW', product_name: 'Vaso 8', quantity: 2000, external_document_id: 'A3', line_number: 1 },
        { company_id: companyId, purchase_date: '2026-05-01', sku: 'CUP-16OZ-SW', product_name: 'Vaso 16', quantity: 5000, external_document_id: 'B1', line_number: 1 },
        { company_id: companyId, purchase_date: '2026-07-01', sku: 'CUP-16OZ-SW', product_name: 'Vaso 16', quantity: 5000, external_document_id: 'B2', line_number: 1 },
        { company_id: companyId, purchase_date: '2026-08-30', sku: 'CUP-16OZ-SW', product_name: 'Vaso 16', quantity: 5000, external_document_id: 'B3', line_number: 1 },
      ],
    });

    const consumption = await purchaseService.getConsumption(ORG, companyId);
    expect(consumption.stats).toHaveLength(2);

    const stat8 = consumption.stats.find((s) => s.sku === 'CUP-8OZ-SW')!;
    const stat16 = consumption.stats.find((s) => s.sku === 'CUP-16OZ-SW')!;

    expect(stat8).toBeDefined();
    expect(stat16).toBeDefined();
    expect(stat8.median_days_between_orders).toBe(30);
    expect(stat16.median_days_between_orders).toBe(61);
    expect(stat8.expected_next_purchase_at).not.toBe(stat16.expected_next_purchase_at);
  });

  // 4. Producto plástico/no-cup -> IGNORED_NON_CUP
  it('4. Producto plástico/no-cup -> IGNORED_NON_CUP', async () => {
    await createTestCompany(ORG, 'Bar Central');

    // Registrar SKU para PROD-LIDS (category: 'lids')
    await repository.addSKU({
      product_id: '00000000-0000-0000-0000-000000000021', // PROD-LIDS
      sku: 'LID-8OZ-PICO',
      size_oz: 8,
      size_ml: 240,
      height_mm: 10,
      top_diameter_mm: 80,
      bottom_diameter_mm: 80,
      material: 'Plástico',
      paper_weight_gsm: 0,
      coating: 'None',
      wall_type: 'single',
      max_colors: 0,
      pack_quantity: 100,
      carton_quantity: 1000,
      moq: 10000,
      notes: 'Tapa plástica',
    });

    // LID-8OZ-PICO tiene category: 'lids' en el maestro
    const buffer = makeXlsxBuffer({
      Ventas: [
        ['Cliente', 'Fecha', 'Producto', 'Cantidad'],
        ['Bar Central', '2026-08-10', 'LID-8OZ-PICO', '5000'],
      ],
    });

    const preview = await purchaseService.previewImport(ORG, {
      buffer,
      filename: 'ventas_tapas.xlsx',
      overrideSheetName: 'Ventas',
      overrideHeaderRowIndex: 0,
      overrideMapping: {
        customer_name: 0,
        purchase_date: 1,
        product_description: 2,
        sku: 2,
        quantity: 3,
      },
    });

    expect(preview.total_movements).toBe(1);
    expect(preview.ignored_non_cups_count).toBe(1);
    expect(preview.resolved_cups_count).toBe(0);
    expect(preview.rows[0].status).toBe('IGNORED_NON_CUP');
    expect(preview.rows[0].product_category).toBe('lids');
  });

  // 5. Cup real -> importado
  it('5. Cup real -> importado', async () => {
    const companyId = await createTestCompany(ORG, 'Heladería y Café');

    const buffer = makeXlsxBuffer({
      Ventas: [
        ['Cliente', 'Fecha', 'SKU', 'Cantidad'],
        ['Heladería y Café', '2026-08-15', 'CUP-8OZ-SW', '12000'],
      ],
    });

    const preview = await purchaseService.previewImport(ORG, {
      buffer,
      filename: 'ventas_vasos.xlsx',
      overrideSheetName: 'Ventas',
      overrideHeaderRowIndex: 0,
      overrideMapping: {
        customer_name: 0,
        purchase_date: 1,
        sku: 2,
        quantity: 3,
      },
    });

    expect(preview.resolved_cups_count).toBe(1);
    expect(preview.rows[0].status).toBe('RESOLVED_CUP');
    expect(preview.rows[0].sku).toBe('CUP-8OZ-SW');
    expect(preview.rows[0].product_category).toBe('cups');

    // Commit de la fila resuelta
    const commit = await purchaseService.commitImport(ORG, {
      rows: [
        {
          company_id: companyId,
          purchase_date: preview.rows[0].fecha!,
          sku: preview.rows[0].sku!,
          product_name: preview.rows[0].product_name!,
          quantity: preview.rows[0].cantidad!,
        },
      ],
    });

    expect(commit.inserted).toBe(1);
    expect(commit.duplicates).toBe(0);
  });

  // 6. Producto histórico sin match -> sku = null, PRODUCT_UNRESOLVED, nunca SKU inventado
  it('6. Producto histórico sin match -> sku = null, PRODUCT_UNRESOLVED, nunca SKU inventado', async () => {
    await createTestCompany(ORG, 'Café Tradición');

    const buffer = makeXlsxBuffer({
      Historico: [
        ['Cliente', 'Fecha', 'Descripción', 'Cantidad'],
        ['Café Tradición', '2026-06-01', 'VASO EXTRAÑO DESCONOCIDO 1999 EDICION ESPECIAL', '500'],
      ],
    });

    const preview = await purchaseService.previewImport(ORG, {
      buffer,
      filename: 'historico_raro.xlsx',
      overrideSheetName: 'Historico',
      overrideHeaderRowIndex: 0,
      overrideMapping: {
        customer_name: 0,
        purchase_date: 1,
        product_description: 2,
        quantity: 3,
      },
    });

    expect(preview.total_movements).toBe(1);
    expect(preview.unresolved_products_count).toBe(1);
    expect(preview.rows[0].status).toBe('PRODUCT_UNRESOLVED');
    expect(preview.rows[0].sku).toBeNull();
    expect(preview.unresolved_groups).toHaveLength(1);
    expect(preview.unresolved_groups[0].description).toBe('VASO EXTRAÑO DESCONOCIDO 1999 EDICION ESPECIAL');
  });

  // 7. Alias confirmado -> siguiente importación lo resuelve automáticamente
  it('7. Alias confirmado -> siguiente importación lo resuelve automáticamente', async () => {
    await createTestCompany(ORG, 'Café Express');

    // Guardar alias de producto: 'vaso termico 8' -> 'CUP-8OZ-SW'
    await crmRepository.saveProductAlias(ORG, normalizeName('Vaso Termico 8'), 'CUP-8OZ-SW');

    const buffer = makeXlsxBuffer({
      Ventas: [
        ['Cliente', 'Fecha', 'Producto', 'Cantidad'],
        ['Café Express', '2026-08-01', 'Vaso Termico 8', '3000'],
      ],
    });

    const preview = await purchaseService.previewImport(ORG, {
      buffer,
      filename: 'ventas_alias.xlsx',
      overrideSheetName: 'Ventas',
      overrideHeaderRowIndex: 0,
      overrideMapping: {
        customer_name: 0,
        purchase_date: 1,
        product_description: 2,
        quantity: 3,
      },
    });

    expect(preview.rows[0].status).toBe('RESOLVED_CUP');
    expect(preview.rows[0].sku).toBe('CUP-8OZ-SW');
    expect(preview.rows[0].product_category).toBe('cups');
    expect(preview.resolved_cups_count).toBe(1);
  });

  // 8. Reimportar mismo historial -> no duplica
  it('8. Reimportar mismo historial -> no duplica', async () => {
    const companyId = await createTestCompany(ORG, 'Hotel Palace');

    const payload = {
      rows: [
        {
          company_id: companyId,
          purchase_date: '2026-07-15',
          sku: 'CUP-8OZ-SW',
          product_name: 'Vaso 8 oz',
          quantity: 10000,
          external_document_id: 'FAC-999',
          line_number: 1,
        },
        {
          company_id: companyId,
          purchase_date: '2026-08-15',
          sku: 'CUP-8OZ-SW',
          product_name: 'Vaso 8 oz',
          quantity: 10000,
          external_document_id: 'FAC-1000',
          line_number: 1,
        },
      ],
    };

    const first = await purchaseService.commitImport(ORG, payload);
    expect(first.inserted).toBe(2);
    expect(first.duplicates).toBe(0);

    const second = await purchaseService.commitImport(ORG, payload);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(2);

    const persisted = await crmRepository.listPurchases(ORG, companyId);
    expect(persisted).toHaveLength(2);
  });

  // 9. LLM identifica sheet/header/mapping
  it('9. LLM identifica sheet/header/mapping', async () => {
    await createTestCompany(ORG, 'Corporación Andina');

    const buffer = makeXlsxBuffer({
      MovimientosHistoricos: [
        ['REPORTE OFICIAL DE VENTAS', '', '', '', ''],
        ['Generado automáticamente', '', '', '', ''],
        ['Razón Social Cliente', 'Fecha Facturación', 'Ítem de Venta', 'Unidades Despachadas', 'Nro Factura'],
        ['Corporación Andina', '2026-07-20', 'CUP-8OZ-SW', '15000', 'F-001234'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'MovimientosHistoricos',
      header_row_index: 2,
      mapping: {
        customer_name: 0,
        purchase_date: 1,
        product_description: 2,
        sku: 2,
        quantity: 3,
        document_number: 4,
        tax_id: null,
        line_number: null,
        unit_price: null,
        total_value: null,
        currency: null,
      },
      confidence: {
        customer_name: 0.98,
        purchase_date: 0.95,
        product_description: 0.95,
        quantity: 0.99,
      },
    });

    const preview = await purchaseService.previewImport(ORG, {
      buffer,
      filename: 'movimientos.xlsx',
    });

    expect(preview.llm_inferred).toBe(true);
    expect(preview.sheet_name).toBe('MovimientosHistoricos');
    expect(preview.header_row_index).toBe(2);
    expect(preview.total_movements).toBe(1);
    expect(preview.rows[0].cliente).toBe('Corporación Andina');
    expect(preview.rows[0].fecha).toBe('2026-07-20');
    expect(preview.rows[0].sku).toBe('CUP-8OZ-SW');
    expect(preview.rows[0].cantidad).toBe(15000);
    expect(preview.rows[0].document_number).toBe('F-001234');
    expect(preview.rows[0].status).toBe('RESOLVED_CUP');
  });

  // 10. LLM falla -> mapping manual usable
  it('10. LLM falla -> mapping manual usable', async () => {
    await createTestCompany(ORG, 'Restaurante Central');

    const buffer = makeXlsxBuffer({
      Datos: [
        ['Encabezado decorativo no estándar', ''],
        ['Cliente Comprador', 'Dia', 'Articulo', 'Total Unidades'],
        ['Restaurante Central', '2026-08-01', 'CUP-8OZ-SW', '4000'],
      ],
    });

    // Simulamos fallo en LLM de OpenAI
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('OPENAI_NETWORK_FAILURE'));

    const preview = await purchaseService.previewImport(ORG, {
      buffer,
      filename: 'datos.xlsx',
      overrideSheetName: 'Datos',
      overrideHeaderRowIndex: 1,
      overrideMapping: {
        customer_name: 0,
        purchase_date: 1,
        sku: 2,
        product_description: 2,
        quantity: 3,
      },
    });

    expect(preview.llm_inferred).toBe(false);
    expect(preview.sheet_name).toBe('Datos');
    expect(preview.header_row_index).toBe(1);
    expect(preview.total_movements).toBe(1);
    expect(preview.rows[0].cliente).toBe('Restaurante Central');
    expect(preview.rows[0].sku).toBe('CUP-8OZ-SW');
    expect(preview.rows[0].cantidad).toBe(4000);
    expect(preview.rows[0].status).toBe('RESOLVED_CUP');
  });

  // 11. Archivo con 1000+ movimientos -> preview resumida, sin 1000 editores simultáneos
  it('11. Archivo con 1000+ movimientos -> preview resumida, sin 1000 editores simultáneos', async () => {
    await createTestCompany(ORG, 'Cadena Rápida 1');
    await createTestCompany(ORG, 'Cadena Rápida 2');

    // Generamos 1200 filas con solo 2 productos no resueltos distintos
    const matrix: unknown[][] = [['Cliente', 'Fecha', 'Producto', 'Cantidad']];
    for (let i = 0; i < 1200; i++) {
      const client = i % 2 === 0 ? 'Cadena Rápida 1' : 'Cadena Rápida 2';
      const prod = i % 3 === 0 ? 'CUP-8OZ-SW' : i % 3 === 1 ? 'Vaso Desconocido A' : 'Vaso Desconocido B';
      matrix.push([client, '2026-08-01', prod, '1000']);
    }

    const buffer = makeXlsxBuffer({ Data: matrix });

    const preview = await purchaseService.previewImport(ORG, {
      buffer,
      filename: 'masivo.xlsx',
      overrideSheetName: 'Data',
      overrideHeaderRowIndex: 0,
      overrideMapping: {
        customer_name: 0,
        purchase_date: 1,
        product_description: 2,
        sku: 2,
        quantity: 3,
      },
    });

    expect(preview.total_movements).toBe(1200);
    expect(preview.unique_clients_count).toBe(2);
    // Solo 2 grupos no resueltos ('Vaso Desconocido A' y 'Vaso Desconocido B') en vez de 800 formularios individuales
    expect(preview.unresolved_groups).toHaveLength(2);
    expect(preview.unresolved_groups.map((g) => g.description).sort()).toEqual([
      'Vaso Desconocido A',
      'Vaso Desconocido B',
    ]);
  });

  // 12. CUSTOMER con historial -> cadence calculada
  it('12. CUSTOMER con historial -> cadence calculada', async () => {
    const customerId = await createTestCompany(ORG, 'Cliente Oficial S.A.', 'CUSTOMER');
    const dates = ['2026-05-01', '2026-05-31', '2026-07-01', '2026-07-31'];

    await purchaseService.commitImport(ORG, {
      rows: dates.map((date, i) => ({
        company_id: customerId,
        purchase_date: date,
        sku: 'CUP-8OZ-SW',
        product_name: 'Vaso 8 oz',
        quantity: 8000,
        external_document_id: `CUST-FAC-${i}`,
        line_number: 1,
      })),
    });

    const consumption = await purchaseService.getConsumption(ORG, customerId, new Date('2026-08-05T12:00:00Z').getTime());
    expect(consumption.stats).toHaveLength(1);
    expect(consumption.stats[0].purchase_count).toBe(4);
    expect(consumption.stats[0].median_days_between_orders).toBeGreaterThan(0);
    expect(consumption.stats[0].expected_next_purchase_at).toBeTruthy();
  });

  // 13. PROSPECT con historial -> cadence calculada
  it('13. PROSPECT con historial -> cadence calculada', async () => {
    const prospectId = await createTestCompany(ORG, 'Prospecto Interesado SRL', 'PROSPECT');
    const dates = ['2026-05-01', '2026-05-31', '2026-07-01', '2026-07-31'];

    await purchaseService.commitImport(ORG, {
      rows: dates.map((date, i) => ({
        company_id: prospectId,
        purchase_date: date,
        sku: 'CUP-8OZ-SW',
        product_name: 'Vaso 8 oz',
        quantity: 5000,
        external_document_id: `PROS-FAC-${i}`,
        line_number: 1,
      })),
    });

    const consumption = await purchaseService.getConsumption(ORG, prospectId, new Date('2026-08-05T12:00:00Z').getTime());
    expect(consumption.stats).toHaveLength(1);
    expect(consumption.stats[0].purchase_count).toBe(4);
    expect(consumption.stats[0].median_days_between_orders).toBeGreaterThan(0);
    expect(consumption.stats[0].expected_next_purchase_at).toBeTruthy();
  });

  // 14. getAlerts() -> sigue devolviendo solo PROSPECT
  it('14. getAlerts() -> sigue devolviendo solo PROSPECT', async () => {
    const customerId = await createTestCompany(ORG, 'Cliente Actual Consolidado', 'CUSTOMER');
    const prospectId = await createTestCompany(ORG, 'Prospecto Con Compras Iniciales', 'PROSPECT');

    // Fechas que provocan estado OVERDUE para fecha de consulta 2026-10-05
    const dates = ['2026-06-01', '2026-07-01', '2026-07-31'];

    await purchaseService.commitImport(ORG, {
      rows: [
        ...dates.map((date, i) => ({
          company_id: customerId,
          purchase_date: date,
          sku: 'CUP-8OZ-SW',
          product_name: 'Vaso 8 oz',
          quantity: 10000,
          total_value: 1000,
          external_document_id: `CUST-DOC-${i}`,
          line_number: 1,
        })),
        ...dates.map((date, i) => ({
          company_id: prospectId,
          purchase_date: date,
          sku: 'CUP-8OZ-SW',
          product_name: 'Vaso 8 oz',
          quantity: 10000,
          total_value: 1000,
          external_document_id: `PROS-DOC-${i}`,
          line_number: 1,
        })),
      ],
    });

    const alerts = await purchaseService.getAlerts(ORG, new Date('2026-10-05T12:00:00Z').getTime());
    expect(alerts.length).toBeGreaterThan(0);

    const alertCompanyIds = new Set(alerts.map((a) => a.company_id));
    expect(alertCompanyIds.has(prospectId)).toBe(true);
    expect(alertCompanyIds.has(customerId)).toBe(false);
  });

  // 15. Tenant isolation PASS
  it('15. Tenant isolation PASS', async () => {
    const compA = await createTestCompany(ORG, 'Empresa Org A');
    await createTestCompany(ORG_B, 'Empresa Org B');

    await purchaseService.commitImport(ORG, {
      rows: [
        {
          company_id: compA,
          purchase_date: '2026-08-01',
          sku: 'CUP-8OZ-SW',
          product_name: 'Vaso 8 oz',
          quantity: 5000,
        },
      ],
    });

    // Org B no ve compras de Org A
    const purchasesB = await crmRepository.listPurchases(ORG_B);
    expect(purchasesB).toHaveLength(0);

    // Consulta de consumo de Org A desde Org B lanza CROSS_TENANT_REFERENCE
    await expect(purchaseService.getConsumption(ORG_B, compA)).rejects.toThrow('CROSS_TENANT_REFERENCE');

    // Intentar importar en Org B con company_id de Org A falla por fila
    const resB = await purchaseService.commitImport(ORG_B, {
      rows: [
        {
          company_id: compA,
          purchase_date: '2026-08-02',
          sku: 'CUP-8OZ-SW',
          product_name: 'Vaso 8 oz',
          quantity: 5000,
        },
      ],
    });
    expect(resB.inserted).toBe(0);
    expect(resB.errors[0]?.error).toBe('CROSS_TENANT_REFERENCE');
  });
});
