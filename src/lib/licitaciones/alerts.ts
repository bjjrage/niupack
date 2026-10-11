import { licitacionesDb as db, licitacionesRethrow as rethrow } from './service';

export interface TenderAlerts {
  /** Abiertas cuyo cierre de ofertas es en los próximos 7 días. */
  closing_soon: number;
  /** Detectadas por el escáner en las últimas 24 horas. */
  new_24h: number;
  /** Adjudicadas en los últimos 7 días. */
  awarded_7d: number;
  /** Total de licitaciones en curso (abiertas o en evaluación). */
  open_total: number;
  total: number;
  scan_enabled: boolean;
  last_run_status: 'RUNNING' | 'OK' | 'PARTIAL' | 'FAILED' | null;
  last_run_at: string | null;
}

const DAY = 86_400_000;

/** Alertas de Licitaciones para el dashboard. Datos reales de la base; nunca valores de ejemplo. */
export async function getTenderAlerts(organizationId: string, now: Date = new Date()): Promise<TenderAlerts> {
  const client = db();
  const nowIso = now.toISOString();
  const count = async (build: (q: any) => any) => {
    const { count: n, error } = await build(client.from('licitaciones_tenders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_test_data', false));
    if (error) rethrow(error, 'licitaciones_tenders');
    return n ?? 0;
  };
  const [closing, fresh, awarded, open, total, settings, runs] = await Promise.all([
    count((q) => q.eq('phase', 'ABIERTA').gt('closing_at', nowIso).lte('closing_at', new Date(now.getTime() + 7 * DAY).toISOString())),
    count((q) => q.gte('created_at', new Date(now.getTime() - DAY).toISOString())),
    count((q) => q.eq('phase', 'ADJUDICADA').gte('awarded_at', new Date(now.getTime() - 7 * DAY).toISOString())),
    count((q) => q.in('phase', ['ABIERTA', 'EN_EVALUACION'])),
    count((q) => q),
    client.from('licitaciones_scan_settings').select('enabled').eq('organization_id', organizationId).maybeSingle(),
    client.from('licitaciones_scan_runs').select('status, started_at').eq('organization_id', organizationId).order('started_at', { ascending: false }).limit(1),
  ]);
  for (const r of [settings, runs]) if (r.error) rethrow(r.error, 'licitaciones_scan');
  const last = runs.data?.[0];
  return {
    closing_soon: closing, new_24h: fresh, awarded_7d: awarded, open_total: open, total,
    scan_enabled: Boolean(settings.data?.enabled),
    last_run_status: (last?.status as TenderAlerts['last_run_status']) ?? null,
    last_run_at: last?.started_at ?? null,
  };
}

/** Texto y valor de la tarjeta, separados de la pantalla para poder probarlos. */
export function describeAlerts(alerts: TenderAlerts): { value: string; subtitle: string; alert: boolean } {
  if (!alerts.scan_enabled && alerts.total === 0) {
    return { value: '—', subtitle: 'Escaneo diario apagado: activalo en Licitaciones', alert: false };
  }
  if (alerts.total === 0) {
    return { value: '0', subtitle: 'Todavía no hay licitaciones cargadas: corré “Actualizar ahora”', alert: false };
  }
  const value = alerts.closing_soon + alerts.new_24h + alerts.awarded_7d;
  const parts = [`${alerts.closing_soon} cierran en 7 d`, `${alerts.new_24h} nuevas`, `${alerts.awarded_7d} adjudicadas`];
  const warning = alerts.last_run_status === 'FAILED' ? ' · el último escaneo falló' : !alerts.scan_enabled ? ' · escaneo apagado' : '';
  return { value: String(value), subtitle: `${parts.join(' · ')}${warning}`, alert: alerts.closing_soon > 0 || alerts.last_run_status === 'FAILED' };
}
