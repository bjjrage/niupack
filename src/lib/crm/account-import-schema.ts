import * as XLSX from 'xlsx';
import { z } from 'zod';
import { OpenAIService } from '@/lib/openai/openai-service';
import { normalizePhone } from '@/lib/niupackbot/outreach/phone';

// --- ACCOUNT LIST CANONICAL FIELDS ---
export const ACCOUNT_CANONICAL_FIELDS = [
  'company_name',
  'contact_name',
  'phone',
  'email',
  'country_code',
  'city',
  'tax_id',
  'website',
] as const;

// Backward-compatible alias
export const CANONICAL_FIELDS = ACCOUNT_CANONICAL_FIELDS;

export type CanonicalField = (typeof ACCOUNT_CANONICAL_FIELDS)[number];
export type ColumnMapping = Record<CanonicalField, number | null>;
export type ConfidenceMapping = Partial<Record<CanonicalField, number | null>>;

export interface InferredSpreadsheetSchema {
  sheet_name: string;
  header_row_index: number;
  mapping: ColumnMapping;
  confidence: ConfidenceMapping;
}

// --- PURCHASE HISTORY CANONICAL FIELDS ---
export const PURCHASE_CANONICAL_FIELDS = [
  'customer_name',
  'tax_id',
  'purchase_date',
  'product_description',
  'sku',
  'quantity',
  'document_number',
  'line_number',
  'unit_price',
  'total_value',
  'currency',
] as const;

export type PurchaseCanonicalField = (typeof PURCHASE_CANONICAL_FIELDS)[number];
export type PurchaseColumnMapping = Record<PurchaseCanonicalField, number | null>;
export type PurchaseConfidenceMapping = Partial<Record<PurchaseCanonicalField, number | null>>;

export interface InferredPurchaseSpreadsheetSchema {
  sheet_name: string;
  header_row_index: number;
  mapping: PurchaseColumnMapping;
  confidence: PurchaseConfidenceMapping;
}

// --- WORKBOOK STRUCTURE TYPES ---
export interface SheetStructureSample {
  name: string;
  rowCount: number;
  colCount: number;
  sampleRows: string[][];
  rawSampleRows: string[][];
}

export interface WorkbookStructure {
  sheets: Record<string, SheetStructureSample>;
  sheetNames: string[];
}

export const SYSTEM_PROMPT = `Sos un analizador de planillas comerciales.

Tu única tarea es interpretar la estructura de un archivo que contiene un listado de empresas/clientes.

Debés determinar:

1. cuál sheet contiene el listado principal;
2. cuál fila contiene los encabezados reales;
3. qué columna corresponde a cada campo canónico.

Campos canónicos:

company_name:
nombre de empresa, razón social, cliente, cuenta comercial

contact_name:
persona de contacto, responsable, ejecutivo/contacto de la empresa

phone:
teléfono, celular, móvil, WhatsApp

email:
correo electrónico

country_code:
país o código de país

city:
ciudad, localidad, municipio

tax_id:
RUC, NIT, CUIT, tax id, identificación fiscal

website:
sitio web, página web

Usá tanto el texto de los encabezados como los patrones de datos de muestra.

No inventes columnas.

Si un campo no existe, devolvé null.

No transformes datos.

No clasifiques clientes.

No hagas deduplicación.

No devuelvas texto explicativo.

Devolvé exclusivamente JSON.`;

export const PURCHASE_SYSTEM_PROMPT = `Sos un analizador de planillas comerciales de compras y facturación histórica.

Tu única tarea es interpretar la estructura de un archivo que contiene un historial de ventas/compras o facturación.

Debés determinar:

1. cuál sheet contiene el listado principal de compras/movimientos;
2. cuál fila contiene los encabezados reales;
3. qué columna corresponde a cada campo canónico.

Campos canónicos:

customer_name:
cliente, empresa, razón social, cuenta, comprador

tax_id:
RUC, CUIT, CNPJ, NIT, documento fiscal

purchase_date:
fecha, data, date, fecha factura, fecha emisión, fecha compra, fechafacturacion

product_description:
producto, descripción, item, mercadería, detalle, sub-linea

sku:
código, sku, código artículo, código producto, item code

quantity:
cantidad, un, unidades, cant, volumen, qty

document_number:
número de factura, factura, nro doc, comprobante, nota fiscal, facturanº

line_number:
línea, item, renglón, seq, secuencia

unit_price:
precio unitario, valor unitario, unit price, importe unitario, importe

total_value:
importe total, total, total facturado, valor total, monto

currency:
moneda, currency, símbolo de moneda

Usá tanto el texto de los encabezados como los patrones de datos de muestra.

No inventes columnas.

Si un campo no existe, devolvé null.

No transformes datos.

No clasifiques clientes.

No hagas deduplicación.

No devuelvas texto explicativo.

Devolvé exclusivamente JSON.`;

const llmResponseSchema = z.object({
  sheet_name: z.string(),
  header_row_index: z.number().int().min(0),
  mapping: z.object({
    company_name: z.number().int().min(0).nullable(),
    contact_name: z.number().int().min(0).nullable(),
    phone: z.number().int().min(0).nullable(),
    email: z.number().int().min(0).nullable(),
    country_code: z.number().int().min(0).nullable(),
    city: z.number().int().min(0).nullable(),
    tax_id: z.number().int().min(0).nullable(),
    website: z.number().int().min(0).nullable(),
  }),
  confidence: z.record(z.string(), z.number().nullable()).optional(),
});

const purchaseLlmResponseSchema = z.object({
  sheet_name: z.string(),
  header_row_index: z.number().int().min(0),
  mapping: z.object({
    customer_name: z.number().int().min(0).nullable(),
    tax_id: z.number().int().min(0).nullable(),
    purchase_date: z.number().int().min(0).nullable(),
    product_description: z.number().int().min(0).nullable(),
    sku: z.number().int().min(0).nullable(),
    quantity: z.number().int().min(0).nullable(),
    document_number: z.number().int().min(0).nullable(),
    line_number: z.number().int().min(0).nullable(),
    unit_price: z.number().int().min(0).nullable(),
    total_value: z.number().int().min(0).nullable(),
    currency: z.number().int().min(0).nullable(),
  }),
  confidence: z.record(z.string(), z.number().nullable()).optional(),
});

/**
 * Reduce PII before sending sample rows to LLM:
 * - emails -> <EMAIL>
 * - URLs -> <URL>
 * - Tax IDs -> <TAX_ID>
 * - Phone numbers -> <PHONE>
 * - Truncate long strings to 50 chars
 */
export function redactPII(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str) return '';

  // Emails
  str = str.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<EMAIL>');

  // URLs
  str = str.replace(/https?:\/\/[^\s]+|www\.[^\s]+/gi, '<URL>');

  // Tax IDs (RUC, CUIT, NIT, etc. with dashes or slashes)
  str = str.replace(/\b\d{5,11}[-\/]\d{1,2}\b/g, '<TAX_ID>');
  str = str.replace(/\b\d{2}[-.]\d{7,8}[-.]\d\b/g, '<TAX_ID>');

  // Phone numbers: strings with 6+ digits and phone-like characters
  if (/(\+?\d[\d\s\-().]{6,}\d)/.test(str)) {
    str = str.replace(/(\+?\d[\d\s\-().]{6,}\d)/g, '<PHONE>');
  }

  // Truncate long strings
  if (str.length > 50) {
    str = str.slice(0, 47) + '...';
  }

  return str;
}

/**
 * Extracts workbook structure taking up to 15 non-empty rows per sheet.
 */
export function extractSpreadsheetStructure(buffer: Buffer): WorkbookStructure {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: true });
  const sheetNames = wb.SheetNames || [];
  const sheets: Record<string, SheetStructureSample> = {};

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rawAoA = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

    const rawSlice = rawAoA.slice(0, 15);
    const maxCols = Math.min(Math.max(...rawSlice.map((r) => (Array.isArray(r) ? r.length : 0)), 1), 30);

    const rawSampleRows = rawSlice.map((r) => {
      const row = Array.isArray(r) ? r : [];
      const cells: string[] = [];
      for (let c = 0; c < maxCols; c++) {
        cells.push(String(row[c] ?? '').trim());
      }
      return cells;
    });

    const sampleRows = rawSampleRows.map((row) => row.map((cell) => redactPII(cell)));

    sheets[name] = {
      name,
      rowCount: rawAoA.length,
      colCount: maxCols,
      sampleRows,
      rawSampleRows,
    };
  }

  return { sheets, sheetNames };
}

/**
 * Validates LLM schema output for ACCOUNT_LIST via Zod, checks bounds, collision, and validates data plausibility.
 */
export function validateAndSanitizeInferredSchema(
  raw: unknown,
  structure: WorkbookStructure,
): InferredSpreadsheetSchema | null {
  const parsed = llmResponseSchema.safeParse(raw);
  if (!parsed.success) return null;

  const data = parsed.data;
  if (!structure.sheetNames.includes(data.sheet_name)) return null;

  const sheetSample = structure.sheets[data.sheet_name];
  if (!sheetSample) return null;

  if (data.header_row_index >= sheetSample.rawSampleRows.length) return null;

  const colCount = sheetSample.colCount;
  const mapping: ColumnMapping = { ...data.mapping };
  const confidence: ConfidenceMapping = { ...(data.confidence ?? {}) };

  // Validate column bounds
  for (const field of ACCOUNT_CANONICAL_FIELDS) {
    const idx = mapping[field];
    if (idx !== null && (idx < 0 || idx >= colCount)) {
      mapping[field] = null;
      confidence[field] = null;
    }
  }

  // Check collision: no two fields can map to the same column index
  const seenIndices = new Map<number, CanonicalField>();
  const priorityOrder: CanonicalField[] = [
    'company_name',
    'tax_id',
    'contact_name',
    'email',
    'phone',
    'country_code',
    'city',
    'website',
  ];

  for (const field of priorityOrder) {
    const idx = mapping[field];
    if (idx !== null) {
      if (seenIndices.has(idx)) {
        mapping[field] = null;
        confidence[field] = null;
      } else {
        seenIndices.set(idx, field);
      }
    }
  }

  // Semantic data plausibility check using raw unredacted sample rows
  const dataRows = sheetSample.rawSampleRows.slice(data.header_row_index + 1);
  if (dataRows.length > 0) {
    if (mapping.email !== null) {
      const emailCol = mapping.email;
      const hasValidEmail = dataRows.some((r) => {
        const val = r[emailCol] ?? '';
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      });
      if (!hasValidEmail) {
        mapping.email = null;
        confidence.email = null;
      }
    }

    if (mapping.phone !== null) {
      const phoneCol = mapping.phone;
      const hasValidPhone = dataRows.some((r) => {
        const val = r[phoneCol] ?? '';
        return /\d[\d\s\-().]{4,}\d/.test(val) || normalizePhone(val).ok;
      });
      if (!hasValidPhone) {
        mapping.phone = null;
        confidence.phone = null;
      }
    }

    if (mapping.website !== null) {
      const webCol = mapping.website;
      const hasValidWeb = dataRows.some((r) => {
        const val = r[webCol] ?? '';
        return /https?:\/\/|www\.|\.[a-z]{2,}(\/|\?|$)/i.test(val);
      });
      if (!hasValidWeb) {
        mapping.website = null;
        confidence.website = null;
      }
    }

    if (mapping.company_name !== null) {
      const compCol = mapping.company_name;
      const hasValidCompany = dataRows.some((r) => {
        const val = (r[compCol] ?? '').trim();
        return val.length >= 2;
      });
      if (!hasValidCompany) {
        mapping.company_name = null;
        confidence.company_name = null;
      }
    }

    if (mapping.tax_id !== null) {
      const taxCol = mapping.tax_id;
      const hasValidTax = dataRows.some((r) => {
        const val = (r[taxCol] ?? '').trim();
        return /\d{4,}/.test(val) || /[A-Za-z0-9]+[-/][A-Za-z0-9]+/.test(val);
      });
      if (!hasValidTax) {
        mapping.tax_id = null;
        confidence.tax_id = null;
      }
    }
  }

  return {
    sheet_name: data.sheet_name,
    header_row_index: data.header_row_index,
    mapping,
    confidence,
  };
}

/**
 * Validates LLM schema output for PURCHASE_HISTORY via Zod, checks bounds, collision, and validates data plausibility.
 */
export function validateAndSanitizePurchaseSchema(
  raw: unknown,
  structure: WorkbookStructure,
): InferredPurchaseSpreadsheetSchema | null {
  const parsed = purchaseLlmResponseSchema.safeParse(raw);
  if (!parsed.success) return null;

  const data = parsed.data;
  if (!structure.sheetNames.includes(data.sheet_name)) return null;

  const sheetSample = structure.sheets[data.sheet_name];
  if (!sheetSample) return null;

  if (data.header_row_index >= sheetSample.rawSampleRows.length) return null;

  const colCount = sheetSample.colCount;
  const mapping: PurchaseColumnMapping = { ...data.mapping };
  const confidence: PurchaseConfidenceMapping = { ...(data.confidence ?? {}) };

  // Validate column bounds
  for (const field of PURCHASE_CANONICAL_FIELDS) {
    const idx = mapping[field];
    if (idx !== null && (idx < 0 || idx >= colCount)) {
      mapping[field] = null;
      confidence[field] = null;
    }
  }

  // Check collision: priority order
  const seenIndices = new Map<number, PurchaseCanonicalField>();
  const priorityOrder: PurchaseCanonicalField[] = [
    'customer_name',
    'purchase_date',
    'product_description',
    'sku',
    'quantity',
    'document_number',
    'line_number',
    'unit_price',
    'total_value',
    'tax_id',
    'currency',
  ];

  for (const field of priorityOrder) {
    const idx = mapping[field];
    if (idx !== null) {
      if (seenIndices.has(idx)) {
        mapping[field] = null;
        confidence[field] = null;
      } else {
        seenIndices.set(idx, field);
      }
    }
  }

  // Data plausibility
  const dataRows = sheetSample.rawSampleRows.slice(data.header_row_index + 1);
  if (dataRows.length > 0) {
    if (mapping.customer_name !== null) {
      const col = mapping.customer_name;
      const hasValid = dataRows.some((r) => (r[col] ?? '').trim().length >= 2);
      if (!hasValid) {
        mapping.customer_name = null;
        confidence.customer_name = null;
      }
    }

    if (mapping.purchase_date !== null) {
      const col = mapping.purchase_date;
      const hasValidDate = dataRows.some((r) => {
        const val = (r[col] ?? '').trim();
        if (!val) return false;
        // Excel serial number or date string
        if (/^\d{4,5}$/.test(val)) return true;
        if (/^\d{4}-\d{2}-\d{2}/.test(val)) return true;
        if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(val)) return true;
        return false;
      });
      if (!hasValidDate) {
        mapping.purchase_date = null;
        confidence.purchase_date = null;
      }
    }

    if (mapping.quantity !== null) {
      const col = mapping.quantity;
      const hasValidQty = dataRows.some((r) => {
        const val = (r[col] ?? '').trim().replace(/\./g, '').replace(',', '.');
        const num = Number(val);
        return Number.isFinite(num) && num > 0;
      });
      if (!hasValidQty) {
        mapping.quantity = null;
        confidence.quantity = null;
      }
    }

    if (mapping.product_description !== null) {
      const col = mapping.product_description;
      const hasValid = dataRows.some((r) => (r[col] ?? '').trim().length >= 2);
      if (!hasValid) {
        mapping.product_description = null;
        confidence.product_description = null;
      }
    }
  }

  return {
    sheet_name: data.sheet_name,
    header_row_index: data.header_row_index,
    mapping,
    confidence,
  };
}

/**
 * Calls OpenAI to infer spreadsheet schema for ACCOUNT_LIST.
 */
export async function inferAccountSpreadsheetSchema(
  structure: WorkbookStructure,
): Promise<InferredSpreadsheetSchema | null> {
  if (!OpenAIService.isConfigured()) {
    return null;
  }

  const payload = {
    sheets: structure.sheetNames.map((name) => ({
      sheet_name: name,
      sample_rows: structure.sheets[name]?.sampleRows || [],
    })),
  };

  const userPrompt = `Analizá las siguientes hojas y muestras de datos para determinar la hoja principal, el índice de fila de encabezados (0-based) y el índice de columna (0-based) para cada campo canónico.

Devolvé un objeto JSON con este esquema exacto:
{
  "sheet_name": "nombre_de_la_hoja",
  "header_row_index": 0,
  "mapping": {
    "company_name": 0,
    "contact_name": 1,
    "phone": 2,
    "email": 3,
    "country_code": null,
    "city": null,
    "tax_id": null,
    "website": null
  },
  "confidence": {
    "company_name": 0.99,
    "contact_name": 0.9,
    "phone": 0.9,
    "email": 0.9,
    "country_code": null,
    "city": null,
    "tax_id": null,
    "website": null
  }
}

Estructura de las hojas del archivo:
${JSON.stringify(payload, null, 2)}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OpenAIService.getApiKey()}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return validateAndSanitizeInferredSchema(parsed, structure);
  } catch {
    return null;
  }
}

/**
 * Calls OpenAI to infer spreadsheet schema for PURCHASE_HISTORY.
 */
export async function inferPurchaseSpreadsheetSchema(
  structure: WorkbookStructure,
): Promise<InferredPurchaseSpreadsheetSchema | null> {
  if (!OpenAIService.isConfigured()) {
    return null;
  }

  const payload = {
    sheets: structure.sheetNames.map((name) => ({
      sheet_name: name,
      sample_rows: structure.sheets[name]?.sampleRows || [],
    })),
  };

  const userPrompt = `Analizá las siguientes hojas y muestras de datos para determinar la hoja principal que contiene el historial de compras/ventas, el índice de fila de encabezados (0-based) y el índice de columna (0-based) para cada campo canónico.

Devolvé un objeto JSON con este esquema exacto:
{
  "sheet_name": "nombre_de_la_hoja",
  "header_row_index": 0,
  "mapping": {
    "customer_name": 0,
    "tax_id": null,
    "purchase_date": 1,
    "product_description": 2,
    "sku": null,
    "quantity": 3,
    "document_number": null,
    "line_number": null,
    "unit_price": null,
    "total_value": null,
    "currency": null
  },
  "confidence": {
    "customer_name": 0.99,
    "purchase_date": 0.95,
    "product_description": 0.9,
    "quantity": 0.95
  }
}

Estructura de las hojas del archivo:
${JSON.stringify(payload, null, 2)}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OpenAIService.getApiKey()}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PURCHASE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return validateAndSanitizePurchaseSchema(parsed, structure);
  } catch {
    return null;
  }
}
