// Purchase service: import preview/commit, health, consumption, alerts, task engine.
// Todo vía crmRepository (persistencia) + crmService (tasks). Tenant siempre del servidor.

import * as XLSX from 'xlsx';
import { crmRepository } from './repository';
import { crmService } from './service';
import { analyzeAll, analyzeSku, customerTotals } from './purchase-analytics';
import type { PurchaseLike } from './purchase-analytics';
import {
  matchCompany,
  matchProduct,
  normalizeName,
  normalizeSku,
  purchaseFingerprint,
  type PurchaseRowStatus,
} from './purchase-import';
import {
  extractSpreadsheetStructure,
  inferPurchaseSpreadsheetSchema,
  type PurchaseCanonicalField,
} from './account-import-schema';
import type { CustomerTotals, RepurchaseAlert, SkuConsumption } from './purchase-types';

export interface PurchaseImportRow {
  index: number;
  raw: Record<string, string>;
  cliente?: string | null;
  fecha?: string | null;
  producto?: string | null;
  cantidad?: number | null;
  unit_price?: number | null;
  total_value?: number | null;
  currency?: string | null;
  document_number?: string | null;
  line_number?: number | null;
  tax_id?: string | null;
  company_id?: string | null;
  company_candidates?: Array<{ id: string; name: string }> | null;
  sku?: string | null;
  product_name?: string | null;
  product_category?: string | null;
  sku_candidates?: Array<{ sku: string; name: string }> | null;
  status: PurchaseRowStatus;
  errors: string[];
}

export interface PurchasePreviewResult {
  sheet_name: string;
  sheet_names: string[];
  header_row_index: number;
  columns: string[];
  mapping: Record<string, number | null>;
  confidence: Record<string, number | null> | null;
  llm_inferred: boolean;
  total_movements: number;
  unique_clients_count: number;
  resolved_cups_count: number;
  unresolved_products_count: number;
  ignored_non_cups_count: number;
  invalid_rows_count: number;
  unresolved_groups: Array<{
    description: string;
    count: number;
    candidates: Array<{ sku: string; name: string }>;
  }>;
  rows: PurchaseImportRow[];
}

function clean(val: unknown): string {
  return String(val ?? '').trim();
}

function toRows(p: {
  company_id: string;
  sku: string;
  product_name: string;
  purchase_date: string;
  quantity: number;
  total_value?: number | null;
  unit_price?: number | null;
}): PurchaseLike {
  return {
    company_id: p.company_id,
    sku: p.sku,
    product_name: p.product_name,
    purchase_date: p.purchase_date,
    quantity: p.quantity,
    total_value: p.total_value ?? null,
    unit_price: p.unit_price ?? null,
  };
}

async function catalog(organizationId: string): Promise<{
  companies: Array<{ id: string; name: string; legal_name?: string | null; tax_id?: string | null; external_id?: string | null }>;
  skus: Array<{ sku: string; name: string; product_id?: string | null; category?: string | null }>;
  customerAliases: Array<{ alias_normalized: string; company_id: string }>;
  productAliases: Array<{ alias_normalized: string; sku: string }>;
}> {
  const [companies, products, attrs, customerAliases, productAliases] = await Promise.all([
    crmRepository.listCompanies(organizationId),
    (await import('@/lib/db/repository')).repository.getProducts(organizationId).catch(() => []),
    (await import('@/lib/db/repository')).repository.getSKUs(organizationId).catch(() => []),
    crmRepository.listCustomerAliases(organizationId),
    crmRepository.listProductAliases(organizationId),
  ]);
  const productById = new Map(
    (products as Array<{ id: string; name: string; category?: string }>).map((p) => [p.id, p]),
  );
  const skus = (attrs as Array<{ sku: string; product_id: string }>).map((a) => {
    const prod = productById.get(a.product_id);
    return {
      sku: a.sku,
      product_id: a.product_id,
      name: prod?.name ?? a.sku,
      category: prod?.category ?? null,
    };
  });
  return { companies, skus, customerAliases, productAliases };
}

function parseDateCell(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const base = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
    return new Date(base).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{5}$/.test(s)) {
    const base = Date.UTC(1899, 11, 30) + Math.round(Number(s)) * 86400000;
    return new Date(base).toISOString().slice(0, 10);
  }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseNum(v: unknown): number | null {
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

export const purchaseService = {
  /**
   * Adaptive Purchase Preview:
   * 1. Uses LLM to infer sheet, header row, and column mapping.
   * 2. Deterministic engine extracts rows, reconciles customer CRM, and reconciles against Maestro SKU.
   * 3. Limits Purchase Intelligence strictly to category = 'cups'.
   * 4. Tags non-cups as IGNORED_NON_CUP and unresolved products as PRODUCT_UNRESOLVED (never inventing an SKU).
   */
  async previewImport(
    organizationId: string,
    file: {
      buffer: Buffer;
      filename: string;
      overrideSheetName?: string;
      overrideHeaderRowIndex?: number;
      overrideMapping?: Record<string, number | null>;
      pendingResolutions?: Record<string, string>;
    },
    legacyMappingOverride?: Record<string, string>,
  ): Promise<PurchasePreviewResult> {
    if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');

    const structure = extractSpreadsheetStructure(file.buffer);
    if (structure.sheetNames.length === 0) throw new Error('EMPTY_FILE');

    const hasManualOverrides = Boolean(
      file.overrideSheetName !== undefined ||
        file.overrideMapping !== undefined ||
        file.overrideHeaderRowIndex !== undefined ||
        legacyMappingOverride !== undefined,
    );

    let chosenSheet: string;
    let headerRowIndex: number;
    let mapping: Record<PurchaseCanonicalField, number | null>;
    let confidence: Record<string, number | null> | null = null;
    let llmInferred = false;

    if (hasManualOverrides) {
      chosenSheet =
        file.overrideSheetName && structure.sheetNames.includes(file.overrideSheetName)
          ? file.overrideSheetName
          : structure.sheetNames[0];
      headerRowIndex = file.overrideHeaderRowIndex ?? 0;
      mapping = {
        customer_name: null,
        tax_id: null,
        purchase_date: null,
        product_description: null,
        sku: null,
        quantity: null,
        document_number: null,
        line_number: null,
        unit_price: null,
        total_value: null,
        currency: null,
        ...(file.overrideMapping ?? {}),
      };
    } else {
      const inferred = await inferPurchaseSpreadsheetSchema(structure);
      if (inferred) {
        chosenSheet = inferred.sheet_name;
        headerRowIndex = inferred.header_row_index;
        mapping = inferred.mapping;
        confidence = inferred.confidence as Record<string, number | null>;
        llmInferred = true;
      } else {
        chosenSheet = structure.sheetNames[0];
        const sheetSample = structure.sheets[chosenSheet];
        headerRowIndex = 0;
        if (sheetSample?.rawSampleRows) {
          const firstNonEmpty = sheetSample.rawSampleRows.findIndex((r) =>
            r.some((c) => c.trim().length > 0),
          );
          if (firstNonEmpty >= 0) headerRowIndex = firstNonEmpty;
        }
        mapping = {
          customer_name: null,
          tax_id: null,
          purchase_date: null,
          product_description: null,
          sku: null,
          quantity: null,
          document_number: null,
          line_number: null,
          unit_price: null,
          total_value: null,
          currency: null,
        };
        llmInferred = false;
      }
    }

    const wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: false, raw: true });
    const ws = wb.Sheets[chosenSheet];
    if (!ws) throw new Error('EMPTY_FILE');

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    if (matrix.length === 0) throw new Error('EMPTY_FILE');
    if (matrix.length > 5000) throw new Error('FILE_TOO_LARGE');

    const rawHeaderRow = Array.isArray(matrix[headerRowIndex]) ? matrix[headerRowIndex] : [];
    const maxCols = Math.max(rawHeaderRow.length, structure.sheets[chosenSheet]?.colCount || 0);
    const columns: string[] = [];
    for (let i = 0; i < maxCols; i++) {
      const val = String(rawHeaderRow[i] ?? '').trim();
      columns.push(val || `Columna ${i + 1}`);
    }

    // Support legacy column mapping if passed as string names
    if (legacyMappingOverride) {
      const colNameToIdx = new Map(columns.map((c, i) => [c.toLowerCase().trim(), i]));
      if (legacyMappingOverride.cliente && colNameToIdx.has(legacyMappingOverride.cliente.toLowerCase().trim())) {
        mapping.customer_name = colNameToIdx.get(legacyMappingOverride.cliente.toLowerCase().trim())!;
      }
      if (legacyMappingOverride.fecha && colNameToIdx.has(legacyMappingOverride.fecha.toLowerCase().trim())) {
        mapping.purchase_date = colNameToIdx.get(legacyMappingOverride.fecha.toLowerCase().trim())!;
      }
      if (legacyMappingOverride.producto && colNameToIdx.has(legacyMappingOverride.producto.toLowerCase().trim())) {
        mapping.product_description = colNameToIdx.get(legacyMappingOverride.producto.toLowerCase().trim())!;
      }
      if (legacyMappingOverride.cantidad && colNameToIdx.has(legacyMappingOverride.cantidad.toLowerCase().trim())) {
        mapping.quantity = colNameToIdx.get(legacyMappingOverride.cantidad.toLowerCase().trim())!;
      }
      if (legacyMappingOverride.documento && colNameToIdx.has(legacyMappingOverride.documento.toLowerCase().trim())) {
        mapping.document_number = colNameToIdx.get(legacyMappingOverride.documento.toLowerCase().trim())!;
      }
      if (legacyMappingOverride.tax_id && colNameToIdx.has(legacyMappingOverride.tax_id.toLowerCase().trim())) {
        mapping.tax_id = colNameToIdx.get(legacyMappingOverride.tax_id.toLowerCase().trim())!;
      }
    }

    const cat = await catalog(organizationId);
    const pendingResolutions = file.pendingResolutions ?? {};
    const dataRows = matrix.slice(headerRowIndex + 1);

    const rows: PurchaseImportRow[] = [];
    const unresolvedGroupsMap = new Map<
      string,
      { description: string; count: number; candidates: Array<{ sku: string; name: string }> }
    >();

    let rowIndex = 0;
    for (const rawRow of dataRows) {
      if (!Array.isArray(rawRow)) continue;
      const isEmpty = rawRow.every((c) => String(c ?? '').trim() === '');
      if (isEmpty) continue;

      const strRow: Record<string, string> = {};
      rawRow.forEach((val, idx) => {
        strRow[columns[idx] || String(idx)] = String(val ?? '');
      });

      const get = (f: PurchaseCanonicalField): string => {
        const idx = mapping[f];
        if (idx == null || idx < 0) return '';
        return clean(rawRow[idx]);
      };

      const getRaw = (f: PurchaseCanonicalField): unknown => {
        const idx = mapping[f];
        if (idx == null || idx < 0) return null;
        return rawRow[idx];
      };

      const cliente = get('customer_name') || null;
      const taxId = get('tax_id') || null;
      const fecha = parseDateCell(getRaw('purchase_date'));
      const cantidad = parseNum(getRaw('quantity'));
      const producto = get('product_description') || null;
      const skuRaw = get('sku') || null;
      const docNum = get('document_number') || null;
      const lineNum = parseNum(getRaw('line_number'));
      const unitPrice = parseNum(getRaw('unit_price'));
      const totalVal = parseNum(getRaw('total_value'));
      const currency = get('currency') || null;

      const errors: string[] = [];
      if (!cliente) errors.push('Falta cliente');
      if (!fecha) errors.push('Fecha inválida');
      if (cantidad == null || cantidad <= 0) errors.push('Cantidad inválida');
      if (!producto && !skuRaw) errors.push('Falta producto o SKU');

      const cm = matchCompany({ cliente, tax_id: taxId }, cat.companies, cat.customerAliases);
      if (!cm.company_id && !cm.candidates) errors.push('Cliente no encontrado');

      // Product reconciliation
      let resolvedSku: string | null = null;
      let resolvedName: string | null = producto ?? skuRaw;
      let resolvedCategory: string | null = null;
      let candidates: Array<{ sku: string; name: string }> | null = null;

      const prodKey = producto || skuRaw || '';
      if (prodKey && pendingResolutions[prodKey]) {
        const overrideTarget = pendingResolutions[prodKey];
        const hit = cat.skus.find((s) => normalizeSku(s.sku) === normalizeSku(overrideTarget));
        if (hit) {
          resolvedSku = hit.sku;
          resolvedName = hit.name;
          resolvedCategory = hit.category ?? null;
        }
      } else {
        const pm = matchProduct({ producto, sku_raw: skuRaw }, cat.skus, cat.productAliases);
        resolvedSku = pm.sku;
        resolvedName = pm.product_name ?? producto ?? skuRaw;
        resolvedCategory = pm.category ?? null;
        candidates = pm.candidates;
      }

      // Categorization for Purchase Intelligence
      let status: PurchaseRowStatus;
      if (errors.length > 0 || !cm.company_id) {
        status = 'INVALID';
      } else if (!resolvedSku) {
        status = 'PRODUCT_UNRESOLVED';
        if (prodKey) {
          const existing = unresolvedGroupsMap.get(prodKey);
          if (existing) {
            existing.count += 1;
          } else {
            const cupCandidates = cat.skus
              .filter((s) => s.category === 'cups')
              .map((s) => ({ sku: s.sku, name: s.name }));
            unresolvedGroupsMap.set(prodKey, {
              description: prodKey,
              count: 1,
              candidates: (candidates && candidates.length > 0 ? candidates : cupCandidates).slice(0, 6),
            });
          }
        }
      } else if (resolvedCategory !== 'cups') {
        status = 'IGNORED_NON_CUP';
      } else {
        status = 'RESOLVED_CUP';
      }

      rows.push({
        index: rowIndex++,
        raw: strRow,
        cliente,
        fecha,
        producto,
        cantidad,
        unit_price: unitPrice,
        total_value: totalVal,
        currency,
        document_number: docNum,
        line_number: lineNum != null && Number.isInteger(lineNum) ? lineNum : null,
        tax_id: taxId,
        company_id: cm.company_id,
        company_candidates: cm.candidates,
        sku: resolvedSku,
        product_name: resolvedName,
        product_category: resolvedCategory,
        sku_candidates: candidates,
        status,
        errors,
      });

      if (rows.length >= 2000) break;
    }

    const uniqueClients = new Set(rows.map((r) => r.cliente).filter(Boolean)).size;
    const resolvedCups = rows.filter((r) => r.status === 'RESOLVED_CUP').length;
    const unresolvedProds = rows.filter((r) => r.status === 'PRODUCT_UNRESOLVED').length;
    const ignoredNonCups = rows.filter((r) => r.status === 'IGNORED_NON_CUP').length;
    const invalidRows = rows.filter((r) => r.status === 'INVALID').length;

    return {
      sheet_name: chosenSheet,
      sheet_names: structure.sheetNames,
      header_row_index: headerRowIndex,
      columns,
      mapping,
      confidence,
      llm_inferred: llmInferred,
      total_movements: rows.length,
      unique_clients_count: uniqueClients,
      resolved_cups_count: resolvedCups,
      unresolved_products_count: unresolvedProds,
      ignored_non_cups_count: ignoredNonCups,
      invalid_rows_count: invalidRows,
      unresolved_groups: Array.from(unresolvedGroupsMap.values()),
      rows,
    };
  },

  /**
   * Confirma la importación. Filas ya resueltas por UI (company_id/sku finales).
   * Idempotente: reimportar no duplica compras existentes.
   * Guarda alias de productos/clientes si se indica.
   */
  async commitImport(
    organizationId: string,
    input: {
      rows: Array<{
        company_id: string;
        purchase_date: string;
        sku: string;
        product_name: string;
        quantity: number;
        unit?: string | null;
        unit_price?: number | null;
        total_value?: number | null;
        currency?: string | null;
        contact_id?: string | null;
        document_number?: string | null;
        external_document_id?: string | null;
        line_number?: number | null;
        product_id?: string | null;
        source?: string | null;
      }>;
      saveAliases?: Array<{ kind: 'customer' | 'product'; alias: string; target: string }>;
      actorProfileId?: string;
    },
  ): Promise<{ inserted: number; duplicates: number; errors: Array<{ index: number; error: string }> }> {
    if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');
    let inserted = 0;
    let duplicates = 0;
    const errors: Array<{ index: number; error: string }> = [];
    const rows = input.rows.slice(0, 2000);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.company_id || !r.sku || !r.purchase_date || !(r.quantity > 0)) throw new Error('INVALID_ROW');
        const company = await crmRepository.getCompany(r.company_id, organizationId);
        if (!company) throw new Error('CROSS_TENANT_REFERENCE');
        if (r.contact_id) {
          const contact = await crmRepository.getContact(r.contact_id, organizationId);
          if (!contact) throw new Error('CROSS_TENANT_REFERENCE');
        }

        const hasDoc = Boolean(r.external_document_id && r.line_number != null);
        const fingerprint = hasDoc
          ? null
          : purchaseFingerprint({
              organization_id: organizationId,
              company_id: r.company_id,
              purchase_date: r.purchase_date,
              document: r.document_number ?? null,
              sku: r.sku,
              quantity: r.quantity,
            });

        const { duplicate } = await crmRepository.insertPurchaseIdempotent({
          organization_id: organizationId,
          company_id: r.company_id,
          contact_id: r.contact_id ?? null,
          purchase_date: r.purchase_date,
          external_document_id: r.external_document_id ?? null,
          document_number: r.document_number ?? null,
          line_number: r.line_number ?? null,
          product_id: r.product_id ?? null,
          sku: normalizeSku(r.sku),
          product_name: r.product_name.slice(0, 200),
          quantity: r.quantity,
          unit: r.unit ?? 'u',
          unit_price: r.unit_price ?? null,
          total_value: r.total_value ?? null,
          currency: r.currency ?? 'USD',
          source: r.source ?? 'IMPORT',
          fingerprint,
          metadata: {},
        });

        if (duplicate) duplicates += 1;
        else inserted += 1;
      } catch (e) {
        errors.push({ index: i, error: e instanceof Error ? e.message : 'IMPORT_FAILED' });
      }
    }

    for (const a of input.saveAliases ?? []) {
      const norm = normalizeName(a.alias);
      if (!norm) continue;
      if (a.kind === 'customer') {
        const c = await crmRepository.getCompany(a.target, organizationId);
        if (c) await crmRepository.saveCustomerAlias(organizationId, norm, a.target);
      } else {
        await crmRepository.saveProductAlias(organizationId, norm, normalizeSku(a.target));
      }
    }

    return { inserted, duplicates, errors };
  },

  async getPurchases(
    organizationId: string,
    companyId?: string,
    limit = 500,
  ): Promise<ReturnType<typeof crmRepository.listPurchases>> {
    return crmRepository.listPurchases(organizationId, companyId, Math.min(limit, 5000));
  },

  async getConsumption(
    organizationId: string,
    companyId: string,
    todayTs = Date.now(),
  ): Promise<{
    stats: SkuConsumption[];
    totals: CustomerTotals;
    monthly: Array<{ month: string; quantity: number; value: number }>;
    history: Awaited<ReturnType<typeof crmRepository.listPurchases>>;
    by_sku?: SkuConsumption[];
  }> {
    const company = await crmRepository.getCompany(companyId, organizationId);
    if (!company) throw new Error('CROSS_TENANT_REFERENCE');
    const purchases = await crmRepository.listPurchases(organizationId, companyId, 5000);
    const like: PurchaseLike[] = purchases.map((p) => toRows(p));
    const stats = analyzeAll(like, todayTs).sort(
      (a, b) => (b.expected_next_purchase_at ?? '').localeCompare(a.expected_next_purchase_at ?? ''),
    );
    const totals = customerTotals(companyId, stats, like, todayTs);
    const buckets = new Map<string, { quantity: number; value: number }>();
    for (const p of purchases) {
      const key = p.purchase_date.slice(0, 7);
      const cur = buckets.get(key) ?? { quantity: 0, value: 0 };
      cur.quantity += Number(p.quantity) || 0;
      cur.value += Number(p.total_value ?? 0) || 0;
      buckets.set(key, cur);
    }
    const monthly = [...buckets.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .reverse()
      .map(([month, v]) => ({ month, quantity: Math.round(v.quantity), value: Math.round(v.value * 100) / 100 }));
    return { stats, totals, monthly, history: purchases.slice(0, 200), by_sku: stats };
  },

  async getHealth(
    organizationId: string,
    todayTs = Date.now(),
  ): Promise<Array<CustomerTotals & { company_name: string; owner_profile_id?: string | null }>> {
    const [companies, purchases] = await Promise.all([
      crmRepository.listCompanies(organizationId),
      crmRepository.listPurchases(organizationId, undefined, 5000),
    ]);
    const like: PurchaseLike[] = purchases.map((p) => toRows(p));
    const stats = analyzeAll(like, todayTs);
    return companies
      .map((c) => ({ ...customerTotals(c.id, stats, like, todayTs), company_name: c.name, owner_profile_id: c.owner_profile_id ?? null }))
      .sort((a, b) => (b.overdue_count - a.overdue_count) || (b.soon_count - a.soon_count));
  },

  /**
   * Genera alertas comerciales agregadas por empresa × SKU.
   * IMPORTANTE: Limitado estrictamente a PROSPECT (clientes potenciales).
   */
  async getAlerts(
    organizationId: string,
    todayTs = Date.now(),
  ): Promise<RepurchaseAlert[]> {
    const [companies, purchases, contacts] = await Promise.all([
      crmRepository.listCompanies(organizationId),
      crmRepository.listPurchases(organizationId, undefined, 5000),
      crmRepository.listContacts(organizationId),
    ]);
    const potentialCompanies = companies.filter((c) => c.lifecycle_stage === 'PROSPECT' || !c.lifecycle_stage);
    const potentialIds = new Set(potentialCompanies.map((c) => c.id));
    const byName = new Map(potentialCompanies.map((c) => [c.id, c]));
    const mainContact = new Map<string, { full_name: string; whatsapp_phone?: string | null }>();
    for (const ct of contacts) {
      if (ct.company_id && !mainContact.has(ct.company_id)) {
        mainContact.set(ct.company_id, { full_name: ct.full_name, whatsapp_phone: ct.whatsapp_phone ?? null });
      }
    }
    const like: PurchaseLike[] = purchases.map((p) => toRows(p));
    return analyzeAll(like, todayTs)
      .filter((s) => potentialIds.has(s.company_id))
      .filter((s) => s.repurchase_status === 'CONTACT_SOON' || s.repurchase_status === 'OVERDUE')
      .map((s) => ({
        ...s,
        company_name: byName.get(s.company_id)?.name ?? '—',
        owner_profile_id: byName.get(s.company_id)?.owner_profile_id ?? null,
        contact_name: mainContact.get(s.company_id)?.full_name ?? null,
        contact_whatsapp: mainContact.get(s.company_id)?.whatsapp_phone ?? null,
        expected_value: s.average_order_value,
      }))
      .sort((a, b) => (a.expected_next_purchase_at ?? '').localeCompare(b.expected_next_purchase_at ?? ''));
  },

  async generateTasks(
    organizationId: string,
    actorProfileId?: string,
    todayTs = Date.now(),
  ): Promise<{ created: number; bumped: number; skipped: number }> {
    const alerts = await this.getAlerts(organizationId, todayTs);
    const tasks = await crmRepository.listTasks(organizationId);
    let created = 0;
    let bumped = 0;
    let skipped = 0;
    const fmtDate = (iso: string): string => {
      const [y, m, d] = iso.split('-');
      return `${d}/${m}/${y}`;
    };
    for (const a of alerts) {
      if (!a.expected_next_purchase_at) {
        skipped += 1;
        continue;
      }
      const prefix = `repurchase:${a.company_id}:${a.sku}:`;
      const same = tasks.filter((t) => (t.external_key ?? '').startsWith(prefix));
      const open = same.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
      if (open.length > 0) {
        if (a.repurchase_status === 'OVERDUE' && open[0].priority !== 'HIGH' && open[0].priority !== 'URGENT') {
          await crmService.updateTask(open[0].id, organizationId, { priority: 'HIGH' } as never, actorProfileId);
          bumped += 1;
        } else {
          skipped += 1;
        }
        continue;
      }
      const key = `${prefix}${a.expected_next_purchase_at}`;
      const avg = Math.round(a.average_order_quantity).toLocaleString('es-PY');
      await crmService.createTask(
        organizationId,
        {
          title: `Recompra esperada · ${a.product_name}`,
          description:
            `${a.company_name} compra este producto aproximadamente cada ${a.median_days_between_orders ?? '?'} días. ` +
            `Última compra: ${fmtDate(a.last_purchase_date)}. ` +
            `Próxima compra estimada: ${fmtDate(a.expected_next_purchase_at)}. ` +
            `Cantidad promedio: ${avg} unidades.`,
          lead_id: null,
          opportunity_id: null,
          company_id: a.company_id,
          assigned_to: a.owner_profile_id ?? null,
          due_at: new Date(`${a.expected_next_purchase_at}T12:00:00Z`).toISOString(),
          priority: a.repurchase_status === 'OVERDUE' ? 'HIGH' : 'MEDIUM',
          source: 'REPURCHASE_ENGINE',
          external_key: key,
        },
        actorProfileId,
      );
      created += 1;
    }
    return { created, bumped, skipped };
  },
};

export { analyzeSku };
