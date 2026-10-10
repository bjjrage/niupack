/**
 * Real-database integration test for scenario 3 (industrial costs -> Hoja de Costos).
 * Runs the real calculate route and repository against local PostgreSQL + PostgREST.
 * Only the session identity and the FX quote are stubbed.
 *
 * Skipped unless NIUPACK_QA_DB=1. Refuses to run against anything but localhost.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { INITIAL_INDUSTRIAL_COST_INPUTS } from '@/lib/db/seed-data';

const enabled = process.env.NIUPACK_QA_DB === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (enabled && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  throw new Error(`Refusing to run real-DB tests against non-local Supabase: ${url}`);
}

const identity = vi.hoisted(() => ({ current: { organizationId: '', profileId: '', role: 'admin' } }));
vi.mock('@/lib/auth/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/identity')>()),
  requireNiuIdentity: async () => identity.current,
}));
vi.mock('@/lib/fx/fx-provider', () => ({
  FxEngine: { getEffectiveQuote: async () => ({ costingRate: 7000, quote: { source: 'QA_FIXED' } }) },
}));

describe.skipIf(!enabled)('industrial costs into the cost sheet against real PostgreSQL', () => {
  let repository: typeof import('@/lib/db/repository').repository;
  let admin: NonNullable<typeof import('@/lib/db/supabase').supabaseAdmin>;
  let POST: typeof import('@/app/api/cost/processes/calculate/route').POST;
  const org = randomUUID();
  const profile = randomUUID();
  const sku = `QA-CUP-${org.slice(0, 6)}`;
  const period = new Date().toISOString().slice(0, 7);

  const calculate = async (body: object) => {
    const res = await POST(new NextRequest('http://localhost/api/cost/processes/calculate', { method: 'POST', body: JSON.stringify({ sku, period, ...body }) }));
    return { status: res.status, json: await res.json() };
  };
  const sheets = async () => (await admin.from('cost_sheet_versions').select('version,status,true_unit_cost_usd').eq('organization_id', org).eq('sku', sku).order('version')).data ?? [];

  beforeAll(async () => {
    ({ repository } = await import('@/lib/db/repository'));
    admin = (await import('@/lib/db/supabase')).supabaseAdmin!;
    ({ POST } = await import('@/app/api/cost/processes/calculate/route'));
    identity.current = { organizationId: org, profileId: profile, role: 'admin' };

    const must = async (p: PromiseLike<{ error: unknown }>) => { const { error } = await p; if (error) throw error; };
    await must(admin.from('organizations').insert({ id: org, name: 'qa-cost', slug: `qa-cost-${org.slice(0, 8)}` }));
    await must(admin.from('profiles').insert({ id: profile, organization_id: org, email: `qa-${profile}@qa.local`, full_name: 'QA Admin', role: 'admin' }));
    await must(admin.from('plant_process_parameters').insert({
      organization_id: org, electricity_rate_pyg_kwh: 450, monthly_salary_hours: 200, labor_charges_percent: 16.5,
      gen1_machines_count: 2, gen1_power_kw: 6, gen1_operating_hours: 400,
      gen2_machines_count: 1, gen2_power_kw: 15, gen2_operating_hours: 400,
      quality_polypaper_percent: 70, packaging_materials_cost_per_thousand_usd: 1.5,
    }));
    const productId = randomUUID();
    await must(admin.from('products').insert({ id: productId, organization_id: org, code: sku, name: 'Vaso QA', category: 'cups' }));
    await must(admin.from('product_attributes').insert({ product_id: productId, sku, material: 'PAPER', coating: 'PE', wall_type: 'single' }));

    for (const [name, salary, sector, code] of [['Op', 3_500_000, 'FORMADO', 'F1'], ['QC', 4_000_000, 'CALIDAD', 'Q1'], ['Pk', 3_100_000, 'EMPAQUE', 'P1']] as const) {
      const band = await repository.createSalaryBand({ organization_id: org, name, status: 'ACTIVE' }, salary, '2026-01-01', org, profile);
      await repository.createPersonnel({ organization_id: org, employee_code: code, display_name: code, status: 'ACTIVE', hire_date: '2026-01-01' }, band.id, sector, org);
    }

    await repository.saveCostV1Configuration({
      sku, version: 1, is_active: true,
      input: { ...INITIAL_INDUSTRIAL_COST_INPUTS[0], sku, operational_process_enabled: false, packaging_process_enabled: false },
    }, org, profile);
    await repository.saveProductionPeriod({ sku, period, good_units_produced: 500_000 }, org);
  });

  it('rejects an official apply when production is not persisted (no invented basis)', async () => {
    const res = await calculate({ apply_to_cost_sheet: true, request_id: randomUUID(), good_units_produced: 999 });
    expect(res.status).toBe(409);
    expect(await sheets()).toHaveLength(0);
  });

  it('switch ON uses industrial cost, OFF stops impacting it, history is kept and retries do not duplicate', async () => {
    const on = await calculate({ apply_to_cost_sheet: true, enable_operational: true, enable_packaging: true, request_id: randomUUID() });
    expect(on.status, JSON.stringify(on.json)).toBe(200);
    const calc = on.json.calculation;
    expect(calc.status).toBe('COMPLETE');
    // Forming energy: (2*6 + 1*15) kW * 400 h * 450 Gs/kWh.
    expect(calc.forming.total_energy_kwh).toBe(10_800);
    expect(calc.forming.electricity_cost_pyg).toBe(4_860_000);
    expect(on.json.updated_cost_input.process_operational_cost_per_thousand_usd).toBeCloseTo(calc.operational_total_usd_per_thousand, 6);
    expect(on.json.updated_cost_input.operational_process_enabled).toBe(true);

    const offRequest = randomUUID();
    const off = await calculate({ apply_to_cost_sheet: true, enable_operational: true, enable_packaging: false, request_id: offRequest });
    expect(off.status, JSON.stringify(off.json)).toBe(200);
    expect(off.json.updated_cost_input.packaging_process_enabled).toBe(false);

    // Packaging OFF falls back to the manual per-thousand figure, so the difference is exactly
    // (industrial packaging - manual packaging) / 1000 per unit.
    const list = await sheets();
    expect(list.map((s) => [s.version, s.status])).toEqual([[1, 'ARCHIVED'], [2, 'ACTIVE']]);
    const delta = Number(list[0].true_unit_cost_usd) - Number(list[1].true_unit_cost_usd);
    const expectedDelta = (calc.packaging_total_usd_per_thousand - INITIAL_INDUSTRIAL_COST_INPUTS[0].packaging_cost_per_thousand_usd) / 1000;
    expect(delta).toBeCloseTo(expectedDelta, 4);

    // Replaying the same request is idempotent: no third version.
    const replay = await calculate({ apply_to_cost_sheet: true, enable_operational: true, enable_packaging: false, request_id: offRequest });
    expect(replay.status).toBe(200);
    expect(await sheets()).toHaveLength(2);
  });
});
