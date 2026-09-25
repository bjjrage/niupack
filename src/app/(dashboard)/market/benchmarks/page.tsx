import React from 'react';
import { repository } from '@/lib/db/repository';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';
import { MarketCode } from '@/types';
import { BenchmarksClient } from './benchmarks-client';

export const revalidate = 0;

export default async function BenchmarksPage() {
  const [prices, skus] = await Promise.all([
    repository.getMarketPrices(),
    repository.getSKUs(),
  ]);

  const skuList = skus.map((s) => s.sku);
  const countries: MarketCode[] = ['BR', 'AR', 'BO', 'PY'];
  const benchmarks = MarketBenchmarkEngine.calculateAllBenchmarks(prices, skuList, countries);

  return <BenchmarksClient benchmarks={benchmarks} />;
}
