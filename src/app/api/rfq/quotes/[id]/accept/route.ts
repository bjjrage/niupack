import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';
import { MarketCode } from '@/types';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const quotes = await repository.getQuotes();
    const quote = quotes.find((q) => q.id === id);

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Mark quote as ACCEPTED
    await repository.updateQuote(id, {
      status: 'ACCEPTED',
    });

    const supplier = (await repository.getSuppliers()).find((s) => s.id === quote.supplier_id);
    const countryCode: MarketCode = (supplier?.country_code as MarketCode) || 'BR';

    // Insert into market_price_observations
    const item = quote.items?.[0] || {
      sku: 'CUP-12OZ-SW',
      quantity: 300000,
      unit_price: 0.0495,
      normalized_unit_price_usd: 0.0495,
    };

    const observation = await repository.addMarketPrice({
      organization_id: quote.organization_id,
      country_code: countryCode,
      supplier_id: quote.supplier_id,
      supplier_name: quote.supplier_name,
      sku: item.sku,
      quantity: item.quantity,
      moq: item.moq || 50000,
      original_price: item.unit_price * item.quantity,
      original_currency: quote.currency,
      exchange_rate_to_usd: quote.currency === 'BRL' ? 0.18 : 1.0,
      normalized_price_usd: item.normalized_unit_price_usd * item.quantity,
      normalized_unit_price_usd: item.normalized_unit_price_usd,
      observation_date: new Date().toISOString().split('T')[0],
      source_type: 'FORMAL_QUOTE',
      incoterm: quote.incoterm,
      taxes_included: false,
      freight_included: quote.freight_included,
      printing_included: quote.printing_included,
      tooling_cost_usd: quote.tooling_cost,
      payment_terms: quote.payment_terms,
      lead_time_days: quote.lead_time_days,
      validity_date: quote.validity_date,
      confidence_level: 0.95,
      is_active: true,
      notes: `Aceptada formalmente desde respuesta RFQ (${quote.supplier_name})`,
    });

    // Audit event
    await repository.logAuditEvent({
      event_type: 'rfq_approval',
      target_entity: 'market_price_observations',
      entity_id: observation.id,
      metadata: {
        action: 'ACCEPT_INTO_MARKET_INTELLIGENCE',
        supplier: quote.supplier_name,
        unitPriceUSD: item.normalized_unit_price_usd,
      },
    });

    return NextResponse.json({ success: true, observation });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
