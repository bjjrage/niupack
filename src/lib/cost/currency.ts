// Utilities for currency management across Industrial Cost Sheet
// Handles USD, PYG, and BOTH presentation/input modes without premature rounding or drift.

export type CostCurrency = 'USD' | 'PYG';
export type CostCurrencyView = 'USD' | 'PYG' | 'BOTH';

export interface CurrencyConversionResult {
  amountUsd: number;
  amountPyg: number;
  fxRate: number;
  inputCurrency: CostCurrency;
}

/**
 * Normalizes a user-entered monetary value into both USD and PYG.
 * When entered in PYG: uses exact division by fxRate to get USD.
 * When entered in USD: multiplies by fxRate to get PYG.
 */
export function normalizeMonetaryInput(
  value: number,
  inputCurrency: CostCurrency,
  fxRate: number | null
): { usd: number; pyg: number } {
  if (!Number.isFinite(value) || value < 0) {
    return { usd: 0, pyg: 0 };
  }

  if (inputCurrency === 'USD') {
    const usd = value;
    const pyg = fxRate !== null && fxRate > 0 ? Math.round(value * fxRate) : 0;
    return { usd, pyg };
  } else {
    // inputCurrency === 'PYG'
    if (fxRate === null || fxRate <= 0) {
      throw new Error('FX_REQUIRED_FOR_PYG_CONVERSION');
    }
    const pyg = Math.round(value);
    const usd = Number((pyg / fxRate).toFixed(6));
    return { usd, pyg };
  }
}

/**
 * Converts a normalized USD amount into the target presentation currency.
 */
export function convertFromUsd(
  amountUsd: number,
  targetCurrency: CostCurrency,
  fxRate: number | null
): number {
  if (!Number.isFinite(amountUsd)) return 0;
  if (targetCurrency === 'USD') return amountUsd;
  if (fxRate === null || fxRate <= 0) return 0;
  return Math.round(amountUsd * fxRate);
}

/**
 * Formats a monetary number for display in the given currency.
 */
export function formatMoney(
  amount: number,
  currency: CostCurrency,
  options?: {
    isUnitCost?: boolean;
    includeSymbol?: boolean;
    decimals?: number;
  }
): string {
  const isUnitCost = options?.isUnitCost ?? false;
  const includeSymbol = options?.includeSymbol ?? true;

  if (currency === 'PYG') {
    const rounded = Math.round(amount);
    const formatted = rounded.toLocaleString('es-PY');
    return includeSymbol ? `Gs. ${formatted}` : formatted;
  }

  // USD
  if (isUnitCost) {
    const dec = options?.decimals ?? 5;
    const formatted = amount.toFixed(dec);
    return includeSymbol ? `$${formatted}` : formatted;
  }

  const dec = options?.decimals ?? 2;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return includeSymbol ? `$${formatted}` : formatted;
}

export type MonetaryUnitType = 'TON' | 'THOUSAND' | 'UNIT' | 'BATCH';

/**
 * Suffix label for monetary input fields based on the active currency.
 */
export function getMonetarySuffix(unitType: MonetaryUnitType, currency: CostCurrency): string {
  switch (unitType) {
    case 'TON':
      return currency === 'PYG' ? 'Gs./t' : 'USD/t';
    case 'THOUSAND':
      return currency === 'PYG' ? 'Gs./1.000' : 'USD/1.000';
    case 'UNIT':
      return currency === 'PYG' ? 'Gs./u' : 'USD/u';
    case 'BATCH':
      return currency === 'PYG' ? 'Gs./lote' : 'USD/lote';
  }
}
