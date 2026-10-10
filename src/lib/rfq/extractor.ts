/**
 * Extracción heurística de cotizaciones desde texto (PDF/correo). Conservadora y honesta:
 * - Solo devuelve lo que el texto dice, con la evidencia literal.
 * - Cada dato es EXTRACTED, INFERRED o MISSING; nada queda "validado" hasta que lo confirma una persona.
 * - No hay valores por defecto, SKU por defecto ni confianza numérica inventada.
 */

export type FieldState = 'EXTRACTED' | 'INFERRED' | 'MISSING';

export interface ExtractedField<T> { value: T | null; state: FieldState; evidence?: string }

export interface ExtractedItem {
  rfq_item_id: string | null;
  match: 'SKU_EN_LINEA' | 'UNICO_ITEM_INFERIDO' | 'SIN_MATCH';
  unit_price: ExtractedField<number>;
  moq: ExtractedField<number>;
  line_evidence: string;
}

export interface ExtractedQuote {
  currency: ExtractedField<string>;
  incoterm: ExtractedField<string>;
  payment_terms: ExtractedField<string>;
  lead_time_days: ExtractedField<number>;
  validity_date: ExtractedField<string>;
  items: ExtractedItem[];
  found: number;
  missing: string[];
  needs_human_validation: true;
  quality: 'BAJA' | 'MEDIA';
}

const missing = <T>(): ExtractedField<T> => ({ value: null, state: 'MISSING' });
const snippet = (text: string, index: number, length: number) => text.slice(Math.max(0, index - 20), index + length + 40).replace(/\s+/g, ' ').trim();

const CURRENCY_PATTERNS: Array<[string, RegExp]> = [
  ['USD', /\b(?:USD|US\$|U\$S|d[oó]lares?(?:\s+americanos)?)\b|\bU\$D\b/i],
  ['BRL', /\bBRL\b|\bR\$|\breais\b/i],
  ['EUR', /\bEUR\b|€|\beuros?\b/i],
  ['PYG', /\bPYG\b|\bGs\.?\s?\d|\bguaran[ií]es?\b/i],
  ['ARS', /\bARS\b|\bpesos argentinos\b/i],
  ['CNY', /\bCNY\b|\bRMB\b|\byuan\b/i],
];

const INCOTERMS = ['EXW', 'FOB', 'CIF', 'CIP', 'DDP'];

function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /,\d{1,4}$/.test(s) && (s.match(/,/g) ?? []).length === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0 && (s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

/** Cantidades enteras (MOQ): 50.000 y 50,000 son cincuenta mil, nunca cincuenta. */
function parseQuantity(raw: string): number | null {
  const cleaned = raw.trim().replace(/[.,](?=\d{3}(?:\D|$))/g, '').replace(/[^\d]/g, '');
  const value = Number(cleaned);
  return cleaned && Number.isFinite(value) && value > 0 ? value : null;
}

function parseDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const local = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(raw);
  let y: number, m: number, d: number;
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (local) { d = +local[1]; m = +local[2]; y = +local[3]; if (y < 100) y += 2000; }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

export function extractQuoteFromText(text: string, rfqItems: Array<{ id: string; sku: string }>): ExtractedQuote {
  const body = text.replace(/\r/g, '');

  const currencies = CURRENCY_PATTERNS.filter(([, re]) => re.test(body)).map(([code]) => code);
  const currency: ExtractedField<string> = currencies.length === 1
    ? { value: currencies[0], state: 'EXTRACTED', evidence: snippet(body, Math.max(0, body.search(CURRENCY_PATTERNS.find(([c]) => c === currencies[0])![1])), 8) }
    : missing();

  const incotermHit = new RegExp(`\\b(${INCOTERMS.join('|')})\\b`).exec(body.toUpperCase());
  const incoterm: ExtractedField<string> = incotermHit
    ? { value: incotermHit[1], state: 'EXTRACTED', evidence: snippet(body, incotermHit.index, incotermHit[0].length) } : missing();

  const payment = /(?:condiciones?\s+de\s+pago|forma\s+de\s+pago|payment\s+terms?|condi[cç][oõ]es\s+de\s+pagamento)\s*[:\-]\s*([^\n]{3,90})/i.exec(body);
  const payment_terms: ExtractedField<string> = payment ? { value: payment[1].trim(), state: 'EXTRACTED', evidence: snippet(body, payment.index, payment[0].length) } : missing();

  const lead = /(?:plazo\s+de\s+entrega|tiempo\s+de\s+entrega|lead\s*time|prazo\s+de\s+entrega|entrega\s+en)[^\d\n]{0,30}(\d{1,3})\s*(d[ií]as?|dias|days?|semanas?|weeks?)/i.exec(body);
  let lead_time_days: ExtractedField<number> = missing();
  if (lead) {
    const n = Number(lead[1]);
    lead_time_days = { value: /sem|week/i.test(lead[2]) ? n * 7 : n, state: 'EXTRACTED', evidence: snippet(body, lead.index, lead[0].length) };
  }

  const validity = /(?:validez|vigencia|validade|v[aá]lid[ao]\s+hasta|valid\s+until|valid(?:ity)?)[^\d\n]{0,25}(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i.exec(body);
  const validityDate = validity ? parseDate(validity[1]) : null;
  const validity_date: ExtractedField<string> = validityDate ? { value: validityDate, state: 'EXTRACTED', evidence: snippet(body, validity!.index, validity![0].length) } : missing();

  const items: ExtractedItem[] = [];
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const priceRe = /(?:precio\s+unitario|unit(?:ary)?\s+price|pre[cç]o\s+unit[aá]rio|price|precio|valor\s+unit(?:ario)?)[^\d\n]{0,25}([\d][\d.,]*)/i;
  const moqRe = /(?:moq|pedido\s+m[ií]nimo|cantidad\s+m[ií]nima|quantidade\s+m[ií]nima|minimum\s+order)[^\d\n]{0,20}([\d][\d.,]*)/i;

  for (const item of rfqItems) {
    const sku = item.sku.toLowerCase();
    const idx = lines.findIndex((l) => l.toLowerCase().includes(sku));
    if (idx < 0) continue;
    // Ventana de la línea del SKU y la siguiente: el precio debe aparecer pegado a su SKU, no en cualquier parte del documento.
    const window = [lines[idx], lines[idx + 1] ?? ''].join(' ');
    const priceHit = priceRe.exec(window) ?? /(?:^|[\s:=])(\d{1,6}[.,]\d{2,5})\b/.exec(lines[idx].replace(new RegExp(item.sku, 'ig'), ' '));
    const moqHit = moqRe.exec(window);
    const price = priceHit ? parseNumber(priceHit[1]) : null;
    items.push({
      rfq_item_id: item.id, match: 'SKU_EN_LINEA',
      unit_price: price && price > 0 ? { value: price, state: 'EXTRACTED', evidence: window.slice(0, 160) } : missing(),
      moq: moqHit && parseQuantity(moqHit[1]) ? { value: parseQuantity(moqHit[1]), state: 'EXTRACTED', evidence: window.slice(0, 160) } : missing(),
      line_evidence: window.slice(0, 160),
    });
  }

  // Un único ítem en la RFQ y un único precio rotulado en el documento: se propone, pero queda como INFERIDO.
  if (items.length === 0 && rfqItems.length === 1) {
    const prices = [...body.matchAll(new RegExp(priceRe.source, 'gi'))];
    if (prices.length === 1 && parseNumber(prices[0][1])) {
      const moqHit = moqRe.exec(body);
      items.push({
        rfq_item_id: rfqItems[0].id, match: 'UNICO_ITEM_INFERIDO',
        unit_price: { value: parseNumber(prices[0][1]), state: 'INFERRED', evidence: snippet(body, prices[0].index ?? 0, prices[0][0].length) },
        moq: moqHit && parseQuantity(moqHit[1]) ? { value: parseQuantity(moqHit[1]), state: 'INFERRED', evidence: snippet(body, moqHit.index, moqHit[0].length) } : missing(),
        line_evidence: snippet(body, prices[0].index ?? 0, prices[0][0].length),
      });
    }
  }

  const headerFields = { currency, incoterm, payment_terms, lead_time_days, validity_date };
  const found = Object.values(headerFields).filter((f) => f.state !== 'MISSING').length + items.filter((i) => i.unit_price.state !== 'MISSING').length;
  const missingNames = [
    ...Object.entries(headerFields).filter(([, f]) => f.state === 'MISSING').map(([k]) => k),
    ...rfqItems.filter((r) => !items.some((i) => i.rfq_item_id === r.id && i.unit_price.state !== 'MISSING')).map((r) => `unit_price:${r.sku}`),
  ];
  return { ...headerFields, items, found, missing: missingNames, needs_human_validation: true, quality: missingNames.length <= 2 && items.length > 0 ? 'MEDIA' : 'BAJA' };
}
