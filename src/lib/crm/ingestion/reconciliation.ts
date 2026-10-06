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
  size_oz?: number | null;
  size_ml?: number | null;
  wall_type?: 'single' | 'double' | 'n/a' | null;
  material?: string | null;
}

export type ProductFamily = 'cups' | 'lids' | 'bowls' | 'other';

export interface ProductExtractedAttributes {
  family: ProductFamily | null;
  capacity_oz: number | null;
  wall_type: 'single' | 'double' | 'n/a' | null;
  material_line: string | null;
  is_custom_print: boolean | null;
}

export interface ProductAttributeInput {
  description?: string | null;
  sku_raw?: string | null;
  line?: string | null;
  subline?: string | null;
  rawPayload?: Record<string, unknown>;
}

function cleanStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function extractProductAttributes(input: ProductAttributeInput): ProductExtractedAttributes {
  const descRaw = cleanStr(input.description || input.sku_raw);
  const lineRaw = cleanStr(input.line ?? (input.rawPayload?.Linea as string) ?? (input.rawPayload?.linea as string));
  const sublineRaw = cleanStr(input.subline ?? (input.rawPayload?.['SUB-LINEA'] as string) ?? (input.rawPayload?.sublinea as string));

  const normDesc = normalizeName(descRaw);
  const normSubline = normalizeName(sublineRaw);
  const normLine = normalizeName(lineRaw);
  const fullText = `${normDesc} ${normSubline} ${normLine}`.trim();

  // 1. Material Line
  let material_line: string | null = null;
  if (normLine.includes('polipapel') || normDesc.includes('polipapel')) material_line = 'polipapel';
  else if (normLine.includes('plastico') || normDesc.includes('plastico')) material_line = 'plastico';
  else if (normLine.includes('extrusion') || normDesc.includes('extrusion')) material_line = 'extrusion';
  else if (normLine.includes('kraft') || normDesc.includes('kraft')) material_line = 'kraft';
  else if (normLine.includes('carton') || normLine.includes('cartulina') || normDesc.includes('carton')) material_line = 'cartulina';

  // 2. Family
  let family: ProductFamily | null = null;
  // Check subline first
  if (/^vasos?\b|\bvasos?\d/i.test(sublineRaw) || normSubline.startsWith('vaso')) {
    family = 'cups';
  } else if (/^tapas?\b|\btapas?\d/i.test(sublineRaw) || normSubline.startsWith('tapa')) {
    family = 'lids';
  } else if (/^bowls?\b|\bbowls?\d|^potes?\b|\bpotes?\d/i.test(sublineRaw) || normSubline.startsWith('bowl') || normSubline.startsWith('pote')) {
    family = 'bowls';
  } else if (normSubline.includes('cuna') || normSubline.includes('bandej') || normSubline.includes('bobin') || normSubline.includes('envio')) {
    family = 'other';
  }

  // If not determined, check description
  if (!family) {
    if (normDesc.includes('vaso') || normDesc.includes('copo') || normDesc.includes('cup')) {
      family = 'cups';
    } else if (normDesc.includes('tapa') || normDesc.includes('lid')) {
      family = 'lids';
    } else if (normDesc.includes('bowl') || normDesc.includes('pote')) {
      family = 'bowls';
    } else if (
      normDesc.includes('cuna') ||
      normDesc.includes('bandej') ||
      normDesc.includes('bobina') ||
      normDesc.includes('panal') ||
      normDesc.includes('envio') ||
      normDesc.includes('flete')
    ) {
      family = 'other';
    }
  }

  // 3. Capacity in OZ
  let capacity_oz: number | null = null;

  // Regex A: Search in description: number followed by oz/onza/onzas, e.g. "8OZ", "8 OZ", "12 ONZAS", "VASOSDE8OZ", "VASO12OZDOBLEPARED"
  const ozDescMatch = descRaw.match(/(\d{1,2})\s*(?:oz|onza|onzas)/i);
  if (ozDescMatch) {
    const val = parseInt(ozDescMatch[1], 10);
    if (val >= 1 && val <= 32) {
      capacity_oz = val;
    }
  }

  // Regex B: If not found in description, check subline, e.g. "VASOS8", "VASOS16", "TAPAS8", "BOWLS20", "POTES8"
  if (capacity_oz === null && sublineRaw) {
    const subMatch = sublineRaw.match(/(?:vasos?|tapas?|bowls?|potes?)\s*(\d{1,2})\b/i);
    if (subMatch) {
      const val = parseInt(subMatch[1], 10);
      if (val >= 1 && val <= 32) {
        capacity_oz = val;
      }
    }
  }

  // Regex C: Check if description has "de X oz" or standalone "X oz"
  if (capacity_oz === null) {
    const genericOz = fullText.match(/\b(\d{1,2})\s*oz/i);
    if (genericOz) {
      const val = parseInt(genericOz[1], 10);
      if (val >= 1 && val <= 32) {
        capacity_oz = val;
      }
    }
  }

  // 4. Wall Type ('single' | 'double' | 'n/a' | null)
  let wall_type: 'single' | 'double' | 'n/a' | null = null;
  const lowerDesc = descRaw.toLowerCase();
  if (
    fullText.includes('doble pared') ||
    fullText.includes('double wall') ||
    fullText.includes('pared doble') ||
    /\bdw\b/i.test(fullText) ||
    lowerDesc.includes('doblepared') ||
    lowerDesc.includes('doble pared') ||
    /doble\s*pared/i.test(descRaw) ||
    /\b(dw)\b/i.test(descRaw) ||
    lowerDesc.endsWith('dw') ||
    lowerDesc.includes('-dw')
  ) {
    wall_type = 'double';
  } else if (
    fullText.includes('pared simple') ||
    fullText.includes('single wall') ||
    fullText.includes('simple pared') ||
    /\bsw\b/i.test(fullText) ||
    lowerDesc.includes('paredsimple') ||
    lowerDesc.includes('pared simple') ||
    /simple\s*pared/i.test(descRaw) ||
    /\b(sw)\b/i.test(descRaw) ||
    lowerDesc.endsWith('sw') ||
    lowerDesc.includes('-sw')
  ) {
    wall_type = 'single';
  }

  // 5. Custom Print Clues
  let is_custom_print: boolean | null = null;
  if (
    fullText.includes('con diseno') ||
    fullText.includes('con diseño') ||
    /\bc\/d\b/i.test(descRaw) ||
    /\bcd\b/i.test(normDesc) ||
    fullText.includes('logo') ||
    fullText.includes('personalizado') ||
    fullText.includes('impreso') ||
    normDesc.includes('bkvasologo') ||
    normDesc.includes('popvasologo')
  ) {
    is_custom_print = true;
  } else if (
    fullText.includes('sin diseno') ||
    fullText.includes('sin diseño') ||
    /\bs\/d\b/i.test(descRaw) ||
    /\bsd\b/i.test(normDesc) ||
    fullText.includes('generico') ||
    fullText.includes('blanco')
  ) {
    is_custom_print = false;
  }

  return {
    family,
    capacity_oz,
    wall_type,
    material_line,
    is_custom_print,
  };
}

export type ProductMatchType =
  | 'EXACT_SKU'
  | 'ALIAS_CONFIRMED'
  | 'ATTRIBUTE_UNIQUE_MATCH'
  | 'AMBIGUOUS'
  | 'NO_MATCH'
  | 'SKIPPED';

export interface ProductMatchResult {
  sku: string | null;
  product_name: string | null;
  category: string | null;
  status: ProductRowStatus;
  match_type: ProductMatchType;
  candidates: Array<{ sku: string; name: string }> | null;
  detected_attributes?: ProductExtractedAttributes;
}

export function matchProductRecordWithAttributes(
  raw: {
    producto?: string | null;
    sku_raw?: string | null;
    line?: string | null;
    subline?: string | null;
    rawPayload?: Record<string, unknown>;
  },
  skus: SkuRef[],
  aliases: Array<{ alias_normalized: string; sku: string }>,
): ProductMatchResult {
  const normSkuRaw = normalizeSku(raw.sku_raw);
  const normDesc = normalizeName(raw.producto || raw.sku_raw);

  if (!normDesc && !normSkuRaw) {
    return {
      sku: null,
      product_name: null,
      category: null,
      status: 'SKIPPED',
      match_type: 'SKIPPED',
      candidates: null,
    };
  }

  // PRIORITY 1: EXACT SKU (raw sku or description exactly matches Master SKU)
  if (normSkuRaw) {
    const exact = skus.find((s) => normalizeSku(s.sku) === normSkuRaw);
    if (exact) {
      const isCup = exact.category === 'cups';
      return {
        sku: exact.sku,
        product_name: exact.name,
        category: exact.category ?? null,
        status: isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP',
        match_type: 'EXACT_SKU',
        candidates: null,
      };
    }
  }

  const exactByDesc = skus.find((s) => normalizeSku(s.sku) === normalizeSku(raw.producto));
  if (exactByDesc) {
    const isCup = exactByDesc.category === 'cups';
    return {
      sku: exactByDesc.sku,
      product_name: exactByDesc.name,
      category: exactByDesc.category ?? null,
      status: isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP',
      match_type: 'EXACT_SKU',
      candidates: null,
    };
  }

  // PRIORITY 2: ALIAS CONFIRMED
  // Check alias table. Crucial: alias must point to an EXISTING Master SKU!
  if (normDesc) {
    const aliasHit = aliases.find((a) => a.alias_normalized === normDesc);
    if (aliasHit) {
      const targetInMaster = skus.find((s) => normalizeSku(s.sku) === normalizeSku(aliasHit.sku));
      if (targetInMaster) {
        const isCup = targetInMaster.category === 'cups';
        return {
          sku: targetInMaster.sku,
          product_name: targetInMaster.name,
          category: targetInMaster.category ?? null,
          status: isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP',
          match_type: 'ALIAS_CONFIRMED',
          candidates: null,
        };
      }
    }
  }

  // PRIORITY 3: DETERMINISTIC ATTRIBUTE PARSER & MASTER SKU FILTERING
  const attrs = extractProductAttributes({
    description: raw.producto,
    sku_raw: raw.sku_raw,
    line: raw.line,
    subline: raw.subline,
    rawPayload: raw.rawPayload,
  });

  // If no family or no capacity can be interpreted, cannot match cups/bowls
  if (!attrs.family || attrs.capacity_oz === null) {
    // Check if exact product name in master catalog
    const exactNameMatch = skus.find((s) => normalizeName(s.name) === normDesc);
    if (exactNameMatch) {
      const isCup = exactNameMatch.category === 'cups';
      return {
        sku: exactNameMatch.sku,
        product_name: exactNameMatch.name,
        category: exactNameMatch.category ?? null,
        status: isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP',
        match_type: 'ATTRIBUTE_UNIQUE_MATCH',
        candidates: null,
        detected_attributes: attrs,
      };
    }

    return {
      sku: null,
      product_name: raw.producto || raw.sku_raw || null,
      category: null,
      status: 'PRODUCT_UNRESOLVED',
      match_type: 'NO_MATCH',
      candidates: null,
      detected_attributes: attrs,
    };
  }

  // Filter real master SKUs by family
  let candidates = skus.filter((s) => s.category === attrs.family);

  // Filter by capacity
  candidates = candidates.filter((s) => s.size_oz === attrs.capacity_oz);

  // Filter by wall type if explicit
  if (attrs.wall_type) {
    candidates = candidates.filter((s) => s.wall_type === attrs.wall_type);
  }

  // Evaluate candidate count
  if (candidates.length === 1) {
    const matched = candidates[0];
    const isCup = matched.category === 'cups';
    return {
      sku: matched.sku,
      product_name: matched.name,
      category: matched.category ?? null,
      status: isCup ? 'RESOLVED_CUP' : 'RESOLVED_NON_CUP',
      match_type: 'ATTRIBUTE_UNIQUE_MATCH',
      candidates: null,
      detected_attributes: attrs,
    };
  }

  if (candidates.length >= 2) {
    return {
      sku: null,
      product_name: raw.producto || raw.sku_raw || null,
      category: null,
      status: 'PRODUCT_UNRESOLVED',
      match_type: 'AMBIGUOUS',
      candidates: candidates.map((c) => ({ sku: c.sku, name: c.name })),
      detected_attributes: attrs,
    };
  }

  // 0 candidates
  return {
    sku: null,
    product_name: raw.producto || raw.sku_raw || null,
    category: null,
    status: 'PRODUCT_UNRESOLVED',
    match_type: 'NO_MATCH',
    candidates: null,
    detected_attributes: attrs,
  };
}

export function matchProductRecord(
  raw: {
    producto?: string | null;
    sku_raw?: string | null;
    line?: string | null;
    subline?: string | null;
    rawPayload?: Record<string, unknown>;
  },
  skus: SkuRef[],
  aliases: Array<{ alias_normalized: string; sku: string }>,
): ProductMatchResult {
  return matchProductRecordWithAttributes(raw, skus, aliases);
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
