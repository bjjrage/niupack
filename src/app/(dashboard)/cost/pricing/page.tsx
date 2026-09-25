import React from 'react';
import { repository } from '@/lib/db/repository';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';
import { PricingClient } from './pricing-client';

export const revalidate = 0;

export default async function PricingStrategiesPage() {
  const [sheet, prices] = await Promise.all([
    repository.getActiveCostSheetForSKU('CUP-12OZ-SW'),
    repository.getMarketPrices(),
  ]);

  const benchmarkBR = MarketBenchmarkEngine.calculateBenchmark(prices, 'CUP-12OZ-SW', 'BR');
  const unitCost = sheet?.true_unit_cost_usd || 0.0468;
  const benchmarkPrice = benchmarkBR?.weighted_benchmark_usd || 0.0495;

  return (
    <PricingClient
      initialUnitCost={unitCost}
      initialBenchmark={benchmarkPrice}
    />
  );
}
