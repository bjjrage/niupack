/**
 * Escáner diario de licitaciones contra PostgreSQL + PostgREST reales. DNCP se simula con respuestas construidas desde
 * releases REALES descargadas (fixtures); la prueba de conectividad real vive aparte (tests/external).
 * Se omite salvo NIUPACK_QA_DB=1 y se niega a correr fuera de localhost.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const enabled = process.env.NIUPACK_QA_DB === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (enabled && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error(`Refusing to run real-DB tests against non-local Supabase: ${url}`);

const real = (ocid: string) => JSON.parse(readFileSync(`tests/fixtures/dncp/${ocid}.json`, 'utf8')).releases[0];

/** DNCP simulada: buscador por palabra clave (más nuevo primero) + fichas OCDS por OCID. */
function makeDncp() {
  const releases = new Map<string, any>();
  const searchCalls: string[] = [];
  const releaseCalls: string[] = [];
  const state = { failWith: 0 };
  const put = (release: any) => releases.set(release.ocid, release);

  const handler = async (target: string) => {
    if (state.failWith) return new Response('{}', { status: state.failWith });
    const releaseMatch = /\/ocds\/releases\/ocid\/([^/?]+)/.exec(target);
    if (releaseMatch) {
      releaseCalls.push(decodeURIComponent(releaseMatch[1]));
      const r = releases.get(decodeURIComponent(releaseMatch[1]));
      return r ? new Response(JSON.stringify({ releases: [r] }), { status: 200 }) : new Response('{}', { status: 404 });
    }
    const search = /search\/processes\?tender\.items\.description=([^&]+)&page=(\d+)/.exec(target);
    if (search) {
      searchCalls.push(`${decodeURIComponent(search[1])}:${search[2]}`);
      const all = [...releases.values()].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const records = all.map((r) => ({ ocid: r.ocid, compiledRelease: { ocid: r.ocid, date: r.date, tender: { title: r.tender.title, statusDetails: r.tender.statusDetails } } }));
      const page = Number(search[2]);
      return new Response(JSON.stringify({ records: records.slice((page - 1) * 10, page * 10), pagination: { total_items: records.length, total_pages: Math.max(1, Math.ceil(records.length / 10)), current_page: page } }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const fetchImpl = (async (input: RequestInfo | URL) => handler(String(input))) as never;
  return { put, releases, fetchImpl, handler, searchCalls, releaseCalls, state };
}

describe.skipIf(!enabled)('escáner diario de licitaciones sobre PostgreSQL real', () => {
  let scanner: typeof import('@/lib/licitaciones/scanner');
  let admin: NonNullable<typeof import('@/lib/db/supabase').supabaseAdmin>;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const adminA = randomUUID();
  const dncp = makeDncp();
  const sleep = async () => {};
  const day = 86_400_000;

  const openRelease = () => {
    const r = JSON.parse(JSON.stringify(real('ocds-03ad3f-341163-1')));
    r.ocid = 'ocds-03ad3f-999001-1';
    r.date = new Date().toISOString();
    r.tender.title = 'ADQUISICION DE FILGRASTIM 300 MCG INYECTABLE (ABIERTA, PRUEBA)';
    r.tender.statusDetails = 'En Convocatoria (Abierta)';
    r.tender.tenderPeriod = { startDate: new Date(Date.now() - 3 * day).toISOString(), endDate: new Date(Date.now() + 9 * day).toISOString() };
    r.awards = [];
    delete r.bids;
    return r;
  };
  const notDrugRelease = () => {
    const r = JSON.parse(JSON.stringify(real('ocds-03ad3f-341163-1')));
    r.ocid = 'ocds-03ad3f-999002-1';
    r.date = new Date(Date.now() - 1000).toISOString();
    r.tender.title = 'ADQUISICION DE CEMENTO';
    r.tender.items = [{ id: 'x', description: 'Cemento portland', quantity: 10, unit: { name: 'Bolsa' }, attributes: [] }];
    r.awards = [];
    return r;
  };

  beforeAll(async () => {
    scanner = await import('@/lib/licitaciones/scanner');
    admin = (await import('@/lib/db/supabase')).supabaseAdmin!;
    // Base local compartida entre corridas: se parte sin ninguna organización con el escaneo activado.
    const cleared = await admin.from('licitaciones_scan_settings').update({ enabled: false }).eq('enabled', true);
    if (cleared.error) throw cleared.error;
    for (const [id, slug] of [[orgA, 'scan-a'], [orgB, 'scan-b']]) {
      const { error } = await admin.from('organizations').insert({ id, name: slug, slug: `${slug}-${id.slice(0, 8)}` });
      if (error) throw error;
    }
    const { error } = await admin.from('profiles').insert({ id: adminA, organization_id: orgA, email: `scan-${adminA}@qa.local`, full_name: 'QA', role: 'admin' });
    if (error) throw error;
    dncp.put({ ...real('ocds-03ad3f-402876-1'), date: '2026-09-01T10:00:00-04:00' });
    dncp.put({ ...real('ocds-03ad3f-341163-1'), date: '2026-08-01T10:00:00-04:00' });
    dncp.put(openRelease());
    dncp.put(notDrugRelease());
  });

  it('sin activar no escanea nada: el cron solo corre para quien lo encendió', async () => {
    const results = await scanner.scanEnabledOrganizations({ fetchImpl: dncp.fetchImpl, sleep, minIntervalMs: 0 });
    expect(results.find((r) => r.organization_id === orgA)).toBeUndefined();
    expect(dncp.searchCalls).toHaveLength(0);
    expect((await scanner.getScanSettings(orgA)).enabled).toBe(false);
  });

  it('primera corrida: guarda solo las licitaciones con inyectables, con etapa, participantes, ganador y productos adjudicados', async () => {
    await scanner.setScanEnabled(orgA, adminA, true);
    const results = await scanner.scanEnabledOrganizations({ fetchImpl: dncp.fetchImpl, sleep, minIntervalMs: 0 });
    const run = results.find((r) => r.organization_id === orgA)!;
    expect(run.status).toBe('OK');
    expect(run.tenders_imported).toBe(3);
    expect(run.tenders_new).toBe(3);
    expect(dncp.releaseCalls).not.toContain('ocds-03ad3f-999002-1' + '-x'); // sanidad
    // La licitación que no es de medicamentos se descargó para verificarla, pero no se guardó.
    const { data: stored } = await admin.from('licitaciones_tenders').select('external_id').eq('organization_id', orgA);
    expect(stored!.map((t) => t.external_id).sort()).toEqual(['ocds-03ad3f-341163-1', 'ocds-03ad3f-402876-1', 'ocds-03ad3f-999001-1']);

    const enCurso = await scanner.listTenderBoard(orgA, 'en_curso');
    expect(enCurso.map((t: any) => t.external_id)).toEqual(['ocds-03ad3f-999001-1']);
    expect(enCurso[0]).toMatchObject({ phase: 'ABIERTA', awards: [] });
    expect(enCurso[0].closing_at).toBeTruthy();
    expect(enCurso[0].invited.length + enCurso[0].bidders.length).toBeGreaterThan(0);

    const adjudicadas = await scanner.listTenderBoard(orgA, 'adjudicadas');
    expect(adjudicadas.map((t: any) => t.external_id).sort()).toEqual(['ocds-03ad3f-341163-1', 'ocds-03ad3f-402876-1']);
    const morfina = adjudicadas.find((t: any) => t.external_id === 'ocds-03ad3f-341163-1')!;
    expect(morfina.awards[0]).toMatchObject({ supplier_name: 'SCAVONE HERMANOS SA', supplier_ruc: '80001916-4', amount: 675000000 });
    expect(morfina.awards[0].items[0]).toMatchObject({ quantity: 125000, unit_amount: 5400 });
    expect(morfina.awarded_at).toMatch(/^2018-03-16/);
    const adalimumab = adjudicadas.find((t: any) => t.external_id === 'ocds-03ad3f-402876-1')!;
    expect(adalimumab.bidders.map((b: any) => b.name)).toEqual(expect.arrayContaining(['EXXEL TECHNOLOGIES S.A.E.', 'FARMACEUTICA PARAGUAYA S.A.']));
    expect(adalimumab.awards[0].supplier_name).toBe('EXXEL TECHNOLOGIES S.A.E.');
  });

  it('segunda corrida: no vuelve a descargar lo que no cambió', async () => {
    const before = dncp.releaseCalls.length;
    const run = await scanner.scanOrganization(orgA, 'MANUAL', { fetchImpl: dncp.fetchImpl, sleep, minIntervalMs: 0 });
    expect(run.status).toBe('OK');
    expect(run.tenders_imported).toBe(0);
    expect(dncp.releaseCalls.length).toBe(before);
  });

  it('cuando una licitación abierta se adjudica, se actualiza (no se duplica) y pasa a Adjudicadas', async () => {
    const updated = openRelease();
    updated.date = new Date(Date.now() + day).toISOString();
    updated.tender.statusDetails = 'Adjudicada';
    updated.awards = JSON.parse(JSON.stringify(real('ocds-03ad3f-341163-1').awards));
    updated.awards[0].date = new Date().toISOString();
    updated.awards[0].suppliers = [{ name: 'PROVEEDOR GANADOR DE PRUEBA S.A.', id: 'PY-RUC-80000001-1' }];
    dncp.put(updated);
    const run = await scanner.scanOrganization(orgA, 'MANUAL', { fetchImpl: dncp.fetchImpl, sleep, minIntervalMs: 0, now: () => new Date(Date.now() + day) });
    expect(run).toMatchObject({ status: 'OK', tenders_imported: 1, tenders_new: 0 });
    expect(await scanner.listTenderBoard(orgA, 'en_curso')).toHaveLength(0);
    const adjudicadas = await scanner.listTenderBoard(orgA, 'adjudicadas');
    const moved = adjudicadas.find((t: any) => t.external_id === 'ocds-03ad3f-999001-1')!;
    expect(moved.awards[0].supplier_name).toBe('PROVEEDOR GANADOR DE PRUEBA S.A.');
    const { data: rows } = await admin.from('licitaciones_tenders').select('id').eq('organization_id', orgA).eq('external_id', 'ocds-03ad3f-999001-1');
    expect(rows).toHaveLength(1);
    // Las adjudicaciones se reemplazan, no se acumulan.
    const { data: awards } = await admin.from('licitaciones_awards').select('id').eq('tender_id', moved.id);
    expect(awards).toHaveLength(1);
  });

  it('si DNCP limita la frecuencia (429) la corrida lo informa, no pierde lo guardado y no inventa nada', async () => {
    const before = (await scanner.listTenderBoard(orgA, 'todas')).length;
    dncp.state.failWith = 429;
    const run = await scanner.scanOrganization(orgA, 'MANUAL', { fetchImpl: dncp.fetchImpl, sleep, minIntervalMs: 0, retries: 1 });
    dncp.state.failWith = 0;
    expect(run.status).toBe('FAILED');
    expect(run.errors[0]).toMatchObject({ code: 'DNCP_RATE_LIMITED' });
    expect((await scanner.listTenderBoard(orgA, 'todas')).length).toBe(before);
    const runs = await scanner.listScanRuns(orgA);
    expect(runs[0]).toMatchObject({ status: 'FAILED' });
    const { data: state } = await admin.from('licitaciones_scan_state').select('keyword, last_error').eq('organization_id', orgA).eq('keyword', 'inyectable').single();
    expect(state!.last_error).toMatch(/DNCP_RATE_LIMITED/);
    // Se recupera sola en la siguiente corrida.
    const again = await scanner.scanOrganization(orgA, 'MANUAL', { fetchImpl: dncp.fetchImpl, sleep, minIntervalMs: 0 });
    expect(again.status).toBe('OK');
  });

  it('el tope de tiempo corta la corrida como PARCIAL y retoma después', async () => {
    const fresh = randomUUID();
    await admin.from('organizations').insert({ id: fresh, name: 'scan-c', slug: `scan-c-${fresh.slice(0, 8)}` });
    const run = await scanner.scanOrganization(fresh, 'MANUAL', { fetchImpl: dncp.fetchImpl, sleep, minIntervalMs: 0, budgetMs: -1 });
    expect(run.status).toBe('PARTIAL');
    expect(run.tenders_imported).toBe(0);
    const full = await scanner.scanOrganization(fresh, 'MANUAL', { fetchImpl: dncp.fetchImpl, sleep, minIntervalMs: 0 });
    expect(full.tenders_imported).toBe(3);
  });

  it('aislamiento: otra organización no ve estas licitaciones ni su configuración', async () => {
    expect(await scanner.listTenderBoard(orgB, 'todas')).toHaveLength(0);
    expect((await scanner.getScanSettings(orgB)).enabled).toBe(false);
    expect(await scanner.listScanRuns(orgB)).toHaveLength(0);
  });

  it('búsqueda por texto en el tablero: producto, entidad o proveedor', async () => {
    expect((await scanner.listTenderBoard(orgA, 'todas', 'morfina')).length).toBe(2);
    expect((await scanner.listTenderBoard(orgA, 'todas', 'GANADOR DE PRUEBA')).length).toBe(1);
    expect((await scanner.listTenderBoard(orgA, 'todas', 'zzzz-no-existe')).length).toBe(0);
  });

  describe('ruta del cron', () => {
    it('falla cerrado sin secreto, rechaza uno incorrecto y con el correcto escanea solo lo activado', async () => {
      const cron = await import('@/app/api/licitaciones/cron/route');
      const req = (token?: string) => new Request('http://localhost:3200/api/licitaciones/cron', { headers: token ? { authorization: `Bearer ${token}` } : {} });
      const saved = process.env.CRON_SECRET;
      try {
        delete process.env.CRON_SECRET;
        expect((await cron.GET(req('x'))).status).toBe(503);
        process.env.CRON_SECRET = 'secreto-de-prueba-largo-123456';
        expect((await cron.GET(req())).status).toBe(401);
        expect((await cron.GET(req('incorrecto'))).status).toBe(401);
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => (String(input).includes('contrataciones.gov.py') ? dncp.handler(String(input)) : realFetch(input, init))) as typeof fetch;
        vi.useFakeTimers({ toFake: ['setTimeout'] });
        try {
          const pending = cron.GET(req('secreto-de-prueba-largo-123456'));
          await vi.runAllTimersAsync();
          const res = await pending;
          expect(res.status).toBe(200);
          const body = await res.json();
          expect(body.organizations).toBeGreaterThanOrEqual(1);
        } finally { vi.useRealTimers(); globalThis.fetch = realFetch; }
      } finally {
        if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
      }
    }, 60_000);
  });
});
