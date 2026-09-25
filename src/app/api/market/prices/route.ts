import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';
import { PriceSourceType, MarketCode } from '@/types';

export async function GET() {
  try {
    const prices = await repository.getMarketPrices();
    return NextResponse.json({ prices });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      country_code,
      supplier_name,
      sku,
      quantity,
      moq,
      original_price,
      original_currency,
      source_type,
      incoterm = 'FOB',
      notes,
    } = body;

    const org = await repository.getOrganization();

    const normalized = MarketBenchmarkEngine.normalizePrice(
      parseFloat(original_price),
      original_currency,
      parseInt(quantity),
      source_type as PriceSourceType
    );

    const created = await repository.addMarketPrice({
      organization_id: org.id,
      country_code: country_code as MarketCode,
      supplier_name,
      sku,
      quantity: parseInt(quantity),
      moq: moq ? parseInt(moq) : undefined,
      original_price: parseFloat(original_price),
      original_currency,
      exchange_rate_to_usd: normalized.exchangeRate,
      normalized_price_usd: normalized.normalizedPriceUSD,
      normalized_unit_price_usd: normalized.normalizedUnitPriceUSD,
      observation_date: new Date().toISOString().split('T')[0],
      source_type: source_type as PriceSourceType,
      incoterm,
      taxes_included: false,
      freight_included: false,
      printing_included: true,
      tooling_cost_usd: 0,
      confidence_level: normalized.confidenceLevel,
      is_active: true,
      notes,
    });

    return NextResponse.json({ price: created });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
