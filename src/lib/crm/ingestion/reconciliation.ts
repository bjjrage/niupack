import crypto from 'crypto';
import type { CustomerRowStatus, ProductRowStatus, IngestionRowStatus } from './types';

export function normalizeName(s?: string | null): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTaxId(s?: string | null): string {
  if (!s) return '';
  return s.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

export function normalizeSku(s?: string | null): string {
  if (!s) return '';
  return s.trim().toUpperCase();
}

export function parseDateCell(v: unknown): string | null {
  if (v == null || v === '') return null;
  try {
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      // Excel serial date to ISO YYYY-MM-DD (valid range: 1 to 100,000 covering 1900 to 2173)
      if (v >= 1 && v <= 100000) {
        const base = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
        const d = new Date(base);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      } else if (v > 1000000000000) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
      return null;
    }
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d{5}$/.test(s)) {
      const serial = Number(s);
      if (serial >= 1 && serial <= 100000) {
        const base = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
        const d = new Date(base);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
    }
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(`${m[1]}-${m[2]}-${m[3]}`);
      if (!isNaN(d.getTime())) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) {
      const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
      const iso = `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return iso;
    }
    const fallback = new Date(s);
    if (!isNaN(fallback.getTime())) {
      return fallback.toISOString().slice(0, 10);
    }
    return null;
  } catch {
    return null;
  }
}

export function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let cleaned = s;
  if (hasComma && hasDot) {
    cleaned = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    cleaned = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      cleaned = s.replace(/\./g, '');
    } else if (parts[1] && parts[1].length === 3 && parts[0].length >= 1) {
      cleaned = s.replace(/\./g, '');
    }
  }
  const n = Number(cleaned.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export interface CompanyCandidate {
  id: string;
  name: string;
}

export interface CompanyMatchResult {
  company_id: string | null;
  status: CustomerRowStatus;
  candidates: CompanyCandidate[] | null;
}

export function matchCompanyRecord(
  raw: { cliente?: string | null; tax_id?: string | null },
  companies: Array<{ id: string; name: string; legal_name?: string | null; tax_id?: string | null; external_id?: string | null }>,
  aliases: Array<{ alias_normalized: string; company_id: string }>,
): CompanyMatchResult {
  const normTax = normalizeTaxId(raw.tax_id);
  if (normTax) {
    const hit = companies.find((c) => normalizeTaxId(c.tax_id) === normTax);
    if (hit) return { company_id: hit.id, status: 'RESOLVED', candidates: null };
  }

  const normName = normalizeName(raw.cliente);
  if (!normName) return { company_id: null, status: 'INVALID', candidates: null };

  // Check alias
  const aliasHit = aliases.find((a) => a.alias_normalized === normName);
  if (aliasHit) {
    const c = companies.find((x) => x.id === aliasHit.company_id);
    if (c) return { company_id: c.id, status: 'RESOLVED', candidates: null };
  }

  // Exact normalized match on name or legal_name
  const exactHits = companies.filter(
    (c) => normalizeName(c.name) === normName || normalizeName(c.legal_name) === normName,
  );
  if (exactHits.length === 1) {
    return { company_id: exactHits[0].id, status: 'RESOLVED', candidates: null };
  }
  if (exactHits.length > 1) {
    return {
      company_id: null,
      status: 'UNRESOLVED',
      candidates: exactHits.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  // Partial match: word containment if strong
  const partialHits = companies.filter((c) => {
    const cn = normalizeName(c.name);
    return cn.includes(normName) || normName.includes(cn);
  });
  if (partialHits.length === 1) {
    return {
      company_id: null,
      status: 'UNRESOLVED',
      candidates: partialHits.map((c) => ({ id: c.id, name: c.name })),
    };
  }
  if (partialHits.length > 1) {
    return {
      company_id: null,
      status: 'UNRESOLVED',
      candidates: partialHits.slice(0, 5).map((c) => ({ id: c.id, name: c.name })),
    };
  }

  return { company_id: null, status: 'UNRESOLVED', candidates: null };
}

export interface SkuRef {
  sku: string;
  name: string;
  product_id?: string | null;
  category?: string | null;
}

export interface ProductMatchResult {
  sku: string | null;
  product_name: string | null;
  category: string | null;
  status: ProductRowStatus;
  candidates: Array<{ sku: string; name: string }> | null;
}

export function matchProductRecord(
  raw: { producto?: string | null; sku_raw?: string | null },
  skus: SkuRef[],
  aliases: Array<{ alias_normalized: string; sku: string }>,
): ProductMatchResult {
  const normSkuRaw = normalizeSku(raw.sku_raw);
  if (normSkuRaw) {
    const exact = skus.find((s) => normalizeSku(s.sku) === normSkuRaw);
    if (exact) {
      const isCup = exact.category === 'cups';
      return {
        sku: exact.sku,
        product_name: exact.name,
        category: exact.category ?? null,
        status: isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP',
        candidates: null,
      };
    }
  }

  const normDesc = normalizeName(raw.producto || raw.sku_raw);
  if (!normDesc) {
    return {
      sku: null,
      product_name: null,
      category: null,
      status: 'SKIPPED',
      candidates: null,
    };
  }

  // Alias match
  const aliasHit = aliases.find((a) => a.alias_normalized === normDesc);
  if (aliasHit) {
    const s = skus.find((x) => normalizeSku(x.sku) === normalizeSku(aliasHit.sku));
    if (s) {
      const isCup = s.category === 'cups';
      return {
        sku: s.sku,
        product_name: s.name,
        category: s.category ?? null,
        status: isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP',
        candidates: null,
      };
    }
  }

  // Exact match by SKU or product name
  const exactDesc = skus.find(
    (s) => normalizeName(s.sku) === normDesc || normalizeName(s.name) === normDesc,
  );
  if (exactDesc) {
    const isCup = exactDesc.category === 'cups';
    return {
      sku: exactDesc.sku,
      product_name: exactDesc.name,
      category: exactDesc.category ?? null,
      status: isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP',
      candidates: null,
    };
  }

  // Substring / candidates match
  const candidates = skus
    .filter((s) => {
      const sn = normalizeName(s.name);
      const sk = normalizeName(s.sku);
      return sn.includes(normDesc) || normDesc.includes(sn) || normDesc.includes(sk);
    })
    .slice(0, 6)
    .map((s) => ({ sku: s.sku, name: s.name }));

  return {
    sku: null,
    product_name: raw.producto || raw.sku_raw || null,
    category: null,
    status: 'PRODUCT_UNRESOLVED',
    candidates: candidates.length > 0 ? candidates : null,
  };
}

export function computePurchaseFingerprint(input: {
  organization_id: string;
  company_id: string;
  purchase_date: string;
  document?: string | null;
  sku: string;
  quantity: number;
  total_value?: number | null;
}): string {
  const payload = [
    input.organization_id,
    input.company_id,
    input.purchase_date,
    (input.document ?? '').trim().toUpperCase(),
    normalizeSku(input.sku),
    input.quantity,
    input.total_value ?? '',
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
