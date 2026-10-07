import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { crmRepository, resetCrmMemory } from '@/lib/crm/repository';
import { commitAccountList, previewAccountList, type AccountImportRow } from '@/lib/crm/account-import';
import { OpenAIService } from '@/lib/openai/openai-service';
import { purchaseService } from '@/lib/crm/purchase-service';

const ORG = '00000000-0000-0000-0000-00000000aa01';

function makeXlsxBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function makeCsvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
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

beforeEach(() => {
  resetCrmMemory();
  OpenAIService.setApiKey('test-key-mock-1234567890');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Adaptive Account Importer (LLM Maps, Deterministic Extracts)', () => {
  it('1. Archivo: Empresa | Contacto | Teléfono | Email -> LLM mapping correcto -> extracción correcta', async () => {
    const buffer = makeXlsxBuffer({
      Clientes: [
        ['Empresa', 'Contacto', 'Teléfono', 'Email'],
        ['Acme Corp', 'Juan Perez', '+595981111222', 'juan@acme.com'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'Clientes',
      header_row_index: 0,
      mapping: {
        company_name: 0,
        contact_name: 1,
        phone: 2,
        email: 3,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
      confidence: { company_name: 0.99 },
    });

    const preview = await previewAccountList({ buffer, filename: 'test1.xlsx' });

    expect(preview.llm_inferred).toBe(true);
    expect(preview.sheet_name).toBe('Clientes');
    expect(preview.header_row_index).toBe(0);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].company_name).toBe('Acme Corp');
    expect(preview.rows[0].contact_name).toBe('Juan Perez');
    expect(preview.rows[0].phone).toBe('+595981111222');
    expect(preview.rows[0].email).toBe('juan@acme.com');
    expect(preview.rows[0].errors).toHaveLength(0);
  });

  it('2. Archivo: Razón Social Comercial | Ejecutivo | Cel. Principal | Correo Electrónico -> mapping semántico correcto', async () => {
    const buffer = makeXlsxBuffer({
      Hoja1: [
        ['Razón Social Comercial', 'Ejecutivo', 'Cel. Principal', 'Correo Electrónico'],
        ['Delta Packaging SRL', 'Maria Lopez', '+595982333444', 'maria@deltapack.com'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'Hoja1',
      header_row_index: 0,
      mapping: {
        company_name: 0,
        contact_name: 1,
        phone: 2,
        email: 3,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
      confidence: { company_name: 0.98 },
    });

    const preview = await previewAccountList({ buffer, filename: 'test2.xlsx' });

    expect(preview.rows[0].company_name).toBe('Delta Packaging SRL');
    expect(preview.rows[0].contact_name).toBe('Maria Lopez');
    expect(preview.rows[0].phone).toBe('+595982333444');
    expect(preview.rows[0].email).toBe('maria@deltapack.com');
  });

  it('3. Fila 1: Título, Fila 2: Vacía, Fila 3: Headers -> header_row_index correcto', async () => {
    const buffer = makeXlsxBuffer({
      ACUMULADO: [
        ['LISTADO CLIENTES ACUMULADO 2026', '', '', ''],
        ['', '', '', ''],
        ['Razón Social', 'Contacto', 'Móvil', 'Correo'],
        ['Omega Corp', 'Pedro Gomez', '+595983555666', 'pedro@omega.com'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'ACUMULADO',
      header_row_index: 2,
      mapping: {
        company_name: 0,
        contact_name: 1,
        phone: 2,
        email: 3,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
    });

    const preview = await previewAccountList({ buffer, filename: 'acumulado.xlsx' });

    expect(preview.header_row_index).toBe(2);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].company_name).toBe('Omega Corp');
    expect(preview.rows[0].contact_name).toBe('Pedro Gomez');
    expect(preview.rows[0].errors).toHaveLength(0);
  });

  it('4. Varias sheets: Resumen, Notas, Base Clientes -> selecciona Base Clientes', async () => {
    const buffer = makeXlsxBuffer({
      Resumen: [
        ['Métricas', 'Total'],
        ['Ventas', 50000],
      ],
      Notas: [['Instrucciones de uso']],
      'Base Clientes': [
        ['Empresa', 'Email'],
        ['Cliente Real SA', 'info@clientereal.com'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'Base Clientes',
      header_row_index: 0,
      mapping: {
        company_name: 0,
        contact_name: null,
        phone: null,
        email: 1,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
    });

    const preview = await previewAccountList({ buffer, filename: 'multisheet.xlsx' });

    expect(preview.sheet_name).toBe('Base Clientes');
    expect(preview.rows[0].company_name).toBe('Cliente Real SA');
    expect(preview.rows[0].email).toBe('info@clientereal.com');
  });

  it('5. Columnas en orden arbitrario', async () => {
    const buffer = makeXlsxBuffer({
      Hoja1: [
        ['Correo', 'Teléfono', 'Responsable', 'Empresa'],
        ['soporte@arbitrario.com', '+595984777888', 'Laura Diaz', 'Arbitrario SA'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'Hoja1',
      header_row_index: 0,
      mapping: {
        company_name: 3,
        contact_name: 2,
        phone: 1,
        email: 0,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
    });

    const preview = await previewAccountList({ buffer, filename: 'arbitrario.xlsx' });

    expect(preview.rows[0].company_name).toBe('Arbitrario SA');
    expect(preview.rows[0].contact_name).toBe('Laura Diaz');
    expect(preview.rows[0].phone).toBe('+595984777888');
    expect(preview.rows[0].email).toBe('soporte@arbitrario.com');
  });

  it('6. Columnas extra irrelevantes', async () => {
    const buffer = makeXlsxBuffer({
      Hoja1: [
        ['ID Interno', 'Empresa', 'Observaciones Internas', 'Email', 'Zona Geográfica'],
        ['#99812', 'Extra Cols SRL', 'No llamar lunes', 'contacto@extra.com', 'Zona Norte'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'Hoja1',
      header_row_index: 0,
      mapping: {
        company_name: 1,
        contact_name: null,
        phone: null,
        email: 3,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
    });

    const preview = await previewAccountList({ buffer, filename: 'extra.xlsx' });

    expect(preview.rows[0].company_name).toBe('Extra Cols SRL');
    expect(preview.rows[0].email).toBe('contacto@extra.com');
    expect(preview.rows[0].contact_name).toBeNull();
  });

  it('7. LLM devuelve columna inexistente -> validación rechaza', async () => {
    const buffer = makeXlsxBuffer({
      Hoja1: [
        ['Empresa', 'Email'],
        ['Valid Corp', 'val@corp.com'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'Hoja1',
      header_row_index: 0,
      mapping: {
        company_name: 0,
        contact_name: 99, // Out of bounds column index
        phone: null,
        email: 1,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
    });

    const preview = await previewAccountList({ buffer, filename: 'oob.xlsx' });

    expect(preview.mapping.contact_name).toBeNull();
    expect(preview.rows[0].contact_name).toBeNull();
    expect(preview.rows[0].company_name).toBe('Valid Corp');
  });

  it('8. LLM mapea email a columna sin emails -> validación rechaza ese mapping', async () => {
    const buffer = makeXlsxBuffer({
      Hoja1: [
        ['Empresa', 'Sucursal', 'Observaciones'],
        ['Target SA', 'Planta Central', 'Sin correo disponible'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'Hoja1',
      header_row_index: 0,
      mapping: {
        company_name: 0,
        contact_name: null,
        phone: null,
        email: 1, // Column 1 is 'Sucursal', has no emails
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
    });

    const preview = await previewAccountList({ buffer, filename: 'noemail.xlsx' });

    // Validation must reject the invalid email column mapping
    expect(preview.mapping.email).toBeNull();
    expect(preview.rows[0].email).toBeNull();
  });

  it('9. LLM no disponible -> mapping manual funciona', async () => {
    OpenAIService.setApiKey(''); // Simulate unconfigured OpenAI
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const buffer = makeXlsxBuffer({
      Hoja1: [
        ['Nombre Comercial', 'Representante'],
        ['Manual Corp', 'Martin R.'],
      ],
    });

    const preview = await previewAccountList({
      buffer,
      filename: 'manual.xlsx',
      overrideMapping: { company_name: 0, contact_name: 1 },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(preview.llm_inferred).toBe(false);
    expect(preview.rows[0].company_name).toBe('Manual Corp');
    expect(preview.rows[0].contact_name).toBe('Martin R.');
    expect(preview.rows[0].errors).toHaveLength(0);
  });

  it('10. No se detecta empresa -> no crash; preview pide selección manual', async () => {
    const buffer = makeXlsxBuffer({
      Hoja1: [
        ['Codigo', 'Detalle'],
        ['C-01', 'Articulo de oficina'],
      ],
    });

    mockOpenAIResponse({
      sheet_name: 'Hoja1',
      header_row_index: 0,
      mapping: {
        company_name: null, // No company detected
        contact_name: null,
        phone: null,
        email: null,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
    });

    const preview = await previewAccountList({ buffer, filename: 'nocompany.xlsx' });

    expect(preview.mapping.company_name).toBeNull();
    expect(preview.valid_rows_count).toBe(0);
    expect(preview.rows[0].errors).toContain('Empresa requerida');
  });

  it('11. Cambiar mapping manual -> preview se recalcula sin nueva llamada LLM', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const buffer = makeXlsxBuffer({
      Hoja1: [
        ['Fantasia', 'Razon Social Real'],
        ['Nombre Comercial', 'Empresa Juridica SA'],
      ],
    });

    // Reprocess with manual mapping for column 1
    const preview = await previewAccountList({
      buffer,
      filename: 'recalc.xlsx',
      overrideMapping: { company_name: 1 },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(preview.rows[0].company_name).toBe('Empresa Juridica SA');
    expect(preview.rows[0].errors).toHaveLength(0);
  });

  it('12. XLSX procesado correctamente', async () => {
    const buffer = makeXlsxBuffer({
      Hoja1: [
        ['Empresa', 'Contacto', 'Email', 'Telefono'],
        ['XLSX Corp', 'Ana', 'ana@xlsx.com', '+595981123456'],
      ],
    });

    const preview = await previewAccountList({
      buffer,
      filename: 'direct.xlsx',
      overrideMapping: { company_name: 0, contact_name: 1, email: 2, phone: 3 },
    });

    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].company_name).toBe('XLSX Corp');
  });

  it('13. CSV procesado correctamente', async () => {
    const csv = 'Empresa,Contacto,Email,Telefono\nCSV Corp,Beto,beto@csv.com,+595981654321\n';
    const buffer = makeCsvBuffer(csv);

    const preview = await previewAccountList({
      buffer,
      filename: 'direct.csv',
      overrideMapping: { company_name: 0, contact_name: 1, email: 2, phone: 3 },
    });

    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].company_name).toBe('CSV Corp');
    expect(preview.rows[0].phone).toBe('+595981654321');
  });

  it('14. Tenant isolation existente sigue PASS', async () => {
    const ORG_B = '00000000-0000-0000-0000-00000000bb02';
    const rowA: AccountImportRow = {
      index: 0,
      company_name: 'Tenant A Co',
      contact_name: null,
      phone: null,
      email: null,
      country_code: 'PY',
      city: 'Asunción',
      tax_id: null,
      website: null,
      errors: [],
    };
    const rowB: AccountImportRow = {
      index: 0,
      company_name: 'Tenant B Co',
      contact_name: null,
      phone: null,
      email: null,
      country_code: 'PY',
      city: 'Asunción',
      tax_id: null,
      website: null,
      errors: [],
    };

    await commitAccountList(ORG, { lifecycleStage: 'CUSTOMER', rows: [rowA] });
    await commitAccountList(ORG_B, { lifecycleStage: 'PROSPECT', rows: [rowB] });

    const orgACompanies = await crmRepository.listCompanies(ORG);
    const orgBCompanies = await crmRepository.listCompanies(ORG_B);

    expect(orgACompanies.map((c) => c.name)).toEqual(['Tenant A Co']);
    expect(orgBCompanies.map((c) => c.name)).toEqual(['Tenant B Co']);
    expect(orgACompanies.some((c) => c.name === 'Tenant B Co')).toBe(false);
  });

  it('15. Lifecycle CUSTOMER/PROSPECT sigue PASS', async () => {
    const rowCustomer: AccountImportRow = {
      index: 0,
      company_name: 'Cliente Existente',
      contact_name: null,
      phone: null,
      email: null,
      country_code: null,
      city: null,
      tax_id: null,
      website: null,
      errors: [],
    };

    await commitAccountList(ORG, { lifecycleStage: 'CUSTOMER', rows: [rowCustomer] });
    const result = await commitAccountList(ORG, { lifecycleStage: 'PROSPECT', rows: [rowCustomer] });

    expect(result.keptCustomers).toBe(1);
    const company = (await crmRepository.listCompanies(ORG)).find((c) => c.name === 'Cliente Existente');
    expect(company?.lifecycle_stage).toBe('CUSTOMER');
  });

  it('16. Alertas solo PROSPECT siguen PASS', async () => {
    const rowProspect: AccountImportRow = {
      index: 0,
      company_name: 'Potencial Alerta',
      contact_name: null,
      phone: null,
      email: null,
      country_code: null,
      city: null,
      tax_id: null,
      website: null,
      errors: [],
    };
    const rowCurrent: AccountImportRow = {
      index: 1,
      company_name: 'Actual No Alerta',
      contact_name: null,
      phone: null,
      email: null,
      country_code: null,
      city: null,
      tax_id: null,
      website: null,
      errors: [],
    };

    await commitAccountList(ORG, { lifecycleStage: 'PROSPECT', rows: [rowProspect] });
    await commitAccountList(ORG, { lifecycleStage: 'CUSTOMER', rows: [rowCurrent] });

    const companies = await crmRepository.listCompanies(ORG);
    const potential = companies.find((c) => c.name === 'Potencial Alerta')!;
    const current = companies.find((c) => c.name === 'Actual No Alerta')!;

    await purchaseService.commitImport(ORG, {
      rows: [potential, current].flatMap((c) => [
        { company_id: c.id, purchase_date: '2026-07-01', sku: 'CUP-12OZ-SW', product_name: 'Vaso 12 oz', quantity: 5000 },
        { company_id: c.id, purchase_date: '2026-08-01', sku: 'CUP-12OZ-SW', product_name: 'Vaso 12 oz', quantity: 5000 },
        { company_id: c.id, purchase_date: '2026-09-01', sku: 'CUP-12OZ-SW', product_name: 'Vaso 12 oz', quantity: 5000 },
      ]),
    });

    const alerts = await purchaseService.getAlerts(ORG, Date.UTC(2026, 9, 5));
    expect(alerts.length).toBeGreaterThan(0);
    expect(new Set(alerts.map((a) => a.company_id))).toEqual(new Set([potential.id]));
  });

  it('17. Real spreadsheet: listado clientes acumulado 2026.xlsx with header on row 3', async () => {
    if (!fs.existsSync('listado clientes acumulado 2026.xlsx')) return;
    const buffer = fs.readFileSync('listado clientes acumulado 2026.xlsx');

    // Simulate LLM detecting header row 2 and company column 0
    mockOpenAIResponse({
      sheet_name: 'ACUMULADO',
      header_row_index: 2,
      mapping: {
        company_name: 0,
        contact_name: null,
        phone: null,
        email: null,
        country_code: null,
        city: null,
        tax_id: null,
        website: null,
      },
    });

    const preview = await previewAccountList({
      buffer,
      filename: 'listado clientes acumulado 2026.xlsx',
    });

    expect(preview.header_row_index).toBe(2);
    expect(preview.rows.length).toBeGreaterThan(0);
    expect(preview.valid_rows_count).toBeGreaterThan(0);
    expect(preview.rows[0].company_name).toBe('PARQUE SERENIDAD SRL');
  });
});
