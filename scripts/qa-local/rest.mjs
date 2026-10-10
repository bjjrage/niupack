// Supabase-compatible HTTP layer for the local QA database (requires `node db.mjs --keep`).
// - PostgREST on 127.0.0.1:54322 (binary at ./bin/postgrest.exe, see README)
// - Proxy on localhost:54321 exposing /rest/v1/* like Supabase
// - /auth/v1/user stand-in that validates locally signed JWTs (enough for supabase.auth.getUser())
// Writes qa.env with the local URL and keys for dev.mjs and the real-DB tests.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECRET, sign, verify } from './jwt.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
fs.writeFileSync(path.join(here, 'qa.env'), [
  'NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321',
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${sign({ role: 'anon', iss: 'supabase', exp })}`,
  `SUPABASE_SERVICE_ROLE_KEY=${sign({ role: 'service_role', iss: 'supabase', exp })}`,
  '',
].join('\n'));
fs.writeFileSync(path.join(here, 'postgrest.conf'), [
  'db-uri = "postgres://authenticator:postgres@localhost:54329/niupack_qa"',
  'db-schemas = "public"',
  'db-anon-role = "anon"',
  `jwt-secret = "${SECRET}"`,
  'server-host = "127.0.0.1"',
  'server-port = 54322',
  // The LISTEN channel makes PostgREST exit on Windows with the embedded server.
  'db-channel-enabled = false',
  'db-pool = 5',
  '',
].join('\n'));

// PostgREST needs libpq.dll, which ships with the embedded PostgreSQL binaries.
const pgBin = path.join(here, 'node_modules/@embedded-postgres/windows-x64/native/bin');
const postgrest = spawn(path.join(here, 'bin/postgrest.exe'), [path.join(here, 'postgrest.conf')], {
  stdio: 'inherit',
  env: { ...process.env, PATH: `${pgBin};${process.env.PATH}` },
});
postgrest.on('exit', (code) => { console.error(`PostgREST exited (${code})`); process.exit(1); });
process.on('exit', () => postgrest.kill());

http.createServer((req, res) => {
  console.log(new Date().toISOString().slice(11, 19), req.method, req.url.slice(0, 120));
  if (req.url.startsWith('/auth/v1/user')) {
    const claims = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
    res.writeHead(claims ? 200 : 401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(claims
      ? { id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
      : { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }));
  }
  const upstream = http.request({
    host: '127.0.0.1', port: 54322, path: req.url.replace(/^\/rest\/v1/, '') || '/', method: req.method,
    headers: { ...req.headers, host: 'localhost:54322' },
  }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  upstream.on('error', (error) => { res.writeHead(502); res.end(String(error)); });
  req.pipe(upstream);
}).listen(54321, () => console.log('Local Supabase REST/auth on http://localhost:54321'));
