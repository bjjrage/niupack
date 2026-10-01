import { describe, expect, it } from 'vitest';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { ScenarioEngine } from '@/lib/engines/scenario-engine';
import type { CostV1RubricKey, IndustrialProductCostInput } from '@/types';

const input: IndustrialProductCostInput = {
  sku: 'SKU-TEST-A',
  paper_formula: {
    cif_price_ton_usd: 1000,
    customs_dispatch_percent: 10,
    financial_cost_percent: 5,
    printing_method: 'OFFSET',
    sheet_width_mm: 700,
    sheet_height_mm: 1000,
    gsm: 250,
    coating_gsm: 10,
    units_per_sheet: 10,
    paper_yield_units_per_ton: 0,
  },
  bottom_formula: {
    cif_price_ton_usd: 900,
    customs_dispatch_percent: 10,
    financial_cost_percent: 5,
    gsm: 200,
    coating_gsm: 10,
    sheet_width_mm: 1000,
    sheet_height_mm: 1000,
    units_per_m2: 100,
  },
  bottom_paper_cost_ton_usd: 900,
  bottom_yield_units_per_ton: 100000,
  printing_cost_mode: 'PER_THOUSAND',
  quoted_printing_rate_usd: 10,
  operational_cost_per_thousand_usd: 8,
  machine_depreciation_per_thousand_usd: 4,
  scrap_rate_percent: 10,
  packaging_cost_per_thousand_usd: 2,
  batch_size: 100000,
};

function simulate(overrides: Partial<Parameters<typeof ScenarioEngine.simulateV1>[0]> = {}) {
  return ScenarioEngine.simulateV1({
    input,
    batchSize: 100000,
    rawMaterialPercent: 0,
    printingDieCutPercent: 0,
    operationalPercent: 0,
    scrapPercent: 0,
    depreciationPercent: 0,
    packagingPercent: 0,
    targetMarginPercent: 15,
    ...overrides,
  });
}

describe('Cost Intelligence V1', () => {
  it('exposes exactly six rubrics and excludes an OFF rubric from True Cost', () => {
    const base = IndustrialCostEngine.calculateCost(input);
    expect(base.rubrics?.map((rubric) => rubric.key)).toEqual([
      'raw_material', 'printing_die_cut', 'operational', 'scrap', 'depreciation', 'packaging',
    ]);

    const withoutPackaging = IndustrialCostEngine.calculateCost({
      ...input,
      rubrics: { packaging: { enabled: false, source: 'MANUAL', unit: 'PER_1000' } },
    });
    expect(withoutPackaging.cost_packaging_usd).toBe(0);
    expect(withoutPackaging.true_unit_cost_usd).toBeLessThan(base.true_unit_cost_usd);
  });

  it('applies scrap as an auditable gross-up on raw material only', () => {
    const breakdown = IndustrialCostEngine.calculateCost(input);
    const raw = breakdown.cost_paper_cone_usd + breakdown.cost_bottom_usd;
    expect(breakdown.cost_scrap_usd).toBe(Number((raw * (0.1 / 0.9)).toFixed(5)));
  });

  it('keeps each simulator variable isolated to its own rubric', () => {
    const base = simulate();
    const cases: Array<[CostV1RubricKey, Partial<Parameters<typeof ScenarioEngine.simulateV1>[0]>]> = [
      ['raw_material', { rawMaterialPercent: 10 }],
      ['printing_die_cut', { printingDieCutPercent: 10 }],
      ['operational', { operationalPercent: 10 }],
      ['scrap', { scrapPercent: 10 }],
      ['depreciation', { depreciationPercent: 10 }],
      ['packaging', { packagingPercent: 10 }],
    ];

    for (const [changedKey, overrides] of cases) {
      const result = simulate(overrides);
      for (const rubric of result.simulatedRubrics) {
        const baseRubric = base.simulatedRubrics.find((candidate) => candidate.key === rubric.key)!;
        if (rubric.key === changedKey) expect(rubric.impact_usd_per_unit).not.toBe(baseRubric.impact_usd_per_unit);
        else expect(rubric.impact_usd_per_unit).toBe(baseRubric.impact_usd_per_unit);
      }
    }
  });

  it('does not invent a benchmark when no real observation is available', () => {
    const result = simulate();
    expect(result.benchmarkUSD).toBeNull();
    expect(result.priceGapUSD).toBeNull();
    expect(result.priceGapPercent).toBeNull();
  });

  it('marks an empty SKU input as not configured instead of fabricating a cost', () => {
    const incomplete = { ...input, paper_formula: { ...input.paper_formula, cif_price_ton_usd: 0 }, quoted_printing_rate_usd: 0 };
    const breakdown = IndustrialCostEngine.calculateCost(incomplete);
    expect(IndustrialCostEngine.isConfigured(incomplete)).toBe(false);
    expect(breakdown.configured).toBe(false);
    expect(breakdown.missing_configuration).toContain('Impresión + troquelado');
  });
});
