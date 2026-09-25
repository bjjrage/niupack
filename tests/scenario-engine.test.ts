import { describe, it, expect } from 'vitest';
import { ScenarioEngine } from '@/lib/engines/scenario-engine';
import { INITIAL_COST_SHEET } from '@/lib/db/seed-data';

describe('What-If Scenario Simulation & Efficiency Engine', () => {
  it('should calculate cost reduction and positive annual savings when raw material and scrap are optimized', () => {
    const simulation = ScenarioEngine.simulateScenario({
      components: INITIAL_COST_SHEET.components!,
      batchSize: 300000,
      rawMaterialDeltaPercent: -5.0, // 5% cheaper raw materials
      scrapDeltaPercent: -2.0, // 2 pp less scrap
      efficiencyDeltaPercent: 10.0, // 10% faster machine throughput
      marginTargetPercent: 18.0,
      freightDeltaPercent: -5.0,
      marketBenchmarkUSD: 0.0495,
      annualVolumeUnits: 20000000,
    });

    expect(simulation.simulatedUnitCostUSD).toBeLessThan(simulation.baseUnitCostUSD);
    expect(simulation.unitCostDeltaUSD).toBeLessThan(0);
    expect(simulation.unitCostDeltaPercent).toBeLessThan(0);

    // Negative delta in unit cost means positive annual savings
    expect(simulation.annualImpactUSD).toBeGreaterThan(0);
    expect(simulation.annualImpactUSD).toBeGreaterThan(30000); // at least $30k/yr on 20M units

    // Suggested price must achieve the requested margin target of 18%
    expect(simulation.marginPercent).toBeCloseTo(18.0, 0);
  });

  it('should compute price gap vs market benchmark accurately', () => {
    const simulation = ScenarioEngine.simulateScenario({
      components: INITIAL_COST_SHEET.components!,
      batchSize: 300000,
      rawMaterialDeltaPercent: 0,
      scrapDeltaPercent: 0,
      efficiencyDeltaPercent: 0,
      marginTargetPercent: 15.0,
      freightDeltaPercent: 0,
      marketBenchmarkUSD: 0.0495,
    });

    const expectedGap = Number((simulation.suggestedPriceUSD - 0.0495).toFixed(4));
    expect(simulation.priceGapUSD).toBe(expectedGap);
  });

  it('should detect efficiency opportunities from cost sheet components and rank by savings', () => {
    const opps = ScenarioEngine.detectEfficiencyOpportunities(
      INITIAL_COST_SHEET.components!,
      20000000
    );

    expect(opps.length).toBeGreaterThanOrEqual(2);

    // Sorted descending by annual savings
    for (let i = 0; i < opps.length - 1; i++) {
      expect(opps[i].annual_savings_usd).toBeGreaterThanOrEqual(opps[i + 1].annual_savings_usd);
    }

    const scrapOpp = opps.find((o) => o.id === 'eff-scrap-1');
    expect(scrapOpp).toBeDefined();
    expect(scrapOpp?.ease_score).toBeGreaterThanOrEqual(3);
    expect(scrapOpp?.roi_score).toBeGreaterThan(0);
  });
});
