// Re-applies one SQL file to the running QA PostgreSQL (node db.mjs --keep) for quick iteration.
// Usage: node apply.mjs ../../supabase/migrations/<file>.sql [functionName ...]
// With function names, only those CREATE OR REPLACE FUNCTION blocks are re-applied (migrations are not re-runnable).
import fs from 'node:fs';
import pg from 'pg';

const [file, ...only] = process.argv.slice(2);
if (!file) throw new Error('usage: node apply.mjs <file.sql> [functionName ...]');
const client = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database: 'niupack_qa' });
await client.connect();
try {
  let sql = fs.readFileSync(file, 'utf8');
  if (only.length) {
    sql = only.map((name) => {
      const block = new RegExp(String.raw`CREATE OR REPLACE FUNCTION public\.${name}\([\s\S]*?\n\$\$;`).exec(sql);
      if (!block) throw new Error(`function ${name} not found`);
      return block[0];
    }).join('\n');
  }
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('applied', file, only.join(', '));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('FAILED', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
