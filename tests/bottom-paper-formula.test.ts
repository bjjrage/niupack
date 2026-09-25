import { describe, it, expect } from 'vitest';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { IndustrialProductCostInput } from '@/types';

describe('Culito (Bottom Paper) Industrial Formula Engine', () => {
  const basePaperFormula = {
    cif_price_ton_usd: 1250,
    customs_dispatch_percent: 13,
    financial_cost_percent: 6,
    printing_method: 'OFFSET' as const,
    sheet_width_mm: 700,
    sheet_height_mm: 1000,
    gsm: 260,
    coating_gsm: 18,
    units_per_sheet: 11,
    paper_yield_units_per_ton: 56500,
  };

  it('calculates total bottom ton cost with CIF + 13% Despacho + 6% Costo del Dinero (CIF * 1.19)', () => {
    const input: IndustrialProductCostInput = {
      sku: 'CUP-12OZ-SW',
      paper_formula: basePaperFormula,
      bottom_formula: {
        cif_price_ton_usd: 1350,
        customs_dispatch_percent: 13,
        financial_cost_percent: 6,
        gsm: 210,
        coating_gsm: 18, // Total GSM = 228
        sheet_width_mm: 1000,
        sheet_height_mm: 1000, // 1 m2
        units_per_m2: 200,
      },
      bottom_paper_cost_ton_usd: 1350,
      bottom_yield_units_per_ton: 350000,
      printing_cost_mode: 'PER_THOUSAND',
      quoted_printing_rate_usd: 4.5,
      operational_cost_per_thousand_usd: 5.4,
      machine_depreciation_per_thousand_usd: 3.5,
      scrap_rate_percent: 6.5,
      packaging_cost_per_thousand_usd: 2.2,
      batch_size: 300000,
    };

    const breakdown = IndustrialCostEngine.calculateCost(input);

    // CIF: 1350
    // Despacho: 1350 * 0.13 = 175.50
    // Costo del dinero: 1350 * 0.06 = 81.00
    // Total Tonelada: 1350 + 175.50 + 81.00 = 1606.50 USD/ton
    expect(breakdown.bottom_cif_price_ton_usd).toBe(1350);
    expect(breakdown.bottom_customs_dispatch_ton_usd).toBe(175.5);
    expect(breakdown.bottom_financial_cost_ton_usd).toBe(81);
    expect(breakdown.total_bottom_ton_cost_usd).toBe(1606.5);

    // Costo por m2 = 1606.50 * (228 / 1,000,000) = 0.366282 USD/m2
    expect(breakdown.cost_bottom_m2_usd).toBeCloseTo(0.366282, 5);

    // Pliego 1000x1000 = 1 m2 -> Costo por pliego = 0.366282 USD/pliego
    expect(breakdown.cost_bottom_sheet_usd).toBeCloseTo(0.366282, 5);

    // Rendimiento culitos x m2 para 12oz = 200
    // Costo unitario = 0.366282 / 200 = 0.00183141 USD/u
    expect(breakdown.cost_bottom_usd).toBeCloseTo(0.00183, 5);

    // At BNF 6010 Gs/USD:
    const pygUnit = breakdown.cost_bottom_usd * 6010;
    expect(pygUnit).toBeCloseTo(11.0, 0); // ~11 Gs por culito
  });

  it('calculates differentiated unit cost of culito for each SKU based on its m2 yield', () => {
    // 4oz: 380 culitos/m2
    // 8oz: 280 culitos/m2
    // 12oz: 200 culitos/m2
    // 16oz: 165 culitos/m2
    const skus = [
      { sku: 'CUP-4OZ-SW', unitsPerM2: 380 },
      { sku: 'CUP-8OZ-SW', unitsPerM2: 280 },
      { sku: 'CUP-12OZ-SW', unitsPerM2: 200 },
      { sku: 'CUP-16OZ-SW', unitsPerM2: 165 },
    ];

    const results = skus.map((item) => {
      const input: IndustrialProductCostInput = {
        sku: item.sku,
        paper_formula: basePaperFormula,
        bottom_formula: {
          cif_price_ton_usd: 1350,
          customs_dispatch_percent: 13,
          financial_cost_percent: 6,
          gsm: 210,
          coating_gsm: 18,
          units_per_m2: item.unitsPerM2,
        },
        bottom_paper_cost_ton_usd: 1350,
        bottom_yield_units_per_ton: 350000,
        printing_cost_mode: 'PER_THOUSAND',
        quoted_printing_rate_usd: 4.5,
        operational_cost_per_thousand_usd: 5.4,
        machine_depreciation_per_thousand_usd: 3.5,
        scrap_rate_percent: 6.5,
        packaging_cost_per_thousand_usd: 2.2,
        batch_size: 300000,
      };

      const breakdown = IndustrialCostEngine.calculateCost(input);
      return { sku: item.sku, cost: breakdown.cost_bottom_usd };
    });

    // 4oz culito should be cheaper than 8oz, which is cheaper than 12oz, which is cheaper than 16oz
    const cost4oz = results.find((r) => r.sku === 'CUP-4OZ-SW')!.cost;
    const cost8oz = results.find((r) => r.sku === 'CUP-8OZ-SW')!.cost;
    const cost12oz = results.find((r) => r.sku === 'CUP-12OZ-SW')!.cost;
    const cost16oz = results.find((r) => r.sku === 'CUP-16OZ-SW')!.cost;

    expect(cost4oz).toBeLessThan(cost8oz);
    expect(cost8oz).toBeLessThan(cost12oz);
    expect(cost12oz).toBeLessThan(cost16oz);

    expect(cost4oz).toBeCloseTo(0.366282 / 380, 5); // ~0.00096 USD/u
    expect(cost8oz).toBeCloseTo(0.366282 / 280, 5); // ~0.00131 USD/u
    expect(cost12oz).toBeCloseTo(0.366282 / 200, 5); // ~0.00183 USD/u
    expect(cost16oz).toBeCloseTo(0.366282 / 165, 5); // ~0.00222 USD/u
  });

  it('proves mathematical invariance when sheet dimensions change', () => {
    // 1000x1000 mm sheet (1 m2) vs 700x1000 mm sheet (0.7 m2)
    const input1m2: IndustrialProductCostInput = {
      sku: 'CUP-12OZ-SW',
      paper_formula: basePaperFormula,
      bottom_formula: {
        cif_price_ton_usd: 1350,
        customs_dispatch_percent: 13,
        financial_cost_percent: 6,
        gsm: 210,
        coating_gsm: 18,
        sheet_width_mm: 1000,
        sheet_height_mm: 1000,
        units_per_m2: 200,
      },
      bottom_paper_cost_ton_usd: 1350,
      bottom_yield_units_per_ton: 350000,
      printing_cost_mode: 'PER_THOUSAND',
      quoted_printing_rate_usd: 4.5,
      operational_cost_per_thousand_usd: 5.4,
      machine_depreciation_per_thousand_usd: 3.5,
      scrap_rate_percent: 6.5,
      packaging_cost_per_thousand_usd: 2.2,
      batch_size: 300000,
    };

    const input07m2: IndustrialProductCostInput = {
      sku: 'CUP-12OZ-SW',
      paper_formula: basePaperFormula,
      bottom_formula: {
        cif_price_ton_usd: 1350,
        customs_dispatch_percent: 13,
        financial_cost_percent: 6,
        gsm: 210,
        coating_gsm: 18,
        sheet_width_mm: 700,
        sheet_height_mm: 1000, // 0.7 m2
        units_per_m2: 200,
      },
      bottom_paper_cost_ton_usd: 1350,
      bottom_yield_units_per_ton: 350000,
      printing_cost_mode: 'PER_THOUSAND',
      quoted_printing_rate_usd: 4.5,
      operational_cost_per_thousand_usd: 5.4,
      machine_depreciation_per_thousand_usd: 3.5,
      scrap_rate_percent: 6.5,
      packaging_cost_per_thousand_usd: 2.2,
      batch_size: 300000,
    };

    const breakdown1 = IndustrialCostEngine.calculateCost(input1m2);
    const breakdown07 = IndustrialCostEngine.calculateCost(input07m2);

    expect(breakdown1.cost_bottom_usd).toBe(breakdown07.cost_bottom_usd);
    expect(breakdown07.cost_bottom_sheet_usd).toBeCloseTo(breakdown1.cost_bottom_sheet_usd! * 0.7, 5);
  });
});
