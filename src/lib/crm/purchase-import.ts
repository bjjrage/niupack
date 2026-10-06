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
  category?: string | null;
}

export type PurchaseRowStatus = 'RESOLVED_CUP' | 'PRODUCT_UNRESOLVED' | 'IGNORED_NON_CUP' | 'INVALID';

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
      (c) =>
        (c.external_id && normalizeSku(c.external_id) === ext) ||
        digitsOnly(c.external_id) === digitsOnly(input.external_id),
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

/**
 * 1 SKU exacto real → 2 alias confirmado → 3 nombre normalizado del Maestro.
 * REGLA CRÍTICA: NUNCA inventar SKU. Si no encuentra match en el Maestro, sku = null.
 */
export function matchProduct(
  input: { producto?: string | null; sku_raw?: string | null },
  skus: SkuRef[],
  aliases: Array<{ alias_normalized: string; sku: string }>,
): {
  sku: string | null;
  product_name: string | null;
  category: string | null;
  candidates: Array<{ sku: string; name: string }> | null;
} {
  const rawSku = (input.sku_raw ?? '').trim();
  const rawProd = (input.producto ?? '').trim();
  const raw = rawSku || rawProd;
  if (!raw) return { sku: null, product_name: null, category: null, candidates: null };

  // 1. SKU exacto real
  if (rawSku) {
    const exactSku = skus.find((s) => normalizeSku(s.sku) === normalizeSku(rawSku));
    if (exactSku) {
      return { sku: exactSku.sku, product_name: exactSku.name, category: exactSku.category ?? null, candidates: null };
    }
  }
  const exactByProd = skus.find((s) => normalizeSku(s.sku) === normalizeSku(rawProd));
  if (exactByProd) {
    return { sku: exactByProd.sku, product_name: exactByProd.name, category: exactByProd.category ?? null, candidates: null };
  }

  // 2. Alias previamente confirmado
  const norm = normalizeName(rawProd || rawSku);
  const alias = aliases.find((a) => a.alias_normalized === norm);
  if (alias) {
    const target = skus.find((s) => normalizeSku(s.sku) === normalizeSku(alias.sku));
    if (target) {
      return { sku: target.sku, product_name: target.name, category: target.category ?? null, candidates: null };
    }
  }

  // 3. Matching confiable contra nombre/descripción del Maestro
  const hits = skus.filter((s) => {
    const n = normalizeName(s.name);
    const skuNorm = normalizeName(s.sku);
    return (n && (n === norm || n.includes(norm) || norm.includes(n))) || (skuNorm && norm.includes(skuNorm));
  });

  if (hits.length === 1) {
    return { sku: hits[0].sku, product_name: hits[0].name, category: hits[0].category ?? null, candidates: null };
  }
  if (hits.length > 1) {
    // Si hay varios, devolver candidatos para selección humana sin adivinar
    return {
      sku: null,
      product_name: raw,
      category: null,
      candidates: hits.map((s) => ({ sku: s.sku, name: s.name })),
    };
  }

  // 4. Si no hay match: NUNCA inventar un SKU nuevo.
  // sku = null, queda PRODUCT_UNRESOLVED
  const cupCandidates = skus.filter((s) => s.category === 'cups').map((s) => ({ sku: s.sku, name: s.name }));
  return {
    sku: null,
    product_name: raw,
    category: null,
    candidates: cupCandidates.slice(0, 5),
  };
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
