import React from 'react';
import { repository } from '@/lib/db/repository';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';
import { PricingStrategyClient } from './pricing-strategy-client';

export const revalidate = 0;

export default async function PricingStrategyPage() {
  const [sheet, prices, industrialInputs] = await Promise.all([
    repository.getActiveCostSheetForSKU('CUP-12OZ-SW'),
    repository.getMarketPrices(),
    repository.getIndustrialCostInputs(),
  ]);

  const benchmarkBR = MarketBenchmarkEngine.calculateBenchmark(prices, 'CUP-12OZ-SW', 'BR');
  const benchmarkAR = MarketBenchmarkEngine.calculateBenchmark(prices, 'CUP-12OZ-SW', 'AR');
  const benchmarkBO = MarketBenchmarkEngine.calculateBenchmark(prices, 'CUP-12OZ-SW', 'BO');

  const unitCost = sheet?.true_unit_cost_usd || 0.0468;
  const benchmarkPrice = benchmarkBR?.weighted_benchmark_usd || 0.0490;

  const initialInput = industrialInputs.find((i: { sku: string }) => i.sku === 'CUP-12OZ-SW') || industrialInputs[0];

  return (
    <PricingStrategyClient
      initialUnitCost={unitCost}
      initialBenchmarkBR={benchmarkPrice}
      initialBenchmarkAR={benchmarkAR?.weighted_benchmark_usd || 0.0520}
      initialBenchmarkBO={benchmarkBO?.weighted_benchmark_usd || 0.0515}
      initialIndustrialInput={initialInput}
    />
  );
}
