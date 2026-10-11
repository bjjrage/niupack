import { normalizeName } from '@/lib/crm/purchase-import';
import { DncpError, fetchDncpTender, searchDncpByParty, suggestSuppliersByName, type DncpHttpOptions, type RucSuggestion } from './dncp-client';
import { importTender, licitacionesDb as db, licitacionesRethrow as rethrow, LicitacionError, refreshCandidates } from './service';

/** Palabras que DNCP busca en la descripción de los ítems para la carga inicial de cada cliente. */
export const BACKFILL_KEYWORDS = ['inyectable', 'ampolla'];
const DAILY_MAX_PAGES = 5;
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
  clients_total: number;
  clients_scanned: number;
  tenders_seen: number;
  tenders_imported: number;
  matches_created: number;
  errors: Array<{ client?: string; code: string; message: string }>;
  note?: string;
}

interface WatchRow { id: string; company_id: string; ruc_digits: string; dncp_party_id: string; backfilled_at: string | null; last_seen_date: string | null }

export async function getScanSettings(organizationId: string) {
  const { data, error } = await db().from('licitaciones_scan_settings').select('*').eq('organization_id', organizationId).maybeSingle();
  if (error) rethrow(error, 'licitaciones_scan_settings');
  return data ?? { organization_id: organizationId, enabled: false, backfill_pages: 3, updated_at: null };
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

export async function syncWatchlist(organizationId: string) {
  const { data, error } = await db().rpc('licitaciones_sync_watchlist', { p_organization_id: organizationId });
  if (error) rethrow(error, 'licitaciones_sync_watchlist');
  return data as { added: number; changed: number; disabled: number; without_ruc: number; watching: number };
}

/**
 * Escanea DNCP para una organización: por cada cliente con RUC trae sus licitaciones nuevas, se queda con las que tienen
 * inyectables y registra dónde participa. Idempotente, con marca de agua por cliente, sin inventar nada si DNCP falla.
 */
export async function scanOrganization(organizationId: string, trigger: 'CRON' | 'MANUAL', deps: ScanDeps = {}): Promise<ScanSummary> {
  const client = db();
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const budgetMs = deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const gap = deps.minIntervalMs ?? MIN_INTERVAL_MS;
  const http: DncpHttpOptions = { fetchImpl: deps.fetchImpl, sleep, retries: deps.retries };
  const started = now().getTime();
  const settings = await getScanSettings(organizationId);

  const { data: runRow, error: runError } = await client.from('licitaciones_scan_runs').insert({ organization_id: organizationId, trigger }).select('id').single();
  if (runError) rethrow(runError, 'licitaciones_scan_runs');
  const runId = runRow!.id as string;

  const summary: ScanSummary = { run_id: runId, organization_id: organizationId, status: 'OK', clients_total: 0, clients_scanned: 0, tenders_seen: 0, tenders_imported: 0, matches_created: 0, errors: [] };
  let aborted: string | null = null;
  let lastRequestAt = 0;
  const pace = async () => {
    const wait = lastRequestAt + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  };

  try {
    await syncWatchlist(organizationId);
    const { data: watchlist, error: wlError } = await client.from('licitaciones_watchlist').select('id, company_id, ruc_digits, dncp_party_id, backfilled_at, last_seen_date')
      .eq('organization_id', organizationId).eq('enabled', true).order('last_scanned_at', { ascending: true, nullsFirst: true });
    if (wlError) rethrow(wlError, 'licitaciones_watchlist');
    const rows = (watchlist ?? []) as WatchRow[];
    summary.clients_total = rows.length;
    const { data: names } = await client.from('crm_companies').select('id, name').eq('organization_id', organizationId).in('id', rows.map((r) => r.company_id));
    const nameById = new Map((names ?? []).map((n: { id: string; name: string }) => [n.id, n.name]));

    const { data: known, error: knownError } = await client.from('licitaciones_tenders').select('id, external_id, source_updated_at').eq('organization_id', organizationId);
    if (knownError) rethrow(knownError, 'licitaciones_tenders');
    const tenderByOcid = new Map((known ?? []).map((t: { id: string; external_id: string; source_updated_at: string | null }) => [t.external_id, t]));

    for (const row of rows) {
      if (Date.now() - started > budgetMs) { summary.status = 'PARTIAL'; summary.note = 'Se agotó el tiempo de la corrida: los clientes restantes siguen en la próxima.'; break; }
      const label = nameById.get(row.company_id) ?? row.company_id;
      try {
        const backfill = !row.backfilled_at;
        const watermark = row.last_seen_date ? new Date(row.last_seen_date).getTime() : 0;
        const collected = new Map<string, { ocid: string; date?: string }>();

        if (backfill) {
          for (const keyword of BACKFILL_KEYWORDS) {
            for (let page = 1; page <= settings.backfill_pages; page += 1) {
              await pace();
              const result = await searchDncpByParty(row.dncp_party_id, page, keyword, http);
              for (const hit of result.hits) collected.set(hit.ocid, { ocid: hit.ocid, date: hit.date });
              if (page >= result.totalPages) break;
            }
          }
        } else {
          for (let page = 1; page <= DAILY_MAX_PAGES; page += 1) {
            await pace();
            const result = await searchDncpByParty(row.dncp_party_id, page, undefined, http);
            let reachedKnown = false;
            for (const hit of result.hits) {
              const t = hit.date ? new Date(hit.date).getTime() : Number.POSITIVE_INFINITY;
              if (t <= watermark) { reachedKnown = true; continue; }
              collected.set(hit.ocid, { ocid: hit.ocid, date: hit.date });
            }
            if (reachedKnown || page >= result.totalPages) break;
          }
        }

        let newest = watermark;
        for (const hit of collected.values()) {
          summary.tenders_seen += 1;
          const hitTime = hit.date ? new Date(hit.date).getTime() : 0;
          if (hitTime > newest) newest = hitTime;
          const existing = tenderByOcid.get(hit.ocid);
          let tenderId = existing?.id;
          const upToDate = existing?.source_updated_at && hit.date && new Date(existing.source_updated_at).getTime() >= hitTime;
          if (!upToDate) {
            await pace();
            const { tender, rawRelease } = await fetchDncpTender(hit.ocid, http);
            if (!tender.items.some((i) => i.is_injectable)) continue; // no es de inyectables: no se guarda
            const imported = await importTender(organizationId, null, tender, rawRelease, { refresh: false });
            tenderId = imported.tender_id;
            tenderByOcid.set(hit.ocid, { id: imported.tender_id, external_id: hit.ocid, source_updated_at: tender.source_updated_at ?? null });
            summary.tenders_imported += 1;
          }
          if (tenderId) {
            const { data: created, error: matchError } = await client.rpc('licitaciones_register_client_matches', { p_organization_id: organizationId, p_tender_id: tenderId });
            if (matchError) rethrow(matchError, 'licitaciones_register_client_matches');
            summary.matches_created += Number(created ?? 0);
          }
        }

        const { error: updateError } = await client.from('licitaciones_watchlist').update({
          last_scanned_at: now().toISOString(), last_error: null,
          last_seen_date: newest ? new Date(newest).toISOString() : row.last_seen_date,
          backfilled_at: row.backfilled_at ?? now().toISOString(),
        }).eq('id', row.id);
        if (updateError) rethrow(updateError, 'licitaciones_watchlist');
        summary.clients_scanned += 1;
      } catch (error) {
        const code = error instanceof DncpError ? error.code : error instanceof LicitacionError ? error.code : 'SCAN_CLIENT_FAILED';
        const message = error instanceof Error ? error.message : 'Error desconocido';
        summary.errors.push({ client: label, code, message });
        await client.from('licitaciones_watchlist').update({ last_error: `${code}: ${message}`.slice(0, 300) }).eq('id', row.id);
        // Si DNCP nos limita o no responde, insistir con el resto solo empeora: se corta y se retoma después.
        if (error instanceof DncpError && (error.code === 'DNCP_RATE_LIMITED' || error.code === 'DNCP_UNREACHABLE')) { aborted = message; break; }
      }
    }

    if (summary.tenders_imported > 0) await refreshCandidates(organizationId);
  } catch (error) {
    summary.errors.push({ code: 'SCAN_FAILED', message: error instanceof Error ? error.message : 'Error desconocido' });
    aborted = aborted ?? 'SCAN_FAILED';
  }

  if (aborted) summary.status = summary.clients_scanned > 0 ? 'PARTIAL' : 'FAILED';
  else if (summary.errors.length) summary.status = summary.clients_scanned > 0 ? 'PARTIAL' : 'FAILED';
  const { error: finishError } = await client.from('licitaciones_scan_runs').update({
    status: summary.status, finished_at: now().toISOString(), clients_total: summary.clients_total, clients_scanned: summary.clients_scanned,
    tenders_seen: summary.tenders_seen, tenders_imported: summary.tenders_imported, matches_created: summary.matches_created,
    errors: summary.errors, note: summary.note ?? (aborted ? `Se detuvo: ${aborted}` : null),
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
// Clientes: estado de vigilancia, RUC y resultados
// ---------------------------------------------------------------------------------------------
export async function listClients(organizationId: string) {
  const client = db();
  const [companies, purchases, watch] = await Promise.all([
    client.from('crm_companies').select('id, name, tax_id, lifecycle_stage').eq('organization_id', organizationId),
    client.from('crm_customer_purchases').select('company_id').eq('organization_id', organizationId).limit(50_000),
    client.from('licitaciones_watchlist').select('company_id, ruc_digits, dncp_party_id, enabled, last_scanned_at, last_seen_date, backfilled_at, last_error').eq('organization_id', organizationId),
  ]);
  for (const r of [companies, purchases, watch]) if (r.error) rethrow(r.error, 'licitaciones_clients');
  const buyers = new Set((purchases.data ?? []).map((p: { company_id: string }) => p.company_id));
  const watchByCompany = new Map((watch.data ?? []).map((w: any) => [w.company_id, w]));
  return (companies.data ?? [])
    .filter((c: any) => c.lifecycle_stage === 'CUSTOMER' || buyers.has(c.id))
    .map((c: any) => {
      const digits = String(c.tax_id ?? '').replace(/\D/g, '');
      const w: any = watchByCompany.get(c.id);
      return {
        company_id: c.id, name: c.name, tax_id: c.tax_id ?? null, has_valid_ruc: digits.length >= 6 && digits.length <= 10,
        watching: Boolean(w?.enabled), last_scanned_at: w?.last_scanned_at ?? null, last_error: w?.last_error ?? null, backfilled: Boolean(w?.backfilled_at),
      };
    })
    .sort((a: any, b: any) => Number(a.has_valid_ruc) - Number(b.has_valid_ruc) || a.name.localeCompare(b.name));
}

export async function suggestRuc(organizationId: string, companyId: string, http: DncpHttpOptions = {}): Promise<RucSuggestion[]> {
  const { data, error } = await db().from('crm_companies').select('name').eq('organization_id', organizationId).eq('id', companyId).maybeSingle();
  if (error) rethrow(error, 'crm_companies');
  if (!data) throw new LicitacionError('COMPANY_NOT_FOUND', 404);
  return suggestSuppliersByName(String(data.name), normalizeName, http);
}

/** Guarda el RUC confirmado por una persona en la ficha del cliente (único punto donde el escáner escribe en el CRM). */
export async function setClientRuc(organizationId: string, companyId: string, ruc: string) {
  const digits = ruc.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 10) throw new LicitacionError('INVALID_RUC', 400, 'El RUC debe tener entre 6 y 10 dígitos.');
  const formatted = `${digits.slice(0, -1)}-${digits.slice(-1)}`;
  const client = db();
  const { data: others, error: dupError } = await client.from('crm_companies').select('id, name, tax_id').eq('organization_id', organizationId).neq('id', companyId);
  if (dupError) rethrow(dupError, 'crm_companies');
  const clash = (others ?? []).find((c: { tax_id: string | null }) => String(c.tax_id ?? '').replace(/\D/g, '') === digits);
  if (clash) throw new LicitacionError('RUC_ALREADY_ASSIGNED', 409, `Ese RUC ya pertenece a ${clash.name}.`);
  const { data, error } = await client.from('crm_companies').update({ tax_id: formatted, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', companyId).select('id, name, tax_id').maybeSingle();
  if (error) rethrow(error, 'crm_companies');
  if (!data) throw new LicitacionError('COMPANY_NOT_FOUND', 404);
  await syncWatchlist(organizationId);
  return data;
}

export async function listClientMatches(organizationId: string) {
  const client = db();
  const { data: matches, error } = await client.from('licitaciones_client_matches').select('id, tender_id, company_id, role, role_confirmed, first_seen_at, acknowledged_at')
    .eq('organization_id', organizationId).order('first_seen_at', { ascending: false }).limit(500);
  if (error) rethrow(error, 'licitaciones_client_matches');
  const rows = matches ?? [];
  if (!rows.length) return [];
  const tenderIds = [...new Set(rows.map((m: any) => m.tender_id))];
  const companyIds = [...new Set(rows.map((m: any) => m.company_id))];
  const [tenders, companies, items, winners] = await Promise.all([
    client.from('licitaciones_tenders').select('id, external_id, title, convening_entity, status, source_url, published_at, awarded_at, source_updated_at, is_test_data').eq('organization_id', organizationId).in('id', tenderIds),
    client.from('crm_companies').select('id, name, tax_id').eq('organization_id', organizationId).in('id', companyIds),
    client.from('licitaciones_items').select('tender_id, description, quantity, unit, presentation').eq('organization_id', organizationId).eq('is_injectable', true).in('tender_id', tenderIds),
    client.from('licitaciones_parties').select('tender_id, name, ruc').eq('organization_id', organizationId).eq('role', 'ADJUDICATARIO').in('tender_id', tenderIds),
  ]);
  for (const r of [tenders, companies, items, winners]) if (r.error) rethrow(r.error, 'licitaciones_matches');
  const tenderById = new Map((tenders.data ?? []).map((t: any) => [t.id, t]));
  const companyById = new Map((companies.data ?? []).map((c: any) => [c.id, c]));
  return rows.map((m: any) => ({
    ...m,
    tender: tenderById.get(m.tender_id) ?? null,
    client: companyById.get(m.company_id) ?? null,
    products: (items.data ?? []).filter((i: any) => i.tender_id === m.tender_id).slice(0, 5),
    awarded_to: [...new Set((winners.data ?? []).filter((w: any) => w.tender_id === m.tender_id).map((w: any) => w.name))],
  }));
}

export async function acknowledgeMatch(organizationId: string, matchId: string, profileId: string) {
  const { data, error } = await db().from('licitaciones_client_matches')
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by_profile_id: profileId })
    .eq('organization_id', organizationId).eq('id', matchId).is('acknowledged_at', null).select('id').maybeSingle();
  if (error) rethrow(error, 'licitaciones_client_matches');
  if (!data) {
    const { data: exists } = await db().from('licitaciones_client_matches').select('id').eq('organization_id', organizationId).eq('id', matchId).maybeSingle();
    if (!exists) throw new LicitacionError('MATCH_NOT_FOUND', 404);
  }
  return { id: matchId, acknowledged: true };
}
