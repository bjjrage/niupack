import type { OceanEquipment } from './domain';

const FREIGHTOS_ENDPOINT = 'https://ship.freightos.com/api/shippingCalculator';
const FREIGHTOS_MARKETPLACE = 'https://ship.freightos.com';
const REQUEST_TIMEOUT_MS = 12_000;

const LOAD_TYPES: Record<Exclude<OceanEquipment, 'LCL'>, string> = {
  '20GP': 'container20',
  '40GP': 'container40',
  '40HC': 'container40HC',
};

export interface FreightosEstimateInput {
  origin: string;
  destination: string;
  equipment: Exclude<OceanEquipment, 'LCL'>;
  quantity: number;
  weight_kg?: number;
}

export interface FreightosEstimate {
  id: string;
  provider: 'FREIGHTOS';
  mode: 'FCL';
  origin: string;
  destination: string;
  equipment: Exclude<OceanEquipment, 'LCL'>;
  quantity: number;
  weight_kg?: number;
  min_amount: number;
  max_amount: number;
  currency: string;
  min_transit_days?: number;
  max_transit_days?: number;
  retrieved_at: string;
  marketplace_url: typeof FREIGHTOS_MARKETPLACE;
}

export type FreightosEstimateStatus = 'OK' | 'NO_RESULTS' | 'RATE_LIMITED' | 'TIMEOUT' | 'ERROR';

export interface FreightosEstimateResult {
  provider: 'Freightos';
  status: FreightosEstimateStatus;
  estimates: FreightosEstimate[];
  message: string;
}

type JsonRecord = Record<string, unknown>;
type Fetcher = typeof fetch;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function money(value: unknown): { amount: number; currency: string } | undefined {
  const row = record(value);
  const valueRow = record(row?.moneyAmount);
  const amount = number(valueRow?.amount);
  const currency = typeof valueRow?.currency === 'string' ? valueRow.currency.trim().toUpperCase() : '';
  return amount !== undefined && /^[A-Z]{3}$/.test(currency) ? { amount, currency } : undefined;
}

function noResults(message = 'Freightos no devolvió una estimación para esa ruta y equipo.'): FreightosEstimateResult {
  return { provider: 'Freightos', status: 'NO_RESULTS', estimates: [], message };
}

export class FreightosProvider {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async estimate(input: FreightosEstimateInput): Promise<FreightosEstimateResult> {
    const url = new URL(FREIGHTOS_ENDPOINT);
    url.searchParams.set('format', 'json');
    url.searchParams.set('mode', 'FCL');
    url.searchParams.set('loadtype', LOAD_TYPES[input.equipment]);
    url.searchParams.set('origin', input.origin.trim());
    url.searchParams.set('destination', input.destination.trim());
    url.searchParams.set('quantity', String(input.quantity));
    if (input.weight_kg !== undefined) url.searchParams.set('weight', String(input.weight_kg));

    try {
      const response = await this.fetcher(url, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 429) {
        return {
          provider: 'Freightos', status: 'RATE_LIMITED', estimates: [],
          message: 'Se alcanzó el límite público de Freightos. Esperá un momento y volvé a intentar.',
        };
      }
      if (!response.ok) {
        return { provider: 'Freightos', status: 'ERROR', estimates: [], message: 'Freightos no pudo completar la consulta.' };
      }

      const payload: unknown = await response.json();
      const root = record(payload);
      const responseData = record(root?.response) ?? root;
      const rateData = record(responseData?.estimatedFreightRates);
      if (!rateData) return noResults();

      const count = number(rateData.numQuotes);
      if (count === 0) return noResults();

      const rawModes = rateData.mode;
      const modes = Array.isArray(rawModes) ? rawModes : rawModes ? [rawModes] : [];
      const modeRows = modes.map(record);
      const fclMode = modeRows.find((row) => String(row?.mode ?? '').toUpperCase() === 'FCL')
        ?? modeRows.find((row) => row !== undefined);
      const price = record(fclMode?.price);
      const minimum = money(price?.min);
      const maximum = money(price?.max);
      if (!minimum || !maximum || minimum.currency !== maximum.currency || maximum.amount < minimum.amount) {
        return noResults();
      }

      const transit = record(fclMode?.transitTimes);
      const minTransit = number(transit?.min);
      const maxTransit = number(transit?.max);
      const estimate: FreightosEstimate = {
        id: `${input.origin.trim()}-${input.destination.trim()}-${input.equipment}-${input.quantity}`,
        provider: 'FREIGHTOS',
        mode: 'FCL',
        origin: input.origin.trim(),
        destination: input.destination.trim(),
        equipment: input.equipment,
        quantity: input.quantity,
        ...(input.weight_kg !== undefined ? { weight_kg: input.weight_kg } : {}),
        min_amount: minimum.amount,
        max_amount: maximum.amount,
        currency: minimum.currency,
        ...(minTransit !== undefined ? { min_transit_days: minTransit } : {}),
        ...(maxTransit !== undefined ? { max_transit_days: maxTransit } : {}),
        retrieved_at: new Date().toISOString(),
        marketplace_url: FREIGHTOS_MARKETPLACE,
      };

      return {
        provider: 'Freightos', status: 'OK', estimates: [estimate],
        message: 'Estimación referencial recibida. No es una tarifa firme ni una reserva.',
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        return { provider: 'Freightos', status: 'TIMEOUT', estimates: [], message: 'Freightos tardó demasiado en responder. Probá de nuevo.' };
      }
      return { provider: 'Freightos', status: 'ERROR', estimates: [], message: 'No fue posible consultar Freightos en este momento.' };
    }
  }
}
