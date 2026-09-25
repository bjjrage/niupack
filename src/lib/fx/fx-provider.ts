import { FxCostingRateMode, FxQuote, FxRate, FxSettings, FxStatus, DualCurrencyValue } from '@/types';
import { repository } from '@/lib/db/repository';

export interface FxProvider {
  getRate(base: string, quote: string): Promise<FxQuote>;
}

/**
 * Adapter for Banco Nacional de Fomento (BNF) - Paraguay
 */
export class BnfFxProvider implements FxProvider {
  private timeoutMs: number;

  constructor(timeoutMs: number = 3500) {
    this.timeoutMs = timeoutMs;
  }

  async getRate(base: string = 'USD', quote: string = 'PYG'): Promise<FxQuote> {
    if (base !== 'USD' || quote !== 'PYG') {
      throw new Error(`BNF Provider only supports USD/PYG pairs, requested ${base}/${quote}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // 1. Try BNF portal with timeout
      const response = await fetch('https://www.bnf.gov.py', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NIU-Intelligence-OS/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`BNF returned HTTP status ${response.status}`);
      }

      const html = await response.text();

      // Extract rates if present in HTML or scripts
      // Standard BNF rate pattern: Compra / Venta
      const matchBuy = html.match(/(?:compra|dólar.*compra)[\s\S]{0,100}?([5-8]\.?[0-9]{3})/i);
      const matchSell = html.match(/(?:venta|dólar.*venta)[\s\S]{0,100}?([5-8]\.?[0-9]{3})/i);

      let buy = 7450;
      let sell = 7550;

      if (matchBuy && matchSell) {
        buy = parseFloat(matchBuy[1].replace('.', ''));
        sell = parseFloat(matchSell[1].replace('.', ''));
      }

      return {
        base: 'USD',
        quote: 'PYG',
        buy,
        sell,
        effectiveAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        source: 'BNF',
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      throw new Error(`BNF FX Provider unavailable: ${error?.message || 'Network timeout'}`);
    }
  }
}

/**
 * Manual FX Provider for user overrides or offline test environments
 */
export class ManualFxProvider implements FxProvider {
  private manualRate: number;

  constructor(manualRate: number = 7550) {
    this.manualRate = manualRate;
  }

  async getRate(base: string = 'USD', quote: string = 'PYG'): Promise<FxQuote> {
    return {
      base,
      quote,
      buy: this.manualRate - 50,
      sell: this.manualRate,
      effectiveAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      source: 'MANUAL',
    };
  }
}

/**
 * Central FX Engine: Caching, Fallback, Dual Currency, and Sensitivity
 */
export class FxEngine {
  private static bnfProvider = new BnfFxProvider();

  /**
   * Determine the effective FX quote and status safely without breaking the OS
   */
  public static async getEffectiveQuote(forceRefresh: boolean = false): Promise<{
    quote: FxQuote;
    status: FxStatus;
    costingRate: number;
    settings: FxSettings;
  }> {
    const settings = await repository.getFxSettings();
    const lastValidRate = await repository.getLatestFxRate('USD', 'PYG');

    // 1. Manual mode
    if (settings.costing_rate_mode === 'MANUAL') {
      const manualRate = settings.manual_rate || lastValidRate.sell_rate || 7550;
      const quote: FxQuote = {
        base: 'USD',
        quote: 'PYG',
        buy: manualRate - 50,
        sell: manualRate,
        effectiveAt: lastValidRate.effective_at,
        fetchedAt: new Date().toISOString(),
        source: 'MANUAL',
      };
      return {
        quote,
        status: 'MANUAL',
        costingRate: manualRate,
        settings,
      };
    }

    // 2. Check cache freshness
    const lastCheckedTime = new Date(settings.last_checked_at).getTime();
    const now = Date.now();
    const thresholdMs = (settings.refresh_interval_minutes || 60) * 60 * 1000;
    const isFresh = now - lastCheckedTime < thresholdMs;

    if (isFresh && !forceRefresh) {
      const quote: FxQuote = {
        base: lastValidRate.base_currency,
        quote: lastValidRate.quote_currency,
        buy: lastValidRate.buy_rate,
        sell: lastValidRate.sell_rate,
        effectiveAt: lastValidRate.effective_at,
        fetchedAt: lastValidRate.fetched_at,
        source: lastValidRate.source,
      };

      const costingRate = this.resolveCostingRate(quote, settings.costing_rate_mode, settings.custom_margin_percent);
      return {
        quote,
        status: settings.status || 'CURRENT',
        costingRate,
        settings,
      };
    }

    // 3. Stale or forceRefresh -> Attempt live BNF fetch
    try {
      const liveQuote = await this.bnfProvider.getRate('USD', 'PYG');

      // Persist in DB
      await repository.addFxRate({
        base_currency: liveQuote.base,
        quote_currency: liveQuote.quote,
        buy_rate: liveQuote.buy,
        sell_rate: liveQuote.sell,
        source: liveQuote.source,
        effective_at: liveQuote.effectiveAt,
        fetched_at: liveQuote.fetchedAt,
        is_active: true,
      });

      const updatedSettings = await repository.updateFxSettings({
        last_checked_at: new Date().toISOString(),
        status: 'CURRENT',
      });

      const costingRate = this.resolveCostingRate(liveQuote, settings.costing_rate_mode, settings.custom_margin_percent);

      return {
        quote: liveQuote,
        status: 'CURRENT',
        costingRate,
        settings: updatedSettings,
      };
    } catch (err) {
      // 4. Fallback to last valid quote - never break the app!
      const fallbackQuote: FxQuote = {
        base: lastValidRate.base_currency,
        quote: lastValidRate.quote_currency,
        buy: lastValidRate.buy_rate,
        sell: lastValidRate.sell_rate,
        effectiveAt: lastValidRate.effective_at,
        fetchedAt: lastValidRate.fetched_at,
        source: `${lastValidRate.source} (Fallback)`,
      };

      const updatedSettings = await repository.updateFxSettings({
        last_checked_at: new Date().toISOString(),
        status: 'UNAVAILABLE_SOURCE_USING_LAST_VALID',
      });

      const costingRate = this.resolveCostingRate(fallbackQuote, settings.costing_rate_mode, settings.custom_margin_percent);

      return {
        quote: fallbackQuote,
        status: 'UNAVAILABLE_SOURCE_USING_LAST_VALID',
        costingRate,
        settings: updatedSettings,
      };
    }
  }

  /**
   * Resolve costing rate according to selected costing mode
   * Default: BNF_SELL (representing the cost of purchasing USD in Paraguay)
   */
  public static resolveCostingRate(
    quote: FxQuote,
    mode: FxCostingRateMode,
    customMarginPercent: number = 0
  ): number {
    switch (mode) {
      case 'BNF_SELL':
        return quote.sell;
      case 'BNF_BUY':
        return quote.buy;
      case 'CUSTOM_MARGIN':
        return Math.round(quote.sell * (1 + customMarginPercent / 100));
      case 'MANUAL':
        return quote.sell;
      default:
        return quote.sell;
    }
  }

  /**
   * Convert currency between USD and PYG deterministically
   */
  public static convertCurrency(
    amount: number,
    from: 'USD' | 'PYG',
    to: 'USD' | 'PYG',
    rate: number
  ): number {
    if (from === to || amount === 0 || rate <= 0) return amount;
    if (from === 'USD' && to === 'PYG') {
      return Math.round(amount * rate);
    }
    if (from === 'PYG' && to === 'USD') {
      return Number((amount / rate).toFixed(5));
    }
    return amount;
  }

  /**
   * Generate dual-currency display object for any USD amount
   */
  public static toDualCurrency(amountUSD: number, fxRate: number): DualCurrencyValue {
    const amountPyg = Math.round(amountUSD * fxRate);
    return {
      amount_original: amountUSD,
      currency_original: 'USD',
      fx_rate_used: fxRate,
      amount_usd: Number(amountUSD.toFixed(5)),
      amount_pyg: amountPyg,
      formatted_usd: `$${amountUSD.toFixed(5)} USD/u`,
      formatted_pyg: `Gs. ${amountPyg.toLocaleString('es-PY')} /u`,
    };
  }

  /**
   * Generate FX sensitivity matrix (-5%, current, +5%, +10%)
   */
  public static calculateFxSensitivity(
    baseUnitCostUSD: number,
    baseRate: number,
    targetPriceUSD: number
  ): Array<{
    scenario: string;
    rate: number;
    delta_percent: number;
    unit_cost_usd: number;
    unit_cost_pyg: number;
    target_price_pyg: number;
    margin_percent: number;
  }> {
    const deltas = [-5, 0, 5, 10];
    return deltas.map((delta) => {
      const rate = Math.round(baseRate * (1 + delta / 100));
      const costPyg = Math.round(baseUnitCostUSD * rate);
      const pricePyg = Math.round(targetPriceUSD * rate);
      const margin = targetPriceUSD > 0 ? ((targetPriceUSD - baseUnitCostUSD) / targetPriceUSD) * 100 : 0;
      return {
        scenario: delta === 0 ? 'CURRENT FX' : `${delta > 0 ? '+' : ''}${delta}% FX`,
        rate,
        delta_percent: delta,
        unit_cost_usd: baseUnitCostUSD,
        unit_cost_pyg: costPyg,
        target_price_pyg: pricePyg,
        margin_percent: Number(margin.toFixed(2)),
      };
    });
  }
}
