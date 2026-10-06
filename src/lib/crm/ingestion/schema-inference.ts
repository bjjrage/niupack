import { z } from 'zod';
import * as XLSX from 'xlsx';
import { OpenAIService } from '@/lib/openai/openai-service';
import {
  ALL_CANONICAL_FIELDS,
  type DatasetType,
  type InferredSchema,
} from './types';

export interface SpreadsheetStructure {
  sheetNames: string[];
  sheets: Record<
    string,
    {
      rowCount: number;
      colCount: number;
      sampleRows: string[][];
      rawSampleRows: string[][];
    }
  >;
}

// PII Redaction Patterns
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,4}?[-.\s]?\(?\d{1,4}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9})/g;
const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
const TAX_ID_REGEX = /\b(\d{2}\.?\d{3}\.?\d{3}[/-]?\d{4}[-.]?\d{2}|\d{6,9}[-]\d{1})\b/g;

export function redactCellValue(value: unknown): string {
  if (value == null) return '';
  let str = String(value).trim();
  if (!str) return '';

  // Truncate long strings
  if (str.length > 120) str = str.slice(0, 120) + '...';

  // Redact PII
  str = str.replace(EMAIL_REGEX, '<EMAIL>');
  str = str.replace(URL_REGEX, '<URL>');
  str = str.replace(TAX_ID_REGEX, '<TAX_ID>');
  // If it still looks like a phone (contains digits with plus/hyphens and >= 7 digits)
  if (str !== '<TAX_ID>' && str.length >= 7 && /\d{7,}/.test(str.replace(/[^0-9]/g, ''))) {
    str = str.replace(PHONE_REGEX, '<PHONE>');
  }

  return str;
}

export function extractSpreadsheetStructure(buffer: Buffer): SpreadsheetStructure {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: true });
  const sheetNames = wb.SheetNames;
  const sheets: SpreadsheetStructure['sheets'] = {};

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    const rowCount = matrix.length;
    let maxCols = 0;
    const rawSampleRows: string[][] = [];
    const sampleRows: string[][] = [];

    // Take up to 20 non-empty sample rows
    for (let r = 0; r < Math.min(matrix.length, 30); r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;

      const strRow = row.slice(0, 30).map((c) => String(c ?? '').trim());
      if (strRow.every((c) => c === '')) continue;

      if (strRow.length > maxCols) maxCols = strRow.length;

      rawSampleRows.push(strRow);
      sampleRows.push(strRow.map(redactCellValue));

      if (sampleRows.length >= 20) break;
    }

    sheets[name] = {
      rowCount,
      colCount: maxCols,
      sampleRows,
      rawSampleRows,
    };
  }

  return { sheetNames, sheets };
}

const InferredSchemaZod = z.object({
  dataset_type: z.enum(['ACCOUNT_LIST', 'TRANSACTION_HISTORY', 'MIXED_TRANSACTIONAL_EXPORT']),
  sheet_name: z.string().min(1),
  header_row_index: z.number().int().min(0),
  mapping: z.record(z.string(), z.number().int().min(0).nullable()),
  confidence: z.record(z.string(), z.number().nullable()).optional(),
});

const INGESTION_SYSTEM_PROMPT = `Sos un motor de inteligencia comercial para NIUPACK (fabricante industrial de packaging y vasos).
Tu tarea es analizar la estructura muestral de un archivo subido (Excel/CSV) y devolver un JSON estructurado con:
1. dataset_type:
   - "ACCOUNT_LIST": si es un directorio/padrón de clientes o empresas (contiene nombres de empresa, contactos, teléfonos, correos, ciudades, sin movimientos transaccionales de venta).
   - "TRANSACTION_HISTORY": si es un listado de ventas, pedidos, despachos o facturación histórica (contiene fechas de compra, productos, cantidades, comprobantes/facturas, precios o importes).
   - "MIXED_TRANSACTIONAL_EXPORT": si es una exportación completa de ERP que contiene TANTO datos de la cuenta/contacto (nombre, teléfono, email, RUC) COMO cada movimiento de venta (fecha, producto, cantidad, factura).

2. sheet_name: el nombre exacto de la hoja que contiene la tabla principal de datos. Si hay hojas vacías o de notas, ignorarlas.

3. header_row_index: índice 0-based de la fila donde están los nombres reales de las columnas (generalmente fila 0, pero puede haber títulos decorativos en las filas 0 o 1, y los encabezados estar en la 2 o 3).

4. mapping: objeto JSON donde las claves son EXCLUSIVAMENTE los campos canónicos aplicables:
   Campos para cuentas:
   - company_name
   - contact_name
   - phone
   - email
   - country_code
   - city
   - tax_id
   - website

   Campos para compras/transacciones:
   - customer_name
   - tax_id
   - purchase_date
   - product_description
   - sku
   - quantity
   - document_number
   - line_number
   - unit_price
   - total_value
   - currency

   Los valores son el índice entero 0-based de la columna en la fila de cabecera, o null si no existe.

5. confidence: número entre 0.0 y 1.0 indicando tu certeza sobre cada mapeo.

REGLAS ESTRICTAS:
- No inventes campos fuera de la lista canónica.
- Devolvé ÚNICAMENTE JSON válido, sin bloques markdown ni texto explicativo.`;

export async function inferCommercialFileSchema(
  structure: SpreadsheetStructure,
): Promise<InferredSchema | null> {
  if (structure.sheetNames.length === 0) return null;

  const summary = structure.sheetNames.map((name) => {
    const s = structure.sheets[name];
    return {
      sheet_name: name,
      total_rows: s?.rowCount ?? 0,
      total_columns: s?.colCount ?? 0,
      sample_rows: (s?.sampleRows ?? []).slice(0, 15),
    };
  });

  const prompt = `Analiza la estructura de este archivo y responde con el JSON de esquema según las instrucciones:\n\n${JSON.stringify(
    summary,
    null,
    2,
  )}`;

  try {
    const apiKey = OpenAIService.getApiKey();
    if (!apiKey) return null;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: INGESTION_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const validated = InferredSchemaZod.parse(parsed);

    // Validate that sheet_name exists in the spreadsheet
    if (!structure.sheetNames.includes(validated.sheet_name)) {
      validated.sheet_name = structure.sheetNames[0];
    }

    // Validate header_row_index within sample range
    const targetSheet = structure.sheets[validated.sheet_name];
    if (targetSheet && validated.header_row_index >= targetSheet.rowCount) {
      validated.header_row_index = 0;
    }

    // Sanitize mapping keys to only valid canonical fields
    const sanitizedMapping: Record<string, number | null> = {};
    const maxCols = targetSheet?.colCount ?? 50;

    for (const key of ALL_CANONICAL_FIELDS) {
      const idx = validated.mapping[key];
      if (typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < maxCols) {
        sanitizedMapping[key] = idx;
      } else {
        sanitizedMapping[key] = null;
      }
    }

    return {
      dataset_type: validated.dataset_type as DatasetType,
      sheet_name: validated.sheet_name,
      header_row_index: validated.header_row_index,
      mapping: sanitizedMapping,
      confidence: (validated.confidence as Record<string, number | null>) ?? {},
    };
  } catch {
    return null;
  }
}
