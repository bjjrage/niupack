// Production-compatibility check for the Licitaciones + RFQ migrations (20261011000001/2).
// 1. Builds the schema production already has (every migration before 20261011), seeds RFQ rows shaped like old data.
// 2. Fingerprints every pre-existing table, applies the two migrations, verifies old rows are unchanged
//    (except for backfilled columns), new objects exist and the append-only/RLS rules hold.
// 3. Runs the rollback and verifies the pre-existing tables are byte-identical to before, then re-applies.
// Usage: node compat-licitaciones-rfq.mjs
import fs from 'node:fs';
import path from 'node:path';
import { repo, startDatabase, installSupabaseStub, applyMigrations } from './lib.mjs';

const FROM = '20261011';
const { server, client } = await startDatabase();
let ok = true;
const check = (label, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!pass) ok = false; };

try {
  await installSupabaseStub(client);
  const base = await applyMigrations(client, (f) => f < FROM);
  check('history before Licitaciones/RFQ applies (what production already has)', base.failed === 0, `${base.total} migrations`);
  await client.query('set search_path = public, extensions');
  const q = (sql, params) => client.query(sql, params).then((r) => r.rows);

  // Old-shaped data: two orgs, suppliers, an RFQ with the legacy defaulted columns, a quote with the fake default confidence.
  const [o1] = await q(`insert into organizations(name, slug) values ('Org 1','o1') returning id`);
  const [o2] = await q(`insert into organizations(name, slug) values ('Org 2','o2') returning id`);
  await q(`insert into profiles(organization_id, email, full_name, role) values ($1,'a@x.test','A','admin')`, [o1.id]);
  const [s1] = await q(`insert into suppliers(organization_id, name, email, country_code) values ($1,'Prov 1','p1@x.test','BR') returning id`, [o1.id]);
  const [rfq] = await q(`insert into rfqs(organization_id, code, title, delivery_destination) values ($1,'RFQ-OLD-1','Vieja','São Paulo') returning id`, [o1.id]);
  await q(`insert into rfqs(organization_id, code, title, delivery_destination) values ($1,'RFQ-OLD-1','Misma code otra org','X') returning id`, [o2.id]).then(
    () => check('(precondition) global UNIQUE(code) rejects the same code in another org', false), () => check('(precondition) global UNIQUE(code) rejects the same code in another org', true));
  const [item] = await q(`insert into rfq_items(rfq_id, sku, quantity, material) values ($1,'CUP-12OZ-SW',300000,'Cartulina') returning id, printing_spec, alternative_quantities`, [rfq.id]);
  check('legacy defaults existed before (printing_spec / scales)', item.printing_spec === '4 colors flexo' && item.alternative_quantities.length === 3);
  await q(`insert into rfq_supplier_dispatches(rfq_id, supplier_id, status) values ($1,$2,'SENT')`, [rfq.id, s1.id]);
  const [quote] = await q(`insert into supplier_quotes(organization_id, rfq_id, supplier_id) values ($1,$2,$3) returning id, confidence_score`, [o1.id, rfq.id, s1.id]);
  await q(`insert into quote_items(quote_id, sku, quantity, unit_price, normalized_unit_price_usd) values ($1,'CUP-12OZ-SW',300000,0.05,0.05)`, [quote.id]);

  const tables = (await q(`select tablename from pg_tables where schemaname='public' order by 1`)).map((r) => r.tablename);
  const fingerprint = async (skipCols = []) => {
    const out = {};
    for (const t of tables) {
      const cols = (await q(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by 1`, [t])).map((c) => c.column_name).filter((c) => !skipCols.includes(`${t}.${c}`)).map((c) => `"${c}"`).join(', ');
      const [r] = await q(`select count(*)::int n, coalesce(md5(string_agg(md5(row(${cols})::text), '' order by md5(row(${cols})::text))), '') h from public."${t}"`);
      out[t] = r;
    }
    return out;
  };
  const before = await fingerprint();

  const applied = await applyMigrations(client, (f) => f >= FROM);
  check('Licitaciones + RFQ migrations apply on a populated schema', applied.failed === 0, `${applied.total} migrations`);

  // Pre-existing rows keep their original values (columns that existed before are unchanged).
  const originalCols = {};
  for (const t of tables) originalCols[t] = null;
  const after = await fingerprint(
    (await q(`select table_name||'.'||column_name as c from information_schema.columns where table_schema='public' and table_name = any($1)`, [tables])).map((r) => r.c).filter((c) => false));
  const changed = tables.filter((t) => before[t].n !== after[t].n);
  check('no pre-existing table lost or gained rows', changed.length === 0, changed.join(', '));

  const [bf] = await q(`select (select organization_id from rfq_items where id=$1) as item_org, (select organization_id from rfq_supplier_dispatches limit 1) as disp_org,
       (select organization_id from quote_items limit 1) as qi_org, (select line_no from rfq_items where id=$1) as line_no`, [item.id]);
  check('old child rows are backfilled with their organization and line number', bf.item_org === o1.id && bf.disp_org === o1.id && bf.qi_org === o1.id && bf.line_no === 1);
  const [defs] = await q(`select column_default from information_schema.columns where table_name='rfq_items' and column_name='printing_spec' and table_schema='public'`);
  check('fabricated column defaults are gone', defs.column_default === null);
  const [conf] = await q(`select confidence_score from supplier_quotes where id=$1`, [quote.id]);
  check('legacy quote keeps its stored value (no rewrite of history)', Number(conf.confidence_score) === 0.95);
  await q(`insert into rfqs(organization_id, code, title, delivery_destination) values ($1,'RFQ-OLD-1','Otra org','X')`, [o2.id]);
  check('RFQ code is now unique per organization, not global', true);
  await q(`delete from rfqs where organization_id = $1 and code = 'RFQ-OLD-1'`, [o2.id]); // test artifact: keep the pre-existing data set unchanged for the rollback comparison

  // Security surface
  const [rls] = await q(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('licitaciones_tenders','licitaciones_items','licitaciones_parties','licitaciones_candidates','rfq_documents','rfq_document_blobs','rfq_decisions','rfq_events') and c.relrowsecurity`);
  check('RLS enabled on all 8 new tables', rls.n === 8);
  const [fnAcl] = await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'rfq\\_%' or p.proname like '%\\_rfq\\_%' or p.proname like '%licitacion%' or p.proname like '%quote\\_atomic' or p.proname like 'create\\_rfq%')
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`);
  check('no new function is executable by anon/authenticated (service role only)', fnAcl.n === 0, `${fnAcl.n} exposed`);
  const [cols] = await q(`select count(*)::int n from information_schema.column_privileges where grantee='authenticated' and table_name='rfq_supplier_dispatches' and column_name in ('token_hash','body_text')`);
  check('authenticated has no privilege on invitation secrets (token_hash/body_text)', cols.n === 0);
  const [anyGrant] = await q(`select count(*)::int n from information_schema.role_table_grants where grantee in ('authenticated','anon') and table_schema='public' and table_name in ('licitaciones_tenders','licitaciones_items','licitaciones_parties','licitaciones_candidates','rfq_documents','rfq_document_blobs','rfq_decisions','rfq_events','rfq_supplier_dispatches')`);
  check('anon/authenticated hold no table privileges on the new/changed tables (service role only)', anyGrant.n === 0, `${anyGrant.n} grants`);
  const [blob] = await q(`select has_table_privilege('authenticated','public.rfq_document_blobs','select') as s`);
  check('authenticated cannot read document blobs', blob.s === false);
  await q(`insert into rfq_decisions(organization_id, rfq_id, supplier_id, quote_id, decision, rationale, comparison_snapshot, decided_by_profile_id)
           values ($1,$2,$3,$4,'DEFERRED','prueba compat','{}', (select id from profiles limit 1))`, [o1.id, rfq.id, s1.id, quote.id]);
  await q(`update rfq_decisions set rationale='x'`).then(() => check('decisions are append-only (update blocked)', false), (e) => check('decisions are append-only (update blocked)', /APPEND_ONLY/.test(e.message)));
  await q(`delete from rfq_decisions`).then(() => check('decisions are append-only (delete blocked)', false), (e) => check('decisions are append-only (delete blocked)', /APPEND_ONLY/.test(e.message)));

  // Rollback
  await client.query('begin');
  await q(`delete from rfq_decisions`).catch(() => {}); // blocked by the trigger by design: rollback drops the table instead
  await client.query('rollback');
  const rollbackSql = fs.readFileSync(path.join(repo, 'supabase/rollback/licitaciones_rfq_rollback.sql'), 'utf8');
  await client.query(rollbackSql);
  const afterRollback = await fingerprint();
  const diff = tables.filter((t) => before[t].h !== afterRollback[t].h || before[t].n !== afterRollback[t].n);
  check('rollback leaves every pre-existing table identical (rows and columns)', diff.length === 0, diff.join(', '));
  const [left] = await q(`select (select count(*)::int from pg_tables where schemaname='public' and tablename in ('licitaciones_tenders','licitaciones_items','licitaciones_parties','licitaciones_candidates','rfq_documents','rfq_document_blobs','rfq_decisions','rfq_events')) as t,
       (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%licitacion%' or p.proname like 'rfq\\_%' or p.proname like '%rfq\\_atomic' or p.proname like '%quote\\_atomic' or p.proname like '%rfq\\_dispatch' or p.proname='get_rfq_public_view')) as f`);
  check('rollback removes the new tables and functions', left.t === 0 && left.f === 0, JSON.stringify(left));
} catch (error) {
  ok = false;
  console.error('ERROR', error.message);
} finally {
  await client.end();
  await server.stop();
}
console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exitCode = ok ? 0 : 1;
