// Proves a snapshot made by backup-split.mjs is recoverable: rebuilds the pre-industrial schema in
// the local PostgreSQL from the repo migrations, restores every table from snapshot.json, and checks
// that each restored table is identical to its source rows (count + hash of canonical jsonb text).
// Numbers are compared by value: the Supabase connector serializes 3100.0000 as 3100, so trailing
// decimal zeros are stripped on BOTH sides before hashing (strings and every other value are exact).
// Tables that exist in the snapshot but not in the repo-built schema are reported explicitly.
// Usage: node restore-check.mjs <backup-dir>
import fs from 'node:fs';
import path from 'node:path';
import { startDatabase, installSupabaseStub, applyMigrations } from './lib.mjs';

const snapshot = fs.readFileSync(path.join(path.resolve(process.argv[2]), 'snapshot.json'), 'utf8');
const { server, client } = await startDatabase();
let ok = true;
try {
  await installSupabaseStub(client);
  const base = await applyMigrations(client, (f) => f < '20261008');
  if (base.failed) throw new Error('schema rebuild failed');
  await client.query('set search_path = public, extensions');
  // The snapshot serializes timestamps in UTC (Supabase default); compare in the same zone.
  await client.query(`set timezone = 'UTC'`);
  // Superuser-only: lets us load tables in any order despite foreign keys.
  await client.query(`set session_replication_role = replica`);

  const tables = (await client.query(`select jsonb_array_elements_text($1::jsonb -> '_tables') t order by 1`, [snapshot])).rows.map((r) => r.t);
  const localTables = new Set((await client.query(`select tablename from pg_tables where schemaname='public'`)).rows.map((r) => r.tablename));
  const norm = (expr) => String.raw`regexp_replace(regexp_replace(${expr}, '(\.[0-9]*[1-9])0+([,}\] ])', '\1\2', 'g'), '\.0+([,}\] ])', '\1', 'g')`;
  const hash = (rel) => `select count(*)::int n, coalesce(md5(string_agg(md5(${norm('e::text')}), '' order by md5(${norm('e::text')}))), '') h from ${rel} e`;
  const results = [];
  for (const table of tables) {
    const source = (await client.query(hash(`jsonb_array_elements($1::jsonb -> '${table}')`), [snapshot])).rows[0];
    if (!localTables.has(table)) {
      results.push({ table, status: source.n === 0 ? 'EMPTY_TABLE_NOT_IN_REPO_SCHEMA' : 'MISSING_IN_LOCAL_SCHEMA', rows: source.n });
      if (source.n !== 0) ok = false;
      continue;
    }
    if (source.n > 0) {
      await client.query(`insert into public."${table}" select * from jsonb_populate_recordset(null::public."${table}", $1::jsonb -> '${table}')`, [snapshot]);
    }
    const restored = (await client.query(`select count(*)::int n, coalesce(md5(string_agg(md5(${norm('to_jsonb(t)::text')}), '' order by md5(${norm('to_jsonb(t)::text')}))), '') h from public."${table}" t`)).rows[0];
    const same = restored.n === source.n && restored.h === source.h;
    if (!same) ok = false;
    results.push({ table, status: same ? 'OK' : 'MISMATCH', rows: source.n, restored: restored.n });
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  console.log(`tables: ${results.length}, identical: ${count('OK')}, empty & not in repo schema: ${count('EMPTY_TABLE_NOT_IN_REPO_SCHEMA')}, mismatches: ${count('MISMATCH') + count('MISSING_IN_LOCAL_SCHEMA')}`);
  console.log(`rows restored: ${results.reduce((s, r) => s + (r.restored || 0), 0)} of ${results.reduce((s, r) => s + r.rows, 0)}`);
  for (const r of results.filter((x) => x.status !== 'OK')) console.log('  ', JSON.stringify(r));
} catch (error) {
  console.error(error);
  ok = false;
} finally {
  await client.end();
  await server.stop();
}
console.log(ok ? 'RESTORE VERIFIED: every table identical to the production snapshot' : 'RESTORE NOT VERIFIED');
process.exitCode = ok ? 0 : 1;
