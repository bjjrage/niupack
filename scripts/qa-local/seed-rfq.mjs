// Adds RFQ demo data to the QA organization created by seed-qa.mjs: two suppliers with QA-only addresses (.qa.test,
// never routable) and an active cost sheet for one SKU. Local only: refuses anything but localhost:54329.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const { org } = JSON.parse(fs.readFileSync(path.join(here, 'qa-user.json'), 'utf8'));
const client = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database: 'niupack_qa' });
await client.connect();

for (const [name, email, country] of [['Proveedor QA Uno', 'ventas@uno.qa.test', 'BR'], ['Proveedor QA Dos', 'sales@dos.qa.test', 'AR']]) {
  await client.query(
    `insert into suppliers(organization_id, name, email, country_code, status)
     select $1, $2, $3, $4, 'APPROVED_FOR_CONTACT' where not exists (select 1 from suppliers where organization_id = $1 and name = $2)`,
    [org, name, email, country]);
}
const product = (await client.query(`insert into products(organization_id, code, name, category) values ($1, 'CUNA-AMP-2ML', 'Cuna ampolla 2 ml', 'trays')
  on conflict (organization_id, code) do update set name = excluded.name returning id`, [org])).rows[0].id;
await client.query(`insert into product_attributes(product_id, sku, material, coating, wall_type) select $1, 'CUNA-AMP-2ML', 'plastic', 'none', 'single'
  where not exists (select 1 from product_attributes where sku = 'CUNA-AMP-2ML' and product_id = $1)`, [product]);
await client.query(`insert into cost_sheet_versions(organization_id, product_id, sku, version, name, status, true_unit_cost_usd)
  values ($1, $2, 'CUNA-AMP-2ML', 1, 'Hoja de costos QA', 'ACTIVE', 0.04) on conflict (organization_id, sku, version) do nothing`, [org, product]);
await client.end();
console.log('RFQ QA data ready (2 suppliers, active cost sheet for CUNA-AMP-2ML).');
