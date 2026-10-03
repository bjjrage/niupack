// Purchase service: import preview/commit, health, consumption, alerts, task engine.
// Todo vía crmRepository (persistencia) + crmService (tasks). Tenant siempre del servidor.

import * as XLSX from 'xlsx';
import { crmRepository } from './repository';
import { crmService } from './service';
import { analyzeAll, analyzeSku, customerTotals } from './purchase-analytics';
import type { PurchaseLike } from './purchase-analytics';
import {
  autoMapColumns,
  matchCompany,
  matchProduct,
  normalizeName,
  normalizeSku,
  purchaseFingerprint,
} from './purchase-import';
import type { CustomerTotals, ImportRow, RepurchaseAlert, SkuConsumption } from './purchase-types';

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
  skus: Array<{ sku: string; name: string; product_id?: string | null }>;
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
  const productById = new Map((products as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
  const skus = (attrs as Array<{ sku: string; product_id: string }>).map((a) => ({
    sku: a.sku,
    product_id: a.product_id,
    name: productById.get(a.product_id) ?? a.sku,
  }));
  return { companies, skus, customerAliases, productAliases };
}

function parseDateCell(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Serial Excel.
    const base = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
    return new Date(base).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
    // Formato latam DD/MM/YYYY por defecto.
    return `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export const purchaseService = {
  /** Parsea el archivo y devuelve preview con matching (sin escribir nada). */
  async previewImport(
    organizationId: string,
    file: { buffer: Buffer; filename: string },
    mappingOverride?: Record<string, string>,
  ): Promise<{ columns: string[]; mapping: Record<string, string>; rows: ImportRow[] }> {
    if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');
    const wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('EMPTY_FILE');
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (json.length === 0) throw new Error('EMPTY_FILE');
    if (json.length > 5000) throw new Error('FILE_TOO_LARGE');
    const columns = [...new Set(json.flatMap((r) => Object.keys(r)))].slice(0, 40);
    const mapping = { ...autoMapColumns(columns), ...(mappingOverride ?? {}) };
    const cat = await catalog(organizationId);
    const rows: ImportRow[] = json.slice(0, 2000).map((raw, index) => {
      const str: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) str[k] = v == null ? '' : String(v);
      const get = (f: string): string => (mapping[f] ? str[mapping[f]] ?? '' : '');
      const errors: string[] = [];
      const cliente = get('cliente') || null;
      const fecha = parseDateCell(mapping['fecha'] ? raw[mapping['fecha']] : null);
      const cantidad = parseNum(mapping['cantidad'] ? raw[mapping['cantidad']] : null);
      if (!cliente) errors.push('Falta cliente');
      if (!fecha) errors.push('Fecha inválida');
      if (cantidad == null || cantidad <= 0) errors.push('Cantidad inválida');
      const cm = matchCompany({ cliente, tax_id: get('tax_id') || null, external_id: null }, cat.companies, cat.customerAliases);
      if (!cm.company_id && !cm.candidates) errors.push('Cliente no encontrado');
      const pm = matchProduct({ producto: get('producto') || null }, cat.skus, cat.productAliases);
      if (!pm.sku) errors.push('Producto no identificado');
      const documento = get('documento') || null;
      const lineaRaw = parseNum(get('linea') ? raw[mapping['linea']!] : null);
      return {
        index,
        raw: str,
        cliente,
        fecha,
        producto: get('producto') || null,
        cantidad,
        company_id: cm.company_id,
        company_candidates: cm.candidates,
        sku: pm.sku,
        product_name: pm.product_name,
        sku_candidates: pm.candidates,
        errors: [
          ...errors,
          ...(documento ? [] : []),
          ...(lineaRaw != null && !Number.isInteger(lineaRaw) ? ['Línea inválida'] : []),
        ],
      };
    });
    return { columns, mapping, rows };
  },

  /**
   * Confirma la importación. Filas ya resueltas por UI (company_id/sku finales).
   * Idempotente: reimportar no duplica. Guarda alias si se indica.
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
    // Marcar PROSPECT→CUSTOMER a empresas con compras.
    if (inserted > 0) {
      const seen = new Set(rows.map((r) => r.company_id));
      for (const companyId of seen) {
        try {
          const company = await crmRepository.getCompany(companyId, organizationId);
          if (company && !company.lifecycle_stage) {
            await crmRepository.updateCompany(companyId, organizationId, { lifecycle_stage: 'CUSTOMER' } as never);
          }
        } catch {
          // No bloquear importación por este marcado.
        }
      }
    }
    return { inserted, duplicates, errors };
  },

  async getPurchases(organizationId: string, companyId?: string, limit = 500): Promise<ReturnType<typeof crmRepository.listPurchases>> {
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
    return { stats, totals, monthly, history: purchases.slice(0, 200) };
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

  async getAlerts(organizationId: string, todayTs = Date.now()): Promise<RepurchaseAlert[]> {
    const [companies, purchases, contacts] = await Promise.all([
      crmRepository.listCompanies(organizationId),
      crmRepository.listPurchases(organizationId, undefined, 5000),
      crmRepository.listContacts(organizationId),
    ]);
    const byName = new Map(companies.map((c) => [c.id, c]));
    const mainContact = new Map<string, { full_name: string; whatsapp_phone?: string | null }>();
    for (const ct of contacts) {
      if (ct.company_id && !mainContact.has(ct.company_id)) {
        mainContact.set(ct.company_id, { full_name: ct.full_name, whatsapp_phone: ct.whatsapp_phone ?? null });
      }
    }
    const like: PurchaseLike[] = purchases.map((p) => toRows(p));
    return analyzeAll(like, todayTs)
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

  /**
   * Motor de tareas idempotente. CONTACT_SOON crea una vez por ciclo
   * (key con fecha esperada). OVERDUE sube a HIGH si sigue abierta.
   */
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
