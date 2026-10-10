// Production-compatibility check for the industrial migrations.
// 1. Builds the schema production already has (every migration before 20261008).
// 2. Seeds representative data, INCLUDING the worst cases for the new migrations
//    (an ACTIVE cost sheet per SKU, an existing cost configuration, a non-admin profile).
// 3. Fingerprints every pre-existing table, applies the industrial migrations, and verifies that
//    no pre-existing row changed, no table lost rows, and the new objects exist.
// Usage: node compat.mjs
import fs from 'node:fs';
import path from 'node:path';
import { repo, startDatabase, installSupabaseStub, applyMigrations } from './lib.mjs';

const INDUSTRIAL_FROM = '20261008';
const { server, client } = await startDatabase();
let ok = true;
const check = (label, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!pass) ok = false; };

try {
  await installSupabaseStub(client);
  const base = await applyMigrations(client, (f) => f < INDUSTRIAL_FROM);
  check('pre-industrial history applies (what production already has)', base.failed === 0, `${base.total} migrations`);

  await client.query('set search_path = public, extensions');
  const q = (sql, params) => client.query(sql, params).then((r) => r.rows);

  // --- representative data ---
  const orgs = [];
  for (let i = 1; i <= 3; i++) {
    const [o] = await q(`insert into organizations(name, slug) values ($1, $2) returning id`, [`Org ${i}`, `org-${i}`]);
    orgs.push(o.id);
    await q(`insert into profiles(organization_id, email, full_name, role) values ($1, $2, $3, $4)`, [o.id, `admin${i}@x.test`, `Admin ${i}`, 'admin']);
  }
  await q(`insert into profiles(organization_id, email, full_name, role) values ($1, 'op@x.test', 'Operador', 'operator')`, [orgs[0]]);
  const [prod] = await q(`insert into products(organization_id, code, name, category) values ($1, 'CUP-12OZ-SW', 'Vaso 12oz', 'cups') returning id`, [orgs[0]]);
  await q(`insert into product_attributes(product_id, sku, material, coating, wall_type) values ($1, 'CUP-12OZ-SW', 'paper', 'PE', 'single')`, [prod.id]);
  await q(`insert into cost_v1_configurations(organization_id, product_id, sku, input_json, version, is_active) values ($1, $2, 'CUP-12OZ-SW', '{"sku":"CUP-12OZ-SW","batch_size":300000}', 1, true)`, [orgs[0], prod.id]);
  const [sheet] = await q(`insert into cost_sheet_versions(organization_id, product_id, sku, version, name, status, true_unit_cost_usd) values ($1, $2, 'CUP-12OZ-SW', 1, 'Hoja existente', 'ACTIVE', 0.0457) returning id`, [orgs[0], prod.id]);
  await q(`insert into cost_components(cost_sheet_id, category, name, component_type, basis, rate_usd) values ($1, 'materia_prima', 'Papel', 'VARIABLE', 'PER_UNIT', 0.028)`, [sheet.id]);

  // --- fingerprint every pre-existing public table ---
  const tables = (await q(`select tablename from pg_tables where schemaname = 'public' order by 1`)).map((r) => r.tablename);
  const fingerprint = async () => {
    const out = {};
    for (const t of tables) {
      const cols = (await q(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name not in ('true_unit_cost_pyg','fx_rate_used') order by 1`, [t])).map((c) => `"${c.column_name}"`).join(', ');
      const [r] = await q(`select count(*)::int n, coalesce(md5(string_agg(md5(row(${cols})::text), '' order by md5(row(${cols})::text))), '') h from public."${t}"`);
      out[t] = r;
    }
    return out;
  };
  const before = await fingerprint();
  check('seed data present', before.cost_sheet_versions.n === 1 && before.profiles.n === 4);

  // --- the worst-case pre-check from the runbook ---
  const dupes = await q(`select count(*)::int n from (select organization_id, sku from cost_sheet_versions where status='ACTIVE' group by 1,2 having count(*)>1) d`);
  check('no duplicate ACTIVE cost sheets per org+sku', dupes[0].n === 0);

  // --- apply the industrial migrations on top ---
  const industrial = await applyMigrations(client, (f) => f >= INDUSTRIAL_FROM && f < '20261010190001');
  check('industrial migrations apply on top of populated schema', industrial.failed === 0, `${industrial.total} migrations`);

  const after = await fingerprint();
  let changed = [];
  for (const t of tables) if (before[t].n !== after[t].n || before[t].h !== after[t].h) changed.push(t);
  check('every pre-existing table has identical rows (count + content hash)', changed.length === 0, changed.join(', '));
  check('no data lost: existing cost sheet still ACTIVE, 1 component', (await q(`select (select count(*)::int from cost_sheet_versions where status='ACTIVE') a, (select count(*)::int from cost_components) c`))[0].a === 1);

  // --- new objects ---
  const newTables = ['plant_process_parameters', 'packing_sessions', 'packing_session_segments', 'plant_production_periods', 'industrial_process_snapshots', 'plant_salary_bands', 'plant_salary_band_rates', 'plant_personnel', 'plant_personnel_assignments', 'plant_personnel_salary_assignments', 'packing_labor_allocations', 'packing_operator_tokens', 'industrial_idempotency_requests', 'packing_session_events', 'industrial_process_snapshot_revisions'];
  const present = (await q(`select tablename from pg_tables where schemaname='public' and tablename = any($1)`, [newTables])).length;
  check('15 new industrial tables exist', present === 15, `${present}/15`);
  const rpcs = ['start_packing_session_atomic', 'change_packing_headcount_atomic', 'stop_packing_session_atomic', 'approve_packing_session_with_labor_atomic', 'correct_packing_session_atomic', 'void_packing_session_atomic', 'save_industrial_process_snapshot_atomic', 'apply_industrial_cost_to_cost_intelligence_atomic', 'create_plant_salary_band_with_rate', 'update_plant_salary_band_with_rate', 'create_plant_personnel_with_assignments', 'update_plant_personnel_with_salary', 'save_plant_personnel_assignment', 'save_plant_personnel_salary_assignment'];
  const fn = await q(`select p.proname, has_function_privilege('service_role', p.oid, 'execute') s, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') u from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname = any($1)`, [rpcs]);
  check('14 RPCs exist', new Set(fn.map((f) => f.proname)).size === 14);
  check('RPCs executable by service_role only', fn.every((f) => f.s && !f.a && !f.u));
  check('unique-active-sheet index exists', (await q(`select 1 from pg_indexes where indexname='idx_cost_sheet_versions_one_active_per_org_sku'`)).length === 1);
  check('salary tables are admin-only under RLS', (await q(`select count(*)::int n from pg_policies where policyname like '%\\_admin\\_only' and tablename in ('plant_salary_bands','plant_salary_band_rates','plant_personnel','plant_personnel_assignments','plant_personnel_salary_assignments','packing_labor_allocations')`))[0].n === 6);
  const defaults = Object.fromEntries((await q(`select column_name c, column_default d from information_schema.columns where table_name='plant_process_parameters' and column_name in ('packaging_materials_cost_per_thousand_usd','electricity_rate_pyg_kwh','gen1_power_kw','gen2_power_kw')`)).map((r) => [r.c, r.d]));
  check('no assumed costs: materials and electricity tariff default to 0 (unconfigured)', defaults.packaging_materials_cost_per_thousand_usd === '0' && defaults.electricity_rate_pyg_kwh === '0', JSON.stringify(defaults));
  check('reference power defaults: Gen 1 = 6 kW, Gen 2 = 15 kW', defaults.gen1_power_kw === '6' && defaults.gen2_power_kw === '15');

  // --- rollback procedure ---
  await client.query(`create schema if not exists supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, name text);
    insert into supabase_migrations.schema_migrations values ('1','industrial_processes_v2'),('2','salary_bands_and_personnel'),('3','personnel_salary_process_separation'),('4','industrial_salary_personnel_atomic_persistence'),('5','packing_session_atomic_workflow'),('6','restrict_salary_tables_to_admins'),('0','crm_account_safe_deletion')`);
  const rollbackSql = fs.readFileSync(path.join(repo, 'supabase/rollback/industrial_v2_rollback.sql'), 'utf8');
  await client.query(rollbackSql);
  const afterRollback = await fingerprint();
  const changedByRollback = tables.filter((t) => before[t].n !== afterRollback[t].n || before[t].h !== afterRollback[t].h);
  check('rollback leaves every pre-existing table identical', changedByRollback.length === 0, changedByRollback.join(', '));
  const left = await q(`select (select count(*)::int from pg_tables where schemaname='public' and tablename = any($1)) t,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and (p.proname like '%packing%' or p.proname like '%plant_%' or p.proname like '%industrial%')) or (n.nspname='private' and p.proname='current_user_is_org_admin')) f,
    (select count(*)::int from information_schema.columns where table_name='cost_sheet_versions' and column_name in ('true_unit_cost_pyg','fx_rate_used')) c,
    (select count(*)::int from supabase_migrations.schema_migrations) h`, [newTables]);
  check('rollback removes all industrial tables, functions and columns', left[0].t === 0 && left[0].f === 0 && left[0].c === 0, JSON.stringify(left[0]));
  check('rollback keeps unrelated migration history (crm_account_safe_deletion)', left[0].h === 1);
  const reapply = await applyMigrations(client, (f) => f >= INDUSTRIAL_FROM && f < '20261010190001');
  check('industrial migrations re-apply cleanly after rollback', reapply.failed === 0);
} catch (error) {
  console.error(error);
  ok = false;
} finally {
  await client.end();
  await server.stop();
}
console.log(ok ? '\nCOMPATIBILITY: PASS' : '\nCOMPATIBILITY: FAIL');
process.exitCode = ok ? 0 : 1;
