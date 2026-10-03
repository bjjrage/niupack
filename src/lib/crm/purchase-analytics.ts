// Motor de cadencia y recompra. Puro y determinista (testeable sin DB).
// Métrica principal: MEDIANA de días entre compras sobre los últimos 6–12 intervalos.

import type { CustomerTotals, RepurchaseStatus, SkuConsumption } from './purchase-types';

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

const DAY = 86400000;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string): number {
  const t = new Date(`${s}T12:00:00Z`).getTime();
  return t;
}

export interface PurchaseLike {
  company_id: string;
  sku: string;
  product_name: string;
  purchase_date: string;
  quantity: number;
  total_value?: number | null;
  unit_price?: number | null;
  currency?: string | null;
}

export function analyzeSku(companyId: string, sku: string, rows: PurchaseLike[], todayTs = Date.now()): SkuConsumption {
  const sorted = [...rows].sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));
  const quantities = sorted.map((r) => r.quantity);
  const values = sorted.map((r) =>
    typeof r.total_value === 'number' && Number.isFinite(r.total_value)
      ? r.total_value
      : r.quantity * (typeof r.unit_price === 'number' && Number.isFinite(r.unit_price) ? r.unit_price : 0),
  );
  const hasValue = sorted.some(
    (r) => (typeof r.total_value === 'number' && r.total_value > 0) || (typeof r.unit_price === 'number' && r.unit_price > 0),
  );

  const inWindow = (days: number): PurchaseLike[] => sorted.filter((r) => todayTs - parseDate(r.purchase_date) <= days * DAY);
  const in365 = inWindow(365);
  const in365Idx = new Set(in365.map((r) => sorted.indexOf(r)));

  // Intervalos entre compras consecutivas (en días), últimos 12 como máximo.
  const allIntervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    allIntervals.push(Math.round((parseDate(sorted[i].purchase_date) - parseDate(sorted[i - 1].purchase_date)) / DAY));
  }
  const intervals = allIntervals.slice(-12);

  const medRaw = median(intervals);
  // Cadencia en días enteros (la mediana de un n° par se redondea).
  const med = medRaw == null ? null : Math.round(medRaw);
  const mean = avg(intervals);
  const cv = mean && mean > 0 && med != null ? std(intervals) / mean : null;
  const confidence = intervals.length >= 6 && (cv ?? 1) <= 0.3 ? 'HIGH' : intervals.length >= 3 ? 'MEDIUM' : 'LOW';

  let status: RepurchaseStatus;
  let expected: string | null = null;
  let daysUntil: number | null = null;
  if (sorted.length < 3 || med == null) {
    status = 'INSUFFICIENT_DATA';
  } else {
    expected = toISODate(new Date(parseDate(sorted[sorted.length - 1].purchase_date) + med * DAY));
    daysUntil = Math.round((parseDate(expected) - startOfDay(todayTs)) / DAY);
    const soonThreshold = Math.max(7, med * 0.2);
    if (daysUntil < 0) status = 'OVERDUE';
    else if (daysUntil <= soonThreshold) status = 'CONTACT_SOON';
    else status = 'ON_CYCLE';
  }

  return {
    company_id: companyId,
    sku,
    product_name: sorted[sorted.length - 1]?.product_name ?? sku,
    purchase_count: sorted.length,
    first_purchase_date: sorted[0]?.purchase_date ?? '',
    last_purchase_date: sorted[sorted.length - 1]?.purchase_date ?? '',
    last_purchase_quantity: sorted[sorted.length - 1]?.quantity ?? 0,
    average_order_quantity: avg(quantities) ?? 0,
    median_order_quantity: median(quantities) ?? 0,
    total_quantity_30d: sum(inWindow(30).map((r) => r.quantity)),
    total_quantity_90d: sum(inWindow(90).map((r) => r.quantity)),
    total_quantity_180d: sum(inWindow(180).map((r) => r.quantity)),
    total_quantity_365d: sum(inWindow(365).map((r) => r.quantity)),
    purchases_365d: inWindow(365).length,
    average_order_value: hasValue ? (avg(values) ?? null) : null,
    total_value_365d: hasValue ? sum([...in365Idx].map((i) => values[i])) : 0,
    average_days_between_orders: mean,
    median_days_between_orders: med,
    min_days_between_orders: intervals.length ? Math.min(...intervals) : null,
    max_days_between_orders: intervals.length ? Math.max(...intervals) : null,
    expected_next_purchase_at: expected,
    days_until_expected_purchase: daysUntil,
    cadence_confidence: confidence,
    repurchase_status: status,
  };
}

function std(values: number[]): number {
  if (values.length === 0) return 0;
  const m = avg(values) ?? 0;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Agrupa por compañía × SKU. Nunca mezcla cadencias de distintos SKUs. */
export function analyzeAll(purchases: PurchaseLike[], todayTs = Date.now()): SkuConsumption[] {
  const groups = new Map<string, PurchaseLike[]>();
  for (const p of purchases) {
    const key = `${p.company_id}|||${p.sku}`;
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [company_id, sku] = key.split('|||');
    return analyzeSku(company_id, sku, rows, todayTs);
  });
}

/** Resumen total por cliente (sin mezclar frecuencias entre SKUs). */
export function customerTotals(companyId: string, stats: SkuConsumption[], purchases: PurchaseLike[], todayTs = Date.now()): CustomerTotals {
  const rows = purchases.filter((p) => p.company_id === companyId);
  const inDays = (days: number): number =>
    sum(
      rows
        .filter((r) => todayTs - parseDate(r.purchase_date) <= days * DAY)
        .map((r) =>
          typeof r.total_value === 'number' && Number.isFinite(r.total_value)
            ? r.total_value
            : r.quantity * (typeof r.unit_price === 'number' && Number.isFinite(r.unit_price) ? r.unit_price : 0),
        ),
    );
  const hasAnyValue = rows.some(
    (r) => (typeof r.total_value === 'number' && r.total_value > 0) || (typeof r.unit_price === 'number' && r.unit_price > 0),
  );
  const mine = stats.filter((s) => s.company_id === companyId);
  const last = rows.length ? [...rows].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))[0].purchase_date : null;
  const rank: Record<RepurchaseStatus, number> = { OVERDUE: 3, CONTACT_SOON: 2, ON_CYCLE: 1, INSUFFICIENT_DATA: 0 };
  const actionable = mine.filter((s) => s.repurchase_status !== 'INSUFFICIENT_DATA');
  const worst = actionable.sort((a, b) => rank[b.repurchase_status] - rank[a.repurchase_status])[0]?.repurchase_status ?? null;
  const next = mine
    .filter((s) => s.expected_next_purchase_at)
    .sort((a, b) => (a.expected_next_purchase_at ?? '').localeCompare(b.expected_next_purchase_at ?? ''))[0];
  return {
    company_id: companyId,
    last_purchase_date: last,
    value_30d: hasAnyValue ? inDays(30) : 0,
    value_90d: hasAnyValue ? inDays(90) : 0,
    value_365d: hasAnyValue ? inDays(365) : 0,
    active_skus: mine.filter((s) => s.purchases_365d > 0).length,
    soon_count: mine.filter((s) => s.repurchase_status === 'CONTACT_SOON').length,
    overdue_count: mine.filter((s) => s.repurchase_status === 'OVERDUE').length,
    worst_status: worst,
    next_repurchase_at: next?.expected_next_purchase_at ?? null,
    next_repurchase_sku: next?.sku ?? null,
  };
}
