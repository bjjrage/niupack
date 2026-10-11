// Re-applies one SQL file to the running QA PostgreSQL (node db.mjs --keep) for quick iteration.
// Usage: node apply.mjs ../../supabase/migrations/<file>.sql
import fs from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) throw new Error('usage: node apply.mjs <file.sql>');
const client = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database: 'niupack_qa' });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(fs.readFileSync(file, 'utf8'));
  await client.query('COMMIT');
  console.log('applied', file);
} catch (error) {
  await client.query('ROLLBACK');
  console.error('FAILED', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
