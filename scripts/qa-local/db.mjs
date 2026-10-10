// Starts an isolated local PostgreSQL 17 (port 54329), installs a minimal Supabase stub and
// applies every migration in supabase/migrations in order. The data directory is recreated on each run.
// Usage: node db.mjs [--keep]   (--keep leaves the server running for rest.mjs / tests)
import { startDatabase, installSupabaseStub, applyMigrations } from './lib.mjs';

const keep = process.argv.includes('--keep');
const { server, client } = await startDatabase();
await installSupabaseStub(client);
const { total, failed } = await applyMigrations(client);
console.log(`\n${total - failed}/${total} migrations applied`);
await client.end();
if (keep) console.log('PostgreSQL kept running on localhost:54329 (Ctrl+C to stop)');
else await server.stop();
process.exitCode = failed ? 1 : 0;
