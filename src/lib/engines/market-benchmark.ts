import { MarketPriceObservation, MarketBenchmark, MarketCode, PriceSourceType } from '@/types';

// Exchange rates to USD
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  BRL: 0.18,
  ARS: 0.00075,
  BOB: 0.145,
  PYG: 0.00013,
};

export const CONFIDENCE_BY_SOURCE: Record<PriceSourceType, number> = {
  FORMAL_QUOTE: 0.95,
  DIRECT_EMAIL: 0.85,
  SUPPLIER_CATALOG: 0.7,
  B2B_MARKETPLACE: 0.5,
  RETAIL: 0.2,
};

export class MarketBenchmarkEngine {
  /**
   * Normalize an observation into USD unit price
   */
  public static normalizePrice(
    originalPrice: number,
    currency: string,
    quantity: number,
    sourceType: PriceSourceType,
    customRate?: number
  ): {
    normalizedPriceUSD: number;
    normalizedUnitPriceUSD: number;
    confidenceLevel: number;
    exchangeRate: number;
  } {
    const rate = customRate || DEFAULT_EXCHANGE_RATES[currency.toUpperCase()] || 1.0;
    const normalizedPriceUSD = Number((originalPrice * rate).toFixed(4));
    const normalizedUnitPriceUSD = quantity > 0 ? Number((normalizedPriceUSD / quantity).toFixed(4)) : normalizedPriceUSD;
    const confidenceLevel = CONFIDENCE_BY_SOURCE[sourceType] || 0.5;

    return {
      normalizedPriceUSD,
      normalizedUnitPriceUSD,
      confidenceLevel,
      exchangeRate: rate,
    };
  }

  /**
   * Calculate benchmark statistics for a specific SKU in a given country
   */
  public static calculateBenchmark(
    observations: MarketPriceObservation[],
    sku: string,
    countryCode: MarketCode
  ): MarketBenchmark | null {
    // Filter strictly by active, matching SKU and country to prevent mixing technically different products
    const filtered = observations.filter(
      (o) => o.is_active && o.sku === sku && o.country_code === countryCode && o.normalized_unit_price_usd > 0
    );

    if (filtered.length === 0) return null;

    const prices = filtered.map((o) => o.normalized_unit_price_usd).sort((a, b) => a - b);
    const minPrice = prices[0];
    const maxPrice = prices[prices.length - 1];

    // Median
    const mid = Math.floor(prices.length / 2);
    const medianPrice =
      prices.length % 2 !== 0 ? prices[mid] : Number(((prices[mid - 1] + prices[mid]) / 2).toFixed(4));

    // Weighted benchmark: weighted by confidence and sqrt of quantity
    let weightedSum = 0;
    let totalWeight = 0;
    let totalConfidence = 0;
    let minVol = filtered[0].quantity;
    let maxVol = filtered[0].quantity;

    for (const obs of filtered) {
      const weight = obs.confidence_level * Math.sqrt(Math.max(obs.quantity, 1000));
      weightedSum += obs.normalized_unit_price_usd * weight;
      totalWeight += weight;
      totalConfidence += obs.confidence_level;
      if (obs.quantity < minVol) minVol = obs.quantity;
      if (obs.quantity > maxVol) maxVol = obs.quantity;
    }

    const weightedBenchmark = totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(4)) : medianPrice;
    const avgConfidence = Number((totalConfidence / filtered.length).toFixed(2));

    return {
      sku,
      country_code: countryCode,
      min_price_usd: minPrice,
      median_price_usd: medianPrice,
      max_price_usd: maxPrice,
      weighted_benchmark_usd: weightedBenchmark,
      observation_count: filtered.length,
      avg_confidence: avgConfidence,
      volume_range: { min: minVol, max: maxVol },
      last_updated: filtered.reduce((latest, o) => (o.observation_date > latest ? o.observation_date : latest), ''),
    };
  }

  /**
   * Calculate benchmarks across all SKUs and countries
   */
  public static calculateAllBenchmarks(
    observations: MarketPriceObservation[],
    skus: string[],
    countries: MarketCode[]
  ): MarketBenchmark[] {
    const results: MarketBenchmark[] = [];
    for (const sku of skus) {
      for (const country of countries) {
        const benchmark = this.calculateBenchmark(observations, sku, country);
        if (benchmark) {
          results.push(benchmark);
        }
      }
    }
    return results;
  }
}
