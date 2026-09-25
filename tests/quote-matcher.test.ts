import { describe, it, expect } from 'vitest';
import { QuoteMatcherEngine } from '@/lib/engines/quote-matcher-engine';
import { ProductAttribute } from '@/types';

describe('Quote-to-Cost Matcher Engine', () => {
  const sampleCatalog: ProductAttribute[] = [
    {
      id: 'sku-1',
      product_id: 'prod-1',
      sku: 'CUP-4OZ-SW',
      size_oz: 4,
      size_ml: 120,
      material: 'Cartulina Cupstock',
      coating: 'PE',
      wall_type: 'single',
      max_colors: 4,
      pack_quantity: 50,
      carton_quantity: 2000,
      moq: 50000,
    },
    {
      id: 'sku-2',
      product_id: 'prod-1',
      sku: 'CUP-8OZ-SW',
      size_oz: 8,
      size_ml: 240,
      material: 'Cartulina Cupstock',
      coating: 'PE',
      wall_type: 'single',
      max_colors: 4,
      pack_quantity: 50,
      carton_quantity: 1000,
      moq: 50000,
    },
    {
      id: 'sku-3',
      product_id: 'prod-1',
      sku: 'CUP-12OZ-SW',
      size_oz: 12,
      size_ml: 350,
      material: 'Cartulina Cupstock',
      coating: 'PE',
      wall_type: 'single',
      max_colors: 4,
      pack_quantity: 50,
      carton_quantity: 1000,
      moq: 50000,
    },
    {
      id: 'sku-4',
      product_id: 'prod-1',
      sku: 'CUP-12OZ-DW',
      size_oz: 12,
      size_ml: 350,
      material: 'Cartulina Cupstock Doble Pared',
      coating: 'PE',
      wall_type: 'double',
      max_colors: 4,
      pack_quantity: 25,
      carton_quantity: 500,
      moq: 50000,
    },
  ];

  it('should parse raw email text into structured quote data', () => {
    const rawEmail = `
      Olá equipe NIUPACK,
      Confirmamos a cotação para o item Copo de papel 12oz (350ml) parede simples:
      - Preço unitário: R$ 0.28 BRL
      - Quantidade: 300.000 unidades
      - Condição: FOB Santos
      - Prazo: 25 dias
    `;

    const parsed = QuoteMatcherEngine.parseRawTextToQuote(rawEmail, 'Copobras S.A.', 'BR');

    expect(parsed.currency).toBe('BRL');
    expect(parsed.quoted_unit_price).toBe(0.28);
    expect(parsed.size_oz).toBe(12);
    expect(parsed.size_ml).toBe(350);
    expect(parsed.incoterm).toBe('FOB');
    expect(parsed.quantity).toBe(300000);
  });

  it('should match closest SKU accurately based on size and wall type', () => {
    // 1. Single wall 12oz
    const quote12SW = {
      supplier_name: 'Test Supplier',
      country: 'BR',
      product_description: 'Copo 12oz parede simples 350ml',
      size_oz: 12,
      size_ml: 350,
      material: 'Cartulina Cupstock',
      quoted_unit_price: 0.052,
      currency: 'USD',
      source_type: 'MANUAL_TEXT' as const,
    };
    const match1 = QuoteMatcherEngine.matchClosestSku(quote12SW, sampleCatalog);
    expect(match1.sku.sku).toBe('CUP-12OZ-SW');
    expect(match1.sizeMatch).toBe(true);
    expect(match1.score).toBeGreaterThanOrEqual(0.8);

    // 2. Double wall 12oz
    const quote12DW = {
      supplier_name: 'Test Supplier',
      country: 'BR',
      product_description: 'Vaso 12oz doble pared para café caliente',
      size_oz: 12,
      material: 'Doble Pared',
      quoted_unit_price: 0.068,
      currency: 'USD',
      source_type: 'MANUAL_TEXT' as const,
    };
    const match2 = QuoteMatcherEngine.matchClosestSku(quote12DW, sampleCatalog);
    expect(match2.sku.sku).toBe('CUP-12OZ-DW');
  });

  it('should compare external quote against NIUPACK true unit cost and flag Incoterm warning', async () => {
    const quote = {
      supplier_name: 'Copobras S.A.',
      country: 'BR',
      product_description: 'Copo 12oz parede simples',
      size_oz: 12,
      quoted_unit_price: 0.28, // 0.28 BRL * 0.18 = ~0.0504 USD
      currency: 'BRL',
      incoterm: 'FOB',
      source_type: 'MANUAL_TEXT' as const,
    };

    const result = await QuoteMatcherEngine.compareQuote(quote, 'CUP-12OZ-SW');

    expect(result.matched_sku).toBe('CUP-12OZ-SW');
    expect(result.external_unit_price_usd).toBeCloseTo(0.0504, 3);
    expect(result.niupack_factory_unit_cost_usd).toBeGreaterThan(0.04);
    expect(result.price_gap_usd).toBeDefined();
    expect(['COMPETITIVE', 'PARITY', 'DISADVANTAGE', 'CRITICAL']).toContain(result.competitive_status);

    // Should issue a warning that FOB Santos is not directly comparable with EXW Asunción
    expect(result.comparable_warning).toContain('FOB');
    expect(result.comparable_warning).toContain('EXW');
  });
});
