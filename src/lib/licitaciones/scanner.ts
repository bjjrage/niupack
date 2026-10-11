import { DncpError, fetchDncpTender, searchDncpByKeyword, type DncpHttpOptions } from './dncp-client';
import { importTender, licitacionesDb as db, licitacionesRethrow as rethrow, refreshCandidates } from './service';

/** Palabras que DNCP busca en la descripción de los ítems. El parser confirma cada licitación antes de guardarla. */
export const SCAN_KEYWORDS = ['inyectable', 'ampolla'];
const DAILY_MAX_PAGES = 8;
const DEFAULT_BUDGET_MS = 50_000;
const MIN_INTERVAL_MS = 350;

export interface ScanDeps extends DncpHttpOptions {
  now?: () => Date;
  /** Tiempo máximo de la corrida (las funciones serverless tienen tope). Lo que no alcance sigue en la próxima. */
  budgetMs?: number;
  minIntervalMs?: number;
}

export interface ScanSummary {
  run_id: string;
  organization_id: string;
  status: 'OK' | 'PARTIAL' | 'FAILED';
  tenders_seen: number;
  tenders_imported: number;
  tenders_new: number;
  errors: Array<{ keyword?: string; code: string; message: string }>;
  note?: string;
}

interface StateRow { keyword: string; last_seen_date: string | null; backfilled_at: string | null }

export async function getScanSettings(organizationId: string) {
  const { data, error } = await db().from('licitaciones_scan_settings').select('*').eq('organization_id', organizationId).maybeSingle();
  if (error) rethrow(error, 'licitaciones_scan_settings');
  return data ?? { organization_id: organizationId, enabled: false, backfill_pages: 5, updated_at: null };
}

export async function setScanEnabled(organizationId: string, profileId: string, enabled: boolean) {
  const { data, error } = await db().from('licitaciones_scan_settings')
    .upsert({ organization_id: organizationId, enabled, updated_by_profile_id: profileId, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' }).select().single();
  if (error) rethrow(error, 'licitaciones_scan_settings');
  return data;
}

export async function listScanRuns(organizationId: string, limit = 10) {
  const { data, error } = await db().from('licitaciones_scan_runs').select('*').eq('organization_id', organizationId).order('started_at', { ascending: false }).limit(limit);
  if (error) rethrow(error, 'licitaciones_scan_runs');
  return data ?? [];
}

/**
 * Escanea DNCP: por cada palabra clave lee las licitaciones nuevas o modificadas (DNCP las ordena por última modificación),
 * descarga la ficha completa y guarda las que realmente tienen medicamentos inyectables, con su etapa, participantes,
 * ganadores y productos adjudicados. Idempotente; si DNCP falla se informa y no se inventa nada.
 */
export async function scanOrganization(organizationId: string, trigger: 'CRON' | 'MANUAL', deps: ScanDeps = {}): Promise<ScanSummary> {
  const client = db();
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const budgetMs = deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const gap = deps.minIntervalMs ?? MIN_INTERVAL_MS;
  const http: DncpHttpOptions = { fetchImpl: deps.fetchImpl, sleep, retries: deps.retries };
  const started = Date.now();
  const settings = await getScanSettings(organizationId);

  const { data: runRow, error: runError } = await client.from('licitaciones_scan_runs').insert({ organization_id: organizationId, trigger }).select('id').single();
  if (runError) rethrow(runError, 'licitaciones_scan_runs');
  const runId = runRow!.id as string;
  const summary: ScanSummary = { run_id: runId, organization_id: organizationId, status: 'OK', tenders_seen: 0, tenders_imported: 0, tenders_new: 0, errors: [] };

  let lastRequestAt = 0;
  const pace = async () => {
    const wait = lastRequestAt + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  };
  let stopped: string | null = null;
  let completedKeywords = 0;

  try {
    const [{ data: states, error: stateError }, { data: known, error: knownError }] = await Promise.all([
      client.from('licitaciones_scan_state').select('keyword, last_seen_date, backfilled_at').eq('organization_id', organizationId),
      client.from('licitaciones_tenders').select('external_id, source_updated_at').eq('organization_id', organizationId),
    ]);
    if (stateError) rethrow(stateError, 'licitaciones_scan_state');
    if (knownError) rethrow(knownError, 'licitaciones_tenders');
    const stateByKeyword = new Map(((states ?? []) as StateRow[]).map((s) => [s.keyword, s]));
    const knownUpdated = new Map((known ?? []).map((t: { external_id: string; source_updated_at: string | null }) => [t.external_id, t.source_updated_at]));

    for (const keyword of SCAN_KEYWORDS) {
      if (Date.now() - started > budgetMs) { summary.status = 'PARTIAL'; summary.note = 'Se agotó el tiempo de la corrida: lo pendiente sigue en la próxima.'; break; }
      const state = stateByKeyword.get(keyword);
      const backfill = !state?.backfilled_at;
      const watermark = state?.last_seen_date ? new Date(state.last_seen_date).getTime() : 0;
      const maxPages = backfill ? settings.backfill_pages : DAILY_MAX_PAGES;
      const hits = new Map<string, { ocid: string; date?: string }>();
      let newest = watermark;
      try {
        for (let page = 1; page <= maxPages; page += 1) {
          await pace();
          const result = await searchDncpByKeyword(keyword, page, http);
          let reachedKnown = false;
          for (const hit of result.hits) {
            const t = hit.date ? new Date(hit.date).getTime() : Number.POSITIVE_INFINITY;
            if (!backfill && t <= watermark) { reachedKnown = true; continue; }
            hits.set(hit.ocid, { ocid: hit.ocid, date: hit.date });
            if (Number.isFinite(t) && t > newest) newest = t;
          }
          if (reachedKnown || page >= result.totalPages) break;
        }

        for (const hit of hits.values()) {
          if (Date.now() - started > budgetMs) { summary.status = 'PARTIAL'; summary.note = 'Se agotó el tiempo de la corrida: lo pendiente sigue en la próxima.'; stopped = 'BUDGET'; break; }
          summary.tenders_seen += 1;
          const stored = knownUpdated.get(hit.ocid);
          if (stored && hit.date && new Date(stored).getTime() >= new Date(hit.date).getTime()) continue; // ya está al día
          await pace();
          const { tender, rawRelease } = await fetchDncpTender(hit.ocid, http);
          if (!tender.items.some((i) => i.is_injectable)) continue; // no es de inyectables: no se guarda
          const imported = await importTender(organizationId, null, tender, rawRelease, { refresh: false });
          knownUpdated.set(hit.ocid, tender.source_updated_at ?? null);
          summary.tenders_imported += 1;
          if (imported.created) summary.tenders_new += 1;
        }
        if (stopped === 'BUDGET') break;

        const { error: saveError } = await client.from('licitaciones_scan_state').upsert({
          organization_id: organizationId, keyword, last_scanned_at: now().toISOString(), last_error: null,
          last_seen_date: newest ? new Date(newest).toISOString() : null, backfilled_at: state?.backfilled_at ?? now().toISOString(),
        }, { onConflict: 'organization_id,keyword' });
        if (saveError) rethrow(saveError, 'licitaciones_scan_state');
        completedKeywords += 1;
      } catch (error) {
        const code = error instanceof DncpError ? error.code : 'SCAN_KEYWORD_FAILED';
        const message = error instanceof Error ? error.message : 'Error desconocido';
        summary.errors.push({ keyword, code, message });
        await client.from('licitaciones_scan_state').upsert({ organization_id: organizationId, keyword, last_error: `${code}: ${message}`.slice(0, 300) }, { onConflict: 'organization_id,keyword' });
        // Si DNCP limita o no responde no se insiste con las demás palabras: se retoma en la próxima corrida.
        if (error instanceof DncpError && (error.code === 'DNCP_RATE_LIMITED' || error.code === 'DNCP_UNREACHABLE')) { stopped = message; break; }
      }
    }
    if (summary.tenders_imported > 0) await refreshCandidates(organizationId);
  } catch (error) {
    summary.errors.push({ code: 'SCAN_FAILED', message: error instanceof Error ? error.message : 'Error desconocido' });
    stopped = stopped ?? 'SCAN_FAILED';
  }

  if (summary.errors.length || (stopped && stopped !== 'BUDGET')) summary.status = completedKeywords > 0 || summary.tenders_imported > 0 ? 'PARTIAL' : 'FAILED';
  const { error: finishError } = await client.from('licitaciones_scan_runs').update({
    status: summary.status, finished_at: now().toISOString(), tenders_seen: summary.tenders_seen, tenders_imported: summary.tenders_imported,
    tenders_new: summary.tenders_new, errors: summary.errors, note: summary.note ?? (stopped && stopped !== 'BUDGET' ? `Se detuvo: ${stopped}` : null),
  }).eq('id', runId);
  if (finishError) rethrow(finishError, 'licitaciones_scan_runs');
  return summary;
}

/** Cron diario: corre para cada organización que activó el escaneo. */
export async function scanEnabledOrganizations(deps: ScanDeps = {}): Promise<ScanSummary[]> {
  const { data, error } = await db().from('licitaciones_scan_settings').select('organization_id').eq('enabled', true);
  if (error) rethrow(error, 'licitaciones_scan_settings');
  const results: ScanSummary[] = [];
  for (const row of data ?? []) results.push(await scanOrganization(row.organization_id as string, 'CRON', deps));
  return results;
}

// ---------------------------------------------------------------------------------------------
// Tablero: qué está corriendo, quiénes participan, quién ganó y qué se adjudicó
// ---------------------------------------------------------------------------------------------
export type BoardFilter = 'en_curso' | 'adjudicadas' | 'cerradas' | 'todas';
const PHASES: Record<BoardFilter, string[] | null> = {
  en_curso: ['ABIERTA', 'EN_EVALUACION'],
  adjudicadas: ['ADJUDICADA'],
  cerradas: ['CERRADA'],
  todas: null,
};

export async function listTenderBoard(organizationId: string, filter: BoardFilter = 'en_curso', search?: string) {
  const client = db();
  let query = client.from('licitaciones_tenders')
    .select('id, external_id, title, convening_entity, status, phase, published_at, closing_at, awarded_at, source_url, source_updated_at, is_test_data, source')
    .eq('organization_id', organizationId).order('source_updated_at', { ascending: false, nullsFirst: false }).limit(300);
  const phases = PHASES[filter];
  if (phases) query = query.in('phase', phases);
  const { data: tenders, error } = await query;
  if (error) rethrow(error, 'licitaciones_tenders');
  const rows = tenders ?? [];
  if (!rows.length) return [];
  const ids = rows.map((t: { id: string }) => t.id);
  const [items, parties, awards] = await Promise.all([
    client.from('licitaciones_items').select('tender_id, line_no, description, quantity, unit, presentation, is_injectable').eq('organization_id', organizationId).in('tender_id', ids).order('line_no'),
    client.from('licitaciones_parties').select('tender_id, role, name, ruc, item_id').eq('organization_id', organizationId).in('role', ['OFERENTE', 'INVITADO']).in('tender_id', ids),
    client.from('licitaciones_awards').select('tender_id, supplier_name, supplier_ruc, awarded_at, amount, currency, items').eq('organization_id', organizationId).in('tender_id', ids),
  ]);
  for (const r of [items, parties, awards]) if (r.error) rethrow(r.error, 'licitaciones_board');
  const needle = search?.trim().toLowerCase();
  const board = rows.map((t: any) => {
    const tItems = (items.data ?? []).filter((i: any) => i.tender_id === t.id);
    const injectable = tItems.filter((i: any) => i.is_injectable);
    const tParties = (parties.data ?? []).filter((p: any) => p.tender_id === t.id);
    const bidders = new Map<string, { name: string; ruc: string | null }>();
    const invited = new Map<string, { name: string; ruc: string | null }>();
    for (const p of tParties) (p.role === 'OFERENTE' ? bidders : invited).set(p.name, { name: p.name, ruc: p.ruc });
    return {
      ...t,
      products: injectable.slice(0, 12),
      products_total: injectable.length,
      bidders: [...bidders.values()],
      invited: [...invited.values()].filter((i) => !bidders.has(i.name)),
      awards: (awards.data ?? []).filter((a: any) => a.tender_id === t.id),
    };
  });
  if (!needle) return board;
  return board.filter((t) => `${t.title} ${t.convening_entity ?? ''} ${t.products.map((p: any) => p.description).join(' ')} ${t.awards.map((a: any) => a.supplier_name).join(' ')} ${t.bidders.map((b: any) => b.name).join(' ')}`.toLowerCase().includes(needle));
}
