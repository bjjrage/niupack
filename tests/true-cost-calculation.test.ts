import { describe, it, expect } from 'vitest';
import { TrueCostEngine } from '@/lib/engines/true-cost-engine';
import { INITIAL_COST_SHEET, INITIAL_PROCESS_DEF } from '@/lib/db/seed-data';

describe('True Cost Industrial Engine', () => {
  it('should compute unit cost, categories breakdown, and break-even units from components', () => {
    const breakdown = TrueCostEngine.calculateCostSheet(
      INITIAL_COST_SHEET.components!,
      300000,
      0.055
    );

    expect(breakdown.trueUnitCostUSD).toBeGreaterThan(0.035);
    expect(breakdown.trueUnitCostUSD).toBeLessThan(0.050);

    // Sum of variable + fixed per unit must equal trueUnitCostUSD
    const sumFixedVar = Number(
      (breakdown.variableCostPerUnitUSD + breakdown.fixedCostPerUnitUSD).toFixed(5)
    );
    expect(sumFixedVar).toBe(breakdown.trueUnitCostUSD);

    // Total batch cost must equal trueUnitCost * batchSize
    expect(breakdown.batchTotalCostUSD).toBe(
      Number((breakdown.trueUnitCostUSD * 300000).toFixed(2))
    );

    // Material cost should represent the largest cost component in paper packaging (> 50%)
    expect(breakdown.materialCostPerUnitUSD).toBeGreaterThan(
      breakdown.trueUnitCostUSD * 0.45
    );

    // Minimum sustainable price must be 10% above true unit cost
    expect(breakdown.minimumSustainablePriceUSD).toBe(
      Number((breakdown.trueUnitCostUSD * 1.1).toFixed(5))
    );

    // Break even units should be positive when sell price (0.055) > variable cost
    expect(breakdown.breakEvenUnits).toBeGreaterThan(0);
    expect(breakdown.breakEvenUnits).toBeLessThan(300000);
  });

  it('should generate an economies-of-scale volume curve showing decreasing fixed cost per unit', () => {
    const breakdown = TrueCostEngine.calculateCostSheet(
      INITIAL_COST_SHEET.components!,
      300000
    );

    expect(breakdown.volumeCurve.length).toBe(6);

    const cost50k = breakdown.volumeCurve.find((v) => v.quantity === 50000)!;
    const cost300k = breakdown.volumeCurve.find((v) => v.quantity === 300000)!;
    const cost1M = breakdown.volumeCurve.find((v) => v.quantity === 1000000)!;
    const cost2M = breakdown.volumeCurve.find((v) => v.quantity === 2000000)!;

    // Unit cost must strictly decrease as volume scales
    expect(cost50k.unitCostUSD).toBeGreaterThan(cost300k.unitCostUSD);
    expect(cost300k.unitCostUSD).toBeGreaterThan(cost1M.unitCostUSD);
    expect(cost1M.unitCostUSD).toBeGreaterThan(cost2M.unitCostUSD);
  });

  it('should calculate sequential compounding scrap and identify industrial bottleneck', () => {
    const metrics = TrueCostEngine.calculateProcessMetrics(INITIAL_PROCESS_DEF.steps);

    // 6 industrial steps with small scrap rates (0.5% - 2.5%)
    expect(metrics.cumulativeScrapRatePercent).toBeGreaterThan(5.0);
    expect(metrics.cumulativeScrapRatePercent).toBeLessThan(12.0);
    expect(metrics.overallYieldPercent).toBe(
      Number((100 - metrics.cumulativeScrapRatePercent).toFixed(2))
    );

    // Bottleneck must be detected (the step with minimum capacity per hour)
    expect(metrics.bottleneckStep).not.toBeNull();
    expect(metrics.bottleneckStep?.name).toContain('Formado');
    expect(metrics.maxLineCapacityPerHour).toBe(metrics.bottleneckStep?.capacity_units_per_hour);

    // Hourly cost must sum all step operator and machine costs
    expect(metrics.totalHourlyCostUSD).toBeGreaterThan(100);
  });
});
