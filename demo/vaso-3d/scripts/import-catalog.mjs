import { readFile, writeFile } from 'node:fs/promises';
import { validateSupplierData } from './supplier-source.mjs';
const source = new URL('../data/supplier-models.json', import.meta.url);
const output = new URL('../src/catalog-data.mts', import.meta.url);
const models = validateSupplierData(JSON.parse(await readFile(source, 'utf8')));
const content = '// Generated from data/supplier-models.json. Supplier drawing dimensions; no catalog estimates.\nexport const SUPPLIER_MODELS = ' + JSON.stringify(models, null, 2) + ' as const;\n';
if (await readFile(output, 'utf8').catch(() => '') !== content) await writeFile(output, content, 'utf8');
console.log('Planos de proveedores: ' + models.length + ' modelos; vaso 8 oz reemplazado por 9 oz; pote 8 oz independiente.');
