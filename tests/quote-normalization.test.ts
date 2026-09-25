import { describe, it, expect } from 'vitest';
import { OpenAIService } from '@/lib/openai/openai-service';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';

describe('Supplier Quote Extraction & Normalization', () => {
  it('should extract structured terms and normalize Brazilian Real quotes into USD', async () => {
    const rawEmail = `
      Olá equipe NIUPACK,
      Agradecemos a consulta. Para o item CUP-12OZ-SW em tiragem de 300.000 unidades:
      - Preço unitário: R$ 0.28 BRL
      - Pedido mínimo (MOQ): 50.000 un
      - Prazo de entrega: 25 dias
      - Condição: FOB fábrica São Paulo com frete incluso para terminal
    `;

    const quote = await OpenAIService.extractQuote({
      supplierId: 'sup-br-01',
      supplierName: 'Copobras S.A.',
      emailText: rawEmail,
    });

    expect(quote.supplier_id).toBe('sup-br-01');
    expect(quote.currency).toBe('BRL');
    expect(quote.status).toBe('EXTRACTED');
    expect(quote.confidence_score).toBeGreaterThanOrEqual(0.9);
    expect(quote.items.length).toBe(1);

    const item = quote.items[0];
    expect(item.sku).toBe('CUP-12OZ-SW');
    expect(item.unit_price).toBe(0.28);
    // 0.28 BRL * 0.18 = 0.0504 USD
    expect(item.normalized_unit_price_usd).toBe(0.0504);
    expect(item.moq).toBe(50000);
    expect(item.lead_time_days).toBe(25);
  });

  it('should handle thousand-unit price conversions to individual unit prices', () => {
    // Suppose a supplier quotes "USD 48.50 per 1,000 units"
    const pricePerMillar = 48.5;
    const millarQuantity = 1000;
    const normalized = MarketBenchmarkEngine.normalizePrice(
      pricePerMillar,
      'USD',
      millarQuantity,
      'FORMAL_QUOTE'
    );

    expect(normalized.normalizedUnitPriceUSD).toBe(0.0485);
    expect(normalized.normalizedPriceUSD).toBe(48.5);
    expect(normalized.confidenceLevel).toBe(0.95);
  });

  it('should detect freight terms and payment conditions from text', async () => {
    const rawEmail = `
      Estimados, confirmamos precio de USD 0.058 por unidad para 200k unidades.
      Entrega CIF Asunción con flete incluido. Pago a 30 días.
    `;

    const quote = await OpenAIService.extractQuote({
      supplierId: 'sup-ar-01',
      supplierName: 'Pack Solutions',
      emailText: rawEmail,
    });

    expect(quote.freight_included).toBe(true);
    expect(quote.payment_terms).toBeDefined();
    expect(quote.items[0].normalized_unit_price_usd).toBe(0.058);
  });
});
