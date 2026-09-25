import { describe, it, expect } from 'vitest';
import { IndustrialCapexEngine } from '@/lib/engines/industrial-capex-engine';
import { IndustrialCostBreakdown } from '@/types';

describe('IndustrialCapexEngine', () => {
  const dummyBreakdown: IndustrialCostBreakdown = {
    cost_paper_cone_usd: 0.02630,
    cost_bottom_usd: 0.00386,
    cost_printing_diecut_usd: 0.00700, // $4.50 printing + $2.50 die cutting per 1000
    cost_operational_usd: 0.00540,
    cost_depreciation_usd: 0.00350,
    cost_scrap_usd: 0.00196,
    cost_packaging_usd: 0.00220,
    true_unit_cost_usd: 0.05022,
    batch_total_cost_usd: 15066.00,
    total_paper_ton_cost_usd: 1487.50,
    customs_dispatch_ton_usd: 162.50,
    financial_cost_ton_usd: 75.00,
    share_paper_cone_percent: 52.4,
    share_bottom_percent: 7.7,
    share_printing_percent: 13.9,
    share_operational_percent: 10.7,
    share_depreciation_percent: 7.0,
    share_scrap_percent: 3.9,
    share_packaging_percent: 4.4,
  };

  it('evaluates all 4 industrial scenarios correctly', () => {
    const scenarios = IndustrialCapexEngine.evaluateScenarios({
      currentBreakdown: dummyBreakdown,
      marketBenchmarkUSD: 0.0490,
      annualVolumeUnits: 20_000_000,
    });

    expect(scenarios).toHaveLength(4);

    const [scenA, scenB, scenC, scenD] = scenarios;

    // Scenario A: Current
    expect(scenA.id).toBe('SCENARIO_A_OUTSOURCED_NARROW');
    expect(scenA.capex_investment_usd).toBe(0);
    expect(scenA.unit_saving_vs_current_usd).toBe(0);

    // Scenario B: Outsourced Wide Web (0 CAPEX, immediate savings from paper)
    expect(scenB.id).toBe('SCENARIO_B_OUTSOURCED_WIDE');
    expect(scenB.capex_investment_usd).toBe(0);
    expect(scenB.unit_saving_vs_current_usd).toBeGreaterThan(0.003);
    expect(scenB.annual_saving_at_volume_usd).toBeGreaterThan(60000);

    // Scenario C: Partial Integration (Own Flexo)
    expect(scenC.id).toBe('SCENARIO_C_PARTIAL_INTEGRATION');
    expect(scenC.capex_investment_usd).toBe(180000);
    expect(scenC.payback_years).toBeLessThan(3.0);
    expect(scenC.roi_percent).toBeGreaterThan(30);

    // Scenario D: Full Integration (Own Flexo + Own Die-Cutter)
    expect(scenD.id).toBe('SCENARIO_D_FULL_INTEGRATION');
    expect(scenD.capex_investment_usd).toBe(300000);
    expect(scenD.unit_saving_vs_current_usd).toBeGreaterThan(scenC.unit_saving_vs_current_usd);
    expect(scenD.payback_years).toBeLessThan(4.0);
  });
});
