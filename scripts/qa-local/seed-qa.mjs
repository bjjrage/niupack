// Seeds the local QA database (requires `node db.mjs --keep`) with one organization, an admin user,
// plant parameters and a SKU with a cost configuration, so the app can be driven in a browser.
// Prints the arguments for dev.mjs. Local only: refuses anything but localhost:54329.
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const client = new pg.Client({ host: 'localhost', port: 54329, user: 'postgres', password: 'postgres', database: 'niupack_qa' });
await client.connect();

const org = crypto.randomUUID();
const uid = crypto.randomUUID();
const email = 'admin@qa.local';
await client.query(`insert into organizations(id, name, slug) values ($1, 'NIUPACK QA', $2)`, [org, `niupack-qa-${org.slice(0, 6)}`]);
await client.query(`insert into auth.users(id, email) values ($1, $2)`, [uid, email]);
await client.query(`insert into profiles(organization_id, email, full_name, role, auth_user_id) values ($1, $2, 'Admin QA', 'admin', $3)`, [org, email, uid]);
await client.query(`insert into plant_process_parameters(organization_id, electricity_rate_pyg_kwh, monthly_salary_hours, labor_charges_percent, gen1_machines_count, gen1_power_kw, gen1_operating_hours, gen2_machines_count, gen2_power_kw, gen2_operating_hours, packaging_materials_cost_per_thousand_usd) values ($1, 450, 200, 16.5, 2, 6, 400, 1, 15, 400, 1.5)`, [org]);
const product = (await client.query(`insert into products(organization_id, code, name, category) values ($1, 'CUP-12OZ-DW', 'Vaso 12oz DW', 'cups') returning id`, [org])).rows[0].id;
await client.query(`insert into product_attributes(product_id, sku, material, coating, wall_type) values ($1, 'CUP-12OZ-DW', 'paper', 'PE', 'double')`, [product]);
const input = {
  sku: 'CUP-12OZ-DW', batch_size: 100000,
  paper_formula: { gsm: 260, coating_gsm: 32, sheet_width_mm: 700, sheet_height_mm: 1000, units_per_sheet: 18, printing_method: 'OFFSET', cif_price_ton_usd: 810.05, fob_price_ton_usd: 810, freight_ton_usd: 0.049917, customs_dispatch_percent: 13, financial_cost_percent: 6 },
  bottom_formula: { gsm: 205, coating_gsm: 18, units_per_m2: 144, cif_price_ton_usd: 810.05, financial_cost_percent: 6, customs_dispatch_percent: 13 },
  bottom_paper_cost_ton_usd: 810.05, printing_cost_mode: 'PER_THOUSAND', quoted_printing_rate_usd: 0,
  operational_cost_per_thousand_usd: 5.4, machine_depreciation_per_thousand_usd: 0, scrap_rate_percent: 0, packaging_cost_per_thousand_usd: 2.2,
  operational_process_enabled: false, packaging_process_enabled: false,
};
await client.query(`insert into cost_v1_configurations(organization_id, product_id, sku, input_json, version, is_active) values ($1, $2, 'CUP-12OZ-DW', $3, 1, true)`, [org, product, JSON.stringify(input)]);
await client.end();

fs.writeFileSync(path.join(here, 'qa-user.json'), JSON.stringify({ org, uid, email }));
console.log(`Seeded. Start the app with: node dev.mjs ${uid} ${email}`);
