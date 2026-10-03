// Normalización + matching de clientes/productos + fingerprint estable.
// Sin dependencias nuevas: regex + crypto node.

import { createHash } from 'node:crypto';

const COMPANY_SUFFIXES =
  /\b(s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|ltda\.?|ltd\.?|cia\.?|cia\s?ltda|s\.?\s?a\.?\s?s\.?|eireli|sas|inc\.?|corp\.?|gmbh|pty)\b\.?/gi;

const PUNCT = /[.,;:"'“”‘’()\-_/\\|@#]/g;

/** minúsculas, sin puntuación, sin espacios múltiples, sin razón social común. */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return '';
  let s = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(PUNCT, ' ');
  s = s.replace(COMPANY_SUFFIXES, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizeSku(input: string | null | undefined): string {
  return (input ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function digitsOnly(input: string | null | undefined): string {
  return (input ?? '').replace(/\D/g, '');
}

export interface CompanyRef {
  id: string;
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  external_id?: string | null;
}

export interface SkuRef {
  sku: string;
  name: string;
  product_id?: string | null;
}

/** 1 tax_id (dígitos) → 2 alias → 3 nombre normalizado. Retorna match único o candidatos. */
export function matchCompany(
  input: { cliente?: string | null; tax_id?: string | null; external_id?: string | null },
  companies: CompanyRef[],
  aliases: Array<{ alias_normalized: string; company_id: string }>,
): { company_id: string | null; candidates: Array<{ id: string; name: string }> | null } {
  const tax = digitsOnly(input.tax_id);
  if (tax) {
    const hit = companies.find((c) => digitsOnly(c.tax_id) && digitsOnly(c.tax_id) === tax);
    if (hit) return { company_id: hit.id, candidates: null };
  }
  if (input.external_id) {
    const ext = normalizeSku(input.external_id);
    const hit = companies.find(
      (c) => (c.external_id && normalizeSku(c.external_id) === ext) || digitsOnly(c.external_id) === digitsOnly(input.external_id),
    );
    if (hit) return { company_id: hit.id, candidates: null };
  }
  const norm = normalizeName(input.cliente);
  if (!norm) return { company_id: null, candidates: null };
  const alias = aliases.find((a) => a.alias_normalized === norm);
  if (alias && companies.some((c) => c.id === alias.company_id)) {
    return { company_id: alias.company_id, candidates: null };
  }
  const hits = companies.filter((c) => {
    const names = [normalizeName(c.name), normalizeName(c.legal_name)];
    return names.some((n) => n && (n === norm || n.includes(norm) || norm.includes(n)));
  });
  if (hits.length === 1) return { company_id: hits[0].id, candidates: null };
  if (hits.length > 1) {
    const exact = hits.filter((c) => normalizeName(c.name) === norm || normalizeName(c.legal_name) === norm);
    if (exact.length === 1) return { company_id: exact[0].id, candidates: null };
    return { company_id: null, candidates: hits.map((c) => ({ id: c.id, name: c.name })) };
  }
  return { company_id: null, candidates: null };
}

/** 1 SKU exacto → 2 alias → 3 nombre normalizado. Nunca inventa SKU. */
export function matchProduct(
  input: { producto?: string | null },
  skus: SkuRef[],
  aliases: Array<{ alias_normalized: string; sku: string }>,
): { sku: string | null; product_name: string | null; candidates: Array<{ sku: string; name: string }> | null } {
  const raw = (input.producto ?? '').trim();
  if (!raw) return { sku: null, product_name: null, candidates: null };
  const exact = skus.find((s) => normalizeSku(s.sku) === normalizeSku(raw));
  if (exact) return { sku: exact.sku, product_name: exact.name, candidates: null };
  const norm = normalizeName(raw);
  const alias = aliases.find((a) => a.alias_normalized === norm);
  if (alias) {
    const target = skus.find((s) => normalizeSku(s.sku) === normalizeSku(alias.sku));
    return { sku: alias.sku, product_name: target?.name ?? raw, candidates: null };
  }
  const hits = skus.filter((s) => {
    const n = normalizeName(s.name);
    return n && (n === norm || n.includes(norm) || norm.includes(n));
  });
  if (hits.length === 1) return { sku: hits[0].sku, product_name: hits[0].name, candidates: null };
  if (hits.length > 1) return { sku: null, product_name: raw, candidates: hits.map((s) => ({ sku: s.sku, name: s.name })) };
  // Sin match: se conserva el nombre original, SKU = original normalizado (no inventado del master).
  return { sku: normalizeSku(raw).slice(0, 80) || null, product_name: raw.slice(0, 200), candidates: null };
}

/** Fingerprint estable para filas sin documento (evita duplicados al reimportar). */
export function purchaseFingerprint(input: {
  organization_id: string;
  company_id: string;
  purchase_date: string;
  document?: string | null;
  sku: string;
  quantity: number;
}): string {
  const base = [
    input.organization_id,
    input.company_id,
    input.purchase_date,
    normalizeName(input.document ?? ''),
    normalizeSku(input.sku),
    String(input.quantity),
  ].join('|');
  return createHash('sha256').update(base, 'utf8').digest('hex').slice(0, 32);
}

/** Mapeo automático de columnas por encabezados ES/PT. */
export function autoMapColumns(columns: string[]): Record<string, string> {
  const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const wants: Record<string, string[]> = {
    cliente: ['cliente', 'client', 'razao social', 'razon social', 'empresa', 'customer', 'nombre'],
    tax_id: ['tax id', 'taxid', 'cnpj', 'cuit', 'ruc', 'nit', 'documento fiscal', 'cuit/cnpj'],
    fecha: ['fecha', 'data', 'date', 'dt compra', 'emision', 'emissao'],
    producto: ['producto', 'produto', 'product', 'sku', 'codigo', 'descri'],
    cantidad: ['cantidad', 'quantidade', 'quantity', 'qtd', 'qty', 'volumen', 'unidades'],
    documento: ['documento', 'document', 'nota', 'nfe', 'factura', 'fatura', 'nro doc', 'numero'],
    linea: ['linea', 'linha', 'line', 'item', 'seq'],
    precio: ['precio', 'preco', 'price', 'unitario', 'valor unit'],
    total: ['total', 'importe', 'valor total', 'amount'],
    moneda: ['moneda', 'moeda', 'currency'],
    contacto: ['contacto', 'contato', 'contact'],
    pais: ['pais', 'país', 'country'],
  };
  const mapping: Record<string, string> = {};
  for (const col of columns) {
    const n = norm(col);
    for (const [field, keys] of Object.entries(wants)) {
      if (!mapping[field] && keys.some((k) => n.includes(k))) {
        mapping[field] = col;
        break;
      }
    }
  }
  return mapping;
}
