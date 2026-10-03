import type { Qualification } from '@/lib/crm/types';
import type { ExtractedCommercial } from '../types';

/** Reglas simples V1: HIGH requiere producto + volumen + mercado/destino + intención comercial. Sin ML. */
export function qualify(extracted: ExtractedCommercial): Qualification {
  const hasProduct = Boolean(extracted.product_interest);
  const hasVolume = Boolean(extracted.estimated_volume && extracted.estimated_volume >= 10_000);
  const hasMarket = Boolean(extracted.destination_city || extracted.destination_country || extracted.country);
  const hasIntent = Boolean(extracted.intent && ['RFQ', 'PRICE_REQUEST', 'SAMPLE_REQUEST', 'SPEC_REQUEST'].includes(extracted.intent));
  const signals = [hasProduct, hasVolume, hasMarket, hasIntent].filter(Boolean).length;
  if (hasProduct && hasVolume && hasMarket && hasIntent) return 'HIGH';
  if (signals >= 2) return 'MEDIUM';
  return 'LOW';
}

export function missingFields(extracted: ExtractedCommercial): string[] {
  const missing: string[] = [];
  if (!extracted.product_interest) missing.push('product_interest');
  if (!extracted.estimated_volume) missing.push('estimated_volume');
  if (!extracted.destination_city) missing.push('destination_city');
  return missing;
}
