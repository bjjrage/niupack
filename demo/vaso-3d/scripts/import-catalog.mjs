import { readFile, writeFile } from 'node:fs/promises';
import { extractCatalog } from './catalog-source.mjs';

const source = new URL('../../../js/showroom.js', import.meta.url);
const output = new URL('../src/catalog-data.mts', import.meta.url);
const items = extractCatalog(await readFile(source, 'utf8'));
const content = `// Generated from js/showroom.js by npm run catalog:import. Do not fill missing dimensions by inference.\nexport const CATALOG_CUPS = ${JSON.stringify(items, null, 2)} as const;\n`;
if (await readFile(output, 'utf8').catch(() => '') !== content) await writeFile(output, content, 'utf8');
console.log(`Catálogo importado: ${items.length} tamaños; ${items.filter((item) => item.baseDiameterMm === null).length} sin diámetro de base.`);
