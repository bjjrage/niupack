import { describe, it, expect } from 'vitest';
import { PricingEngine } from '@/lib/engines/pricing-engine';

describe('Commercial Pricing Strategies Engine', () => {
  const unitCost = 0.0402;
  const marketBenchmark = 0.0495;
  const variableCost = 0.0345;

  it('should generate all 7 commercial pricing strategies', () => {
    const strategies = PricingEngine.calculateStrategies({
      unitCostUSD: unitCost,
      marketBenchmarkUSD: marketBenchmark,
      variableCostUSD: variableCost,
      targetMarginPercent: 15,
    });

    expect(strategies.length).toBe(7);

    const types = strategies.map((s) => s.strategy);
    expect(types).toContain('TARGET_MARGIN');
    expect(types).toContain('MARKET_MATCH');
    expect(types).toContain('PENETRATION_PRICE');
    expect(types).toContain('VOLUME_PRICE');
    expect(types).toContain('CONTRACT_PRICE');
    expect(types).toContain('MINIMUM_DEFENSIBLE_PRICE');
    expect(types).toContain('PREMIUM');
  });

  it('should enforce market alignment for Market Match strategy', () => {
    const strategies = PricingEngine.calculateStrategies({
      unitCostUSD: unitCost,
      marketBenchmarkUSD: marketBenchmark,
      variableCostUSD: variableCost,
    });

    const marketMatch = strategies.find((s) => s.strategy === 'MARKET_MATCH')!;
    expect(marketMatch.suggested_price_usd).toBe(marketBenchmark);
    expect(marketMatch.price_gap_usd).toBe(0);
    expect(marketMatch.price_gap_percent).toBe(0);
    expect(marketMatch.margin_percent).toBeGreaterThan(0);
  });

  it('should price Penetration 5% below market benchmark to win accounts', () => {
    const strategies = PricingEngine.calculateStrategies({
      unitCostUSD: unitCost,
      marketBenchmarkUSD: marketBenchmark,
    });

    const penetration = strategies.find((s) => s.strategy === 'PENETRATION_PRICE')!;
    const expected = Number((marketBenchmark * 0.95).toFixed(4));
    expect(penetration.suggested_price_usd).toBe(expected);
    expect(penetration.price_gap_usd).toBeLessThan(0);
    expect(penetration.suggested_price_usd).toBeGreaterThan(unitCost);
  });

  it('should price Premium 8% above market benchmark reflecting FSSC 22000 certification', () => {
    const strategies = PricingEngine.calculateStrategies({
      unitCostUSD: unitCost,
      marketBenchmarkUSD: marketBenchmark,
    });

    const premium = strategies.find((s) => s.strategy === 'PREMIUM')!;
    const expected = Number((marketBenchmark * 1.08).toFixed(4));
    expect(premium.suggested_price_usd).toBe(expected);
    expect(premium.price_gap_usd).toBeGreaterThan(0);
    expect(premium.margin_percent).toBeGreaterThan(15);
  });

  it('should establish Minimum Defensible price as the walk-away floor', () => {
    const strategies = PricingEngine.calculateStrategies({
      unitCostUSD: unitCost,
      marketBenchmarkUSD: marketBenchmark,
      variableCostUSD: variableCost,
    });

    const floor = strategies.find((s) => s.strategy === 'MINIMUM_DEFENSIBLE_PRICE')!;
    expect(floor.suggested_price_usd).toBe(Number((variableCost * 1.05).toFixed(4)));
    // Walk-away floor is lower than target margin price
    const target = strategies.find((s) => s.strategy === 'TARGET_MARGIN')!;
    expect(floor.suggested_price_usd).toBeLessThan(target.suggested_price_usd);
  });
});
