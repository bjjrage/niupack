import { describe, it, expect } from 'vitest';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { IndustrialProductCostInput } from '@/types';

describe('IndustrialCostEngine', () => {
  it('calculates true cost correctly using Offset paper pliego formula', () => {
    const input: IndustrialProductCostInput = {
      sku: 'CUP-12OZ-SW',
      paper_formula: {
        cif_price_ton_usd: 1250,
        customs_dispatch_ton_usd: 150, // Total = 1400 USD/ton
        printing_method: 'OFFSET',
        sheet_width_mm: 700,
        sheet_height_mm: 1000,
        gsm: 260,
        coating_gsm: 18, // Total GSM = 278
        units_per_sheet: 11, // 11 conos por pliego
        paper_yield_units_per_ton: 0,
      },
      bottom_paper_cost_ton_usd: 1350,
      bottom_yield_units_per_ton: 350000, // Costo culito = 1350 / 350000 = ~0.003857
      printing_cost_mode: 'PER_THOUSAND',
      quoted_printing_rate_usd: 4.5, // 4.50 USD / 1000 u = 0.00450
      operational_cost_per_thousand_usd: 5.4, // 0.00540
      machine_depreciation_per_thousand_usd: 3.5, // 0.00350
      scrap_rate_percent: 6.5, // 6.5% de materia prima
      packaging_cost_per_thousand_usd: 2.2, // 0.00220
      batch_size: 300000,
    };

    const breakdown = IndustrialCostEngine.calculateCost(input);

    expect(breakdown.total_paper_ton_cost_usd).toBe(1400);
    expect(breakdown.price_per_sheet_usd).toBeGreaterThan(0.25);
    expect(breakdown.cost_paper_cone_usd).toBeGreaterThan(0.02);
    expect(breakdown.cost_bottom_usd).toBeCloseTo(0.00386, 4);
    expect(breakdown.cost_printing_diecut_usd).toBe(0.0045);
    expect(breakdown.cost_operational_usd).toBe(0.0054);
    expect(breakdown.cost_depreciation_usd).toBe(0.0035);
    expect(breakdown.cost_scrap_usd).toBeGreaterThan(0);
    expect(breakdown.cost_packaging_usd).toBe(0.0022);
    expect(breakdown.true_unit_cost_usd).toBeGreaterThan(0.04);
    expect(breakdown.batch_total_cost_usd).toBe(Number((breakdown.true_unit_cost_usd * 300000).toFixed(2)));
  });

  it('calculates true cost correctly using direct paper yield', () => {
    const input: IndustrialProductCostInput = {
      sku: 'CUP-8OZ-SW',
      paper_formula: {
        cif_price_ton_usd: 1200,
        customs_dispatch_ton_usd: 120, // Total = 1320 USD/ton
        printing_method: 'FLEXO',
        gsm: 240,
        paper_yield_units_per_ton: 75000, // 75k conos x ton => 1320 / 75000 = 0.01760
      },
      bottom_paper_cost_ton_usd: 1300,
      bottom_yield_units_per_ton: 450000, // 0.00289
      printing_cost_mode: 'PER_UNIT',
      quoted_printing_rate_usd: 0.0038,
      operational_cost_per_thousand_usd: 4.8,
      machine_depreciation_per_thousand_usd: 3.0,
      scrap_rate_percent: 5.0,
      packaging_cost_per_thousand_usd: 2.0,
      batch_size: 100000,
    };

    const breakdown = IndustrialCostEngine.calculateCost(input);

    expect(breakdown.cost_paper_cone_usd).toBe(0.0176);
    expect(breakdown.cost_bottom_usd).toBeCloseTo(0.00289, 4);
    expect(breakdown.cost_printing_diecut_usd).toBe(0.0038);
    expect(breakdown.true_unit_cost_usd).toBeGreaterThan(0.03);
  });
});
