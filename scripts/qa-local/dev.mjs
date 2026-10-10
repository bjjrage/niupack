// Starts `next dev` on port 3200 against the local QA stack, and prints a browser session
// cookie for a QA admin. Process env takes precedence over .env.local in Next.js, so the
// production Supabase project is never contacted. Refuses to start if qa.env is not local.
// Usage: node dev.mjs <auth_user_id> <email>   (a profiles row must link that auth user)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sign } from './jwt.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = { ...process.env, PACKING_TOKEN_SECRET: 'local-qa-packing-token-secret-32-bytes-min', DATABASE_URL: 'postgres://postgres:postgres@localhost:54329/niupack_qa' };
for (const line of fs.readFileSync(path.join(here, 'qa.env'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
}
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'http://localhost:54321') throw new Error('qa.env does not point to the local stack');

const [userId, email] = process.argv.slice(2);
if (userId && email) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 86400;
  const session = {
    access_token: sign({ role: 'authenticated', aud: 'authenticated', sub: userId, email, exp }),
    refresh_token: 'qa-refresh', token_type: 'bearer', expires_in: 7 * 86400, expires_at: exp,
    user: { id: userId, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {} },
  };
  console.log('\nRun this in the browser console at http://localhost:3200 to sign in as the QA user:');
  console.log(`document.cookie = "sb-localhost-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}; path=/; max-age=604800"\n`);
}

spawn('npx', ['next', 'dev', '-p', '3200'], { cwd: path.resolve(here, '../..'), env, stdio: 'inherit', shell: true });
