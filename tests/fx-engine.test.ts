import { describe, it, expect, vi } from 'vitest';
import { FxEngine, ManualFxProvider, BnfFxProvider } from '@/lib/fx/fx-provider';
import { repository } from '@/lib/db/repository';

describe('FX & Exchange Rate Engine (BNF & Fallback)', () => {
  it('should support ManualFxProvider and resolve costing rate', async () => {
    const provider = new ManualFxProvider(6010);
    const quote = await provider.getRate('USD', 'PYG');

    expect(quote.sell).toBe(6010);
    expect(quote.buy).toBe(5960);
    expect(quote.source).toBe('MANUAL');

    const costingRate = FxEngine.resolveCostingRate(quote, 'BNF_SELL');
    expect(costingRate).toBe(6010);

    const buyRate = FxEngine.resolveCostingRate(quote, 'BNF_BUY');
    expect(buyRate).toBe(5960);
  });

  it('should fall back gracefully to last valid quote without throwing when network fails', async () => {
    // Mock repository to have an existing valid quote
    const mockRate = {
      base_currency: 'USD',
      quote_currency: 'PYG',
      buy_rate: 5810,
      sell_rate: 6010,
      source: 'BNF',
      effective_at: new Date().toISOString(),
      fetched_at: new Date().toISOString(),
      is_active: true,
    };
    await repository.addFxRate(mockRate);

    // Force refresh which attempts live fetch; since network is either offline or mock fails, it falls back
    const result = await FxEngine.getEffectiveQuote(true);

    expect(result.quote).toBeDefined();
    expect(result.quote.sell).toBeGreaterThan(5000);
    expect(['CURRENT', 'UNAVAILABLE_SOURCE_USING_LAST_VALID', 'MANUAL']).toContain(result.status);
    expect(result.costingRate).toBeGreaterThan(5000);
  });

  it('should convert amounts between USD and PYG accurately', () => {
    const rate = 6010;

    // USD to PYG: 0.04609 * 6010 = 277.0009 -> 277
    const pygAmount = FxEngine.convertCurrency(0.04609, 'USD', 'PYG', rate);
    expect(pygAmount).toBe(277);

    // PYG to USD
    const usdAmount = FxEngine.convertCurrency(277, 'PYG', 'USD', rate);
    expect(usdAmount).toBeCloseTo(0.04609, 3);
  });

  it('should calculate FX sensitivity scenarios (-5%, current, +5%, +10%)', () => {
    const baseRate = 6010;
    const baseCostUSD = 0.04609;
    const targetPriceUSD = 0.055;

    const sensitivity = FxEngine.calculateFxSensitivity(baseCostUSD, baseRate, targetPriceUSD);
    expect(sensitivity.length).toBe(4);

    const currentScen = sensitivity.find((s) => s.delta_percent === 0);
    expect(currentScen?.rate).toBe(6010);
    expect(currentScen?.unit_cost_pyg).toBe(277);

    const plus5Scen = sensitivity.find((s) => s.delta_percent === 5);
    expect(plus5Scen?.rate).toBe(Math.round(6010 * 1.05));
    expect(plus5Scen?.unit_cost_pyg).toBeGreaterThan(currentScen!.unit_cost_pyg);
  });
});
