// Extracts the full-database snapshot (one JSON object: table name -> array of rows, plus "_tables"
// and "_migrations") exported with a single SQL statement through the Supabase connector.
// The payload is copied byte for byte: numbers are never parsed or re-serialized by JavaScript, so
// numeric scale and precision survive exactly (restore-check.mjs reads it back with PostgreSQL).
// The raw file is the connector's saved tool result: a JSON string that wraps the payload.
// Usage: node backup-split.mjs <raw-result-file> <out-dir>
import fs from 'node:fs';
import path from 'node:path';

const [raw, outArg] = process.argv.slice(2);
const outDir = path.resolve(outArg);
let text = fs.readFileSync(raw, 'utf8');
try { const wrapped = JSON.parse(text); if (typeof wrapped.result === 'string') text = wrapped.result; } catch {}
const marker = '[{"backup":';
const start = text.indexOf(marker);
const end = text.lastIndexOf('}]');
if (start < 0 || end < start) throw new Error('backup payload not found');
const snapshot = text.slice(start + marker.length, end); // the object after "backup":, without the wrapper brace

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'snapshot.json'), snapshot);
console.log(`snapshot.json: ${snapshot.length} bytes -> ${outDir}`);
