// Starts an isolated local PostgreSQL 17 (port 54329), installs a minimal Supabase stub
// (roles, auth schema, extensions schema, default grants) and applies every migration in
// supabase/migrations in order. The data directory is recreated on every run.
// Usage: node db.mjs [--keep]   (--keep leaves the server running for rest.mjs / tests)
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const dataDir = path.join(here, '.data');
const keep = process.argv.includes('--keep');

fs.rmSync(dataDir, { recursive: true, force: true });
const server = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port: 54329, persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});
await server.initialise();
await server.start();
await server.createDatabase('niupack_qa');

const client = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database: 'niupack_qa' });
await client.connect();

// Mirrors what a Supabase project provides before any NIUPACK migration runs.
await client.query(String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login password 'postgres' noinherit;
grant anon, authenticated, service_role to authenticator;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
alter database niupack_qa set search_path = public, extensions;
set search_path = public, extensions;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.email() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.email', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')) $$;
create function auth.role() returns text language sql stable as $$
  select coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), 'anon') $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant usage on schema auth, extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create schema storage;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

const migrationsDir = path.join(repo, 'supabase/migrations');
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
let failed = 0;
for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  try {
    await client.query('begin');
    await client.query('set search_path = public, extensions');
    await client.query(sql);
    await client.query('commit');
    console.log('OK  ', file);
  } catch (error) {
    await client.query('rollback');
    failed++;
    const near = error.position ? ` near: ${JSON.stringify(sql.slice(Math.max(0, error.position - 120), Number(error.position) + 60))}` : '';
    console.log('FAIL', file, '\n     ', error.message, near, error.where ?? '');
  }
}
console.log(`\n${files.length - failed}/${files.length} migrations applied`);
await client.end();
if (keep) console.log('PostgreSQL kept running on localhost:54329 (Ctrl+C to stop)');
else await server.stop();
process.exitCode = failed ? 1 : 0;
