import { describe, it, expect } from 'vitest';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { IndustrialProductCostInput } from '@/types';
import { FxEngine } from '@/lib/fx/fx-provider';

describe('Unit Cost Canonical Conversion & Dual Currency', () => {
  // CASE 1: Cost per 1000: USD 46.09 -> Expected unit: USD 0.04609
  it('CASE 1: should convert thousand-unit cost of USD 46.09 to canonical unit cost USD 0.04609', () => {
    const costPerThousand = 46.09;
    const unitCost = Number((costPerThousand / 1000).toFixed(5));

    expect(unitCost).toBe(0.04609);
    expect(unitCost * 1000).toBeCloseTo(46.09, 5);
  });

  it('should normalize industrial cost components to canonical unit cost', () => {
    const input: IndustrialProductCostInput = {
      sku: 'CUP-12OZ-SW',
      paper_formula: {
        cif_price_ton_usd: 1250,
        customs_dispatch_percent: 13,
        financial_cost_percent: 6,
        printing_method: 'OFFSET',
        sheet_width_mm: 700,
        sheet_height_mm: 1000,
        gsm: 260,
        coating_gsm: 18,
        units_per_sheet: 11,
        paper_yield_units_per_ton: 56500,
      },
      bottom_paper_cost_ton_usd: 1350,
      bottom_yield_units_per_ton: 350000,
      printing_cost_mode: 'PER_THOUSAND',
      quoted_printing_rate_usd: 4.50,
      operational_cost_per_thousand_usd: 5.40,
      machine_depreciation_per_thousand_usd: 3.50,
      scrap_rate_percent: 6.5,
      packaging_cost_per_thousand_usd: 2.20,
      batch_size: 300000,
    };

    const breakdown = IndustrialCostEngine.calculateCost(input);

    // True unit cost should be in the canonical range (~$0.046/unit)
    expect(breakdown.true_unit_cost_usd).toBeGreaterThan(0.04);
    expect(breakdown.true_unit_cost_usd).toBeLessThan(0.06);

    // Cost components generated should all have normalized unit basis
    const components = IndustrialCostEngine.toCostComponents(breakdown, 'sheet-test-1');
    expect(components.length).toBe(7);
    for (const comp of components) {
      expect(comp.basis).toBe('PER_UNIT');
      expect(comp.rate_usd).toBeGreaterThan(0);
      expect(comp.rate_usd).toBeLessThan(breakdown.true_unit_cost_usd);
    }
  });

  it('should calculate dual currency representation in USD and PYG accurately', () => {
    const unitCostUSD = 0.04609;
    const fxRate = 6010; // BNF Sell rate
    const dual = FxEngine.toDualCurrency(unitCostUSD, fxRate);

    expect(dual.amount_usd).toBe(0.04609);
    // 0.04609 * 6010 = 277.0009 -> Math.round = 277 Gs.
    expect(dual.amount_pyg).toBe(277);
    expect(dual.formatted_usd).toBe('$0.04609 USD/u');
    expect(dual.formatted_pyg).toContain('277');
  });
});
