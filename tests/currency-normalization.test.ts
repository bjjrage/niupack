import { describe, it, expect } from 'vitest';
import { MarketBenchmarkEngine, DEFAULT_EXCHANGE_RATES, CONFIDENCE_BY_SOURCE } from '@/lib/engines/market-benchmark';
import { MarketPriceObservation } from '@/types';

describe('Currency Normalization & Market Benchmark Engine', () => {
  it('should normalize prices to USD according to exchange rates and quantity', () => {
    // 10,000 units in BRL for 2,500 BRL
    // Rate BRL -> USD = 0.18 => Total USD = 450 => Unit USD = 0.045
    const normBRL = MarketBenchmarkEngine.normalizePrice(2500, 'BRL', 10000, 'FORMAL_QUOTE');
    expect(normBRL.normalizedPriceUSD).toBe(450);
    expect(normBRL.normalizedUnitPriceUSD).toBe(0.045);
    expect(normBRL.confidenceLevel).toBe(CONFIDENCE_BY_SOURCE['FORMAL_QUOTE']);

    // 50,000 units in ARS for 2,500,000 ARS
    // Rate ARS -> USD = 0.00075 => Total USD = 1875 => Unit USD = 0.0375
    const normARS = MarketBenchmarkEngine.normalizePrice(2500000, 'ARS', 50000, 'DIRECT_EMAIL');
    expect(normARS.normalizedPriceUSD).toBe(1875);
    expect(normARS.normalizedUnitPriceUSD).toBe(0.0375);
    expect(normARS.confidenceLevel).toBe(CONFIDENCE_BY_SOURCE['DIRECT_EMAIL']);

    // 20,000 units in BOB for 8,000 BOB
    // Rate BOB -> USD = 0.145 => Total USD = 1160 => Unit USD = 0.058
    const normBOB = MarketBenchmarkEngine.normalizePrice(8000, 'BOB', 20000, 'B2B_MARKETPLACE');
    expect(normBOB.normalizedPriceUSD).toBe(1160);
    expect(normBOB.normalizedUnitPriceUSD).toBe(0.058);
    expect(normBOB.confidenceLevel).toBe(CONFIDENCE_BY_SOURCE['B2B_MARKETPLACE']);
  });

  it('should allow custom exchange rates overrides', () => {
    const customRate = 0.20; // 1 BRL = 0.20 USD
    const norm = MarketBenchmarkEngine.normalizePrice(1000, 'BRL', 20000, 'SUPPLIER_CATALOG', customRate);
    expect(norm.normalizedPriceUSD).toBe(200);
    expect(norm.normalizedUnitPriceUSD).toBe(0.01);
    expect(norm.exchangeRate).toBe(0.20);
  });

  it('should calculate statistical benchmarks (min, max, median, weighted) for SKU and Country', () => {
    const observations: MarketPriceObservation[] = [
      {
        id: 'obs-1',
        organization_id: 'org-1',
        sku: 'CUP-12OZ-SW',
        country_code: 'BR',
        original_currency: 'BRL',
        original_price: 240,
        exchange_rate_to_usd: 0.18,
        normalized_price_usd: 43.2,
        normalized_unit_price_usd: 0.0432,
        quantity: 1000,
        source_type: 'B2B_MARKETPLACE',
        confidence_level: 0.5,
        taxes_included: false,
        freight_included: false,
        printing_included: false,
        tooling_cost_usd: 0,
        observation_date: '2026-09-10',
        is_active: true,
      },
      {
        id: 'obs-2',
        organization_id: 'org-1',
        sku: 'CUP-12OZ-SW',
        country_code: 'BR',
        original_currency: 'BRL',
        original_price: 27500,
        exchange_rate_to_usd: 0.18,
        normalized_price_usd: 4950,
        normalized_unit_price_usd: 0.0495,
        quantity: 100000,
        source_type: 'FORMAL_QUOTE',
        confidence_level: 0.95,
        taxes_included: false,
        freight_included: false,
        printing_included: false,
        tooling_cost_usd: 0,
        observation_date: '2026-09-15',
        is_active: true,
      },
      {
        id: 'obs-3',
        organization_id: 'org-1',
        sku: 'CUP-12OZ-SW',
        country_code: 'BR',
        original_currency: 'USD',
        original_price: 1590,
        exchange_rate_to_usd: 1.0,
        normalized_price_usd: 1590,
        normalized_unit_price_usd: 0.053,
        quantity: 30000,
        source_type: 'SUPPLIER_CATALOG',
        confidence_level: 0.7,
        taxes_included: false,
        freight_included: false,
        printing_included: false,
        tooling_cost_usd: 0,
        observation_date: '2026-09-12',
        is_active: true,
      },
    ];

    const benchmark = MarketBenchmarkEngine.calculateBenchmark(observations, 'CUP-12OZ-SW', 'BR');
    expect(benchmark).not.toBeNull();
    expect(benchmark?.sku).toBe('CUP-12OZ-SW');
    expect(benchmark?.country_code).toBe('BR');
    expect(benchmark?.min_price_usd).toBe(0.0432);
    expect(benchmark?.max_price_usd).toBe(0.053);
    expect(benchmark?.median_price_usd).toBe(0.0495);
    expect(benchmark?.observation_count).toBe(3);
    expect(benchmark?.volume_range.min).toBe(1000);
    expect(benchmark?.volume_range.max).toBe(100000);

    // Weighted benchmark should be pulled closer to the large formal quote (0.0495) due to high confidence & volume
    expect(benchmark?.weighted_benchmark_usd).toBeGreaterThanOrEqual(0.048);
    expect(benchmark?.weighted_benchmark_usd).toBeLessThanOrEqual(0.051);
  });

  it('should return null when no observations match SKU or country', () => {
    const benchmark = MarketBenchmarkEngine.calculateBenchmark([], 'CUP-12OZ-SW', 'PY');
    expect(benchmark).toBeNull();
  });
});
