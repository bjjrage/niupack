import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  FreightSearchInput,
  FreightRateProvider,
  LocationRef,
  LogisticsProviderMetadata,
  LogisticsRate,
  RateComponents,
} from './domain';

const REQUEST_TIMEOUT_MS = 12_000;
const SELECTION_TOKEN_TTL_MS = 30 * 60 * 1000;

export const NIUPACK_TO_CARGOFIVE_ISO = {
  '20GP': '20DV',
  '40GP': '40DV',
  '40HC': '40HC',
} as const;

export interface CargoFivePlace {
  id: number;
  place_type_id: 1 | 2;
  name: string;
  display_name: string;
  country_name: string;
  code?: string;
  unlocode?: string;
}

export type CargoFiveRequestStatus = 'OK' | 'NOT_CONFIGURED' | 'RATE_LIMITED' | 'TIMEOUT' | 'ERROR';

export interface CargoFivePlaceSearchResult {
  status: CargoFiveRequestStatus;
  places: CargoFivePlace[];
  message?: string;
  error_code?: string;
}

export interface CargoFiveChargeDisplay {
  name: string;
  category: string;
  amount?: number;
  currency: string;
  rate_basis?: string;
}

export interface CargoFiveRateOption extends Omit<LogisticsRate, 'amount' | 'currency'> {
  amount?: number;
  currency?: string;
  provider_rate_id: string;
  carrier_name: string;
  carrier_code?: string;
  service?: string;
  source_type?: string;
  origin_code?: string;
  destination_code?: string;
  departure_date: string;
  quantity: number;
  charges: CargoFiveChargeDisplay[];
  selectable: boolean;
  unavailable_reason?: string;
  selection_token?: string;
}

export type CargoFiveRateSearchResult = Omit<import('./domain').RateSearchResult<CargoFiveRateOption>, 'provider'> & { provider: 'CargoFive' };

type PersistableRate = Omit<LogisticsRate, 'id' | 'created_at' | 'updated_at'>;
interface SignedSelection {
  organization_id: string;
  expires_at: number;
  rate: PersistableRate;
}
interface ChargeLine {
  name: string;
  category: string;
  amount: number;
  currency: string;
  rate_basis?: string;
}
interface NormalizedPrice {
  amount?: number;
  currency?: string;
  charges: CargoFiveChargeDisplay[];
  components: RateComponents;
  selectable: boolean;
  reason?: string;
}
interface RequestFailure extends Error {
  status: CargoFiveRequestStatus;
  errorCode: string;
}

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (...values: unknown[]): string | undefined => {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
};
const numeric = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    if (Number.isFinite(number)) return number;
  }
  return undefined;
};

function makeFailure(status: CargoFiveRequestStatus, errorCode: string): RequestFailure {
  const error = new Error(errorCode) as RequestFailure;
  error.status = status;
  error.errorCode = errorCode;
  return error;
}

function normalizeBaseUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return undefined;
    if (url.username || url.password || url.search || url.hash) return undefined;
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url;
  } catch {
    return undefined;
  }
}

function parsePlaces(payload: unknown): CargoFivePlace[] {
  const root = object(payload);
  const rows = array(root?.data ?? root?.places ?? payload);
  return rows.flatMap((item) => {
    const row = object(item);
    const id = numeric(row?.id);
    const type = numeric(row?.place_type_id);
    const name = text(row?.name, row?.display_name);
    if (!id || !name || (type !== 1 && type !== 2)) return [];
    const country = text(row?.country_name, row?.country, object(row?.country)?.name) ?? '';
    return [{
      id,
      place_type_id: type,
      name,
      display_name: text(row?.display_name, row?.name) ?? name,
      country_name: country,
      code: text(row?.code),
      unlocode: text(row?.unlocode, row?.code),
    }];
  });
}

function extractRateRows(payload: unknown): Record<string, unknown>[] {
  const root = object(payload);
  const offers = object(root?.offers);
  const candidates = [root?.rates, offers?.rates, root?.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map(object).filter((row): row is Record<string, unknown> => Boolean(row));
  }
  return [];
}

function flattenChargeRows(value: unknown, inheritedCategory = 'other'): Array<{ row: Record<string, unknown>; category: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenChargeRows(item, inheritedCategory));
  }
  const row = object(value);
  if (!row) return [];

  if (Array.isArray(row.tariffs)) return [{ row, category: text(row.rate_type_code, row.category, inheritedCategory)!.toLowerCase() }];

  const result: Array<{ row: Record<string, unknown>; category: string }> = [];
  for (const key of ['freight', 'origin', 'destination', 'pickup', 'delivery', 'other', 'charges']) {
    if (row[key] !== undefined) result.push(...flattenChargeRows(row[key], key === 'charges' ? inheritedCategory : key));
  }
  return result;
}

type NumericComponentKey = Exclude<keyof RateComponents, 'provider_metadata'>;

function categoryBucket(category: string): NumericComponentKey {
  const normalized = category.toLowerCase();
  if (normalized.includes('freight')) return 'main_freight';
  if (normalized.includes('origin') || normalized.includes('pickup')) return 'origin_charges';
  if (normalized.includes('destination') || normalized.includes('delivery')) return 'destination_delivery';
  return 'other_charges';
}

function normalizePrice(rate: Record<string, unknown>, input: FreightSearchInput, iso: string): NormalizedPrice {
  const productPrice = object(rate.product_price) ?? {};
  const directCharges = productPrice.charges;
  const groupedCharges = Object.fromEntries(['freight', 'origin', 'destination'].flatMap((group) => {
    const section = object(productPrice[group]);
    return section?.charges === undefined ? [] : [[group, section.charges]];
  }));
  const directChargeCount = Array.isArray(directCharges) ? directCharges.length : Object.keys(object(directCharges) ?? {}).length;
  const rawCharges = directChargeCount > 0 ? directCharges : groupedCharges;
  const chargeGroups = flattenChargeRows(rawCharges);
  const hasRawCharges = Array.isArray(rawCharges)
    ? rawCharges.length > 0
    : Boolean(object(rawCharges) && Object.keys(object(rawCharges)!).length > 0);
  const parsedCharges: ChargeLine[] = [];
  let incompleteCharge = false;

  for (const { row, category } of chargeGroups) {
    const tariffs = array(row.tariffs).map(object).filter((tariff): tariff is Record<string, unknown> => Boolean(tariff));
    const matching = tariffs.filter((tariff) => {
      const tariffIso = text(tariff.container_iso, tariff.iso, tariff.container_code);
      return !tariffIso || tariffIso.toUpperCase() === iso;
    });
    for (const tariff of matching) {
      const unit = numeric(tariff.total_price_per_qty, tariff.total_price, tariff.unit_price);
      const currency = text(tariff.unit_price_currency, tariff.currency, tariff.total_price_currency, row.unit_price_currency);
      const basis = text(row.rate_basis, tariff.rate_basis);
      const hasQtyTotal = numeric(tariff.total_price_per_qty, tariff.total_price) !== undefined;
      let amount = unit;
      if (amount !== undefined && !hasQtyTotal) {
        if (/per\s*container/i.test(basis ?? '')) amount *= input.quantity;
        else if (input.quantity > 1 && !basis) amount = undefined;
      }
      if (amount === undefined || !currency) {
        incompleteCharge = true;
        continue;
      }
      const charge = object(row.charge);
      parsedCharges.push({
        name: text(charge?.name, row.charge_name, row.invoice_code, row.name, 'CargoFive charge')!,
        category,
        amount,
        currency: currency.toUpperCase(),
        ...(basis ? { rate_basis: basis } : {}),
      });
    }
    if (tariffs.length > 0 && matching.length === 0) incompleteCharge = true;
  }

  const currencies = [...new Set(parsedCharges.map((charge) => charge.currency))];
  const totals = object(productPrice.totals);
  const perContainer = object(totals?.per_container);
  const totalContainers = object(perContainer?.containers);
  const requestedTotal = object(totalContainers?.[iso]);
  const totalCurrency = text(totals?.currency)?.toUpperCase();
  let amount: number | undefined;
  let currency: string | undefined;
  let selectable = false;
  let reason = 'No se pudo totalizar la tarifa con los cargos informados por CargoFive.';

  if (parsedCharges.length > 0 && !incompleteCharge && currencies.length === 1) {
    currency = currencies[0];
    amount = parsedCharges.reduce((sum, charge) => sum + charge.amount, 0);
    selectable = amount !== undefined && Number.isFinite(amount) && amount >= 0 && currency === 'USD';
    reason = selectable ? '' : currency !== 'USD'
      ? `La moneda ${currency} no se puede convertir al USD requerido por el motor de costos.`
      : reason;
  } else if (parsedCharges.length === 0 && !hasRawCharges && requestedTotal && totalCurrency) {
    const total = numeric(requestedTotal.total_per_qty_price, requestedTotal.total_unit_price);
    if (total !== undefined && (totalContainers && currencies.length === 0)) {
      amount = total;
      currency = totalCurrency;
      selectable = amount >= 0 && currency === 'USD';
      reason = selectable ? '' : currency !== 'USD'
        ? `La moneda ${currency} no se puede convertir al USD requerido por el motor de costos.`
        : reason;
    }
  } else if (currencies.length > 1) {
    reason = 'La tarifa contiene cargos en varias monedas; no se presenta un total convertido.';
  } else if (incompleteCharge) {
    reason = 'CargoFive devolvió cargos sin importe, moneda o base suficientes para totalizar.';
  }

  const components: RateComponents = {};
  if (selectable) {
    for (const charge of parsedCharges) {
      const bucket = categoryBucket(charge.category);
      components[bucket] = (components[bucket] ?? 0) + charge.amount;
    }
  }
  return {
    ...(amount === undefined ? {} : { amount }),
    ...(currency ? { currency } : {}),
    charges: parsedCharges.map(({ name, category, amount: chargeAmount, currency: chargeCurrency, rate_basis }) => ({
      name, category, amount: chargeAmount, currency: chargeCurrency, ...(rate_basis ? { rate_basis } : {}),
    })),
    components,
    selectable,
    ...(reason ? { reason } : {}),
  };
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  return text(...values);
}

function routeLocation(
  productOffer: Record<string, unknown>,
  side: 'origin' | 'destination',
  selected: LocationRef,
): LocationRef {
  const label = text(
    productOffer[`${side}_port_display_name`],
    productOffer[`${side}_location_display_name`],
    selected.display_name,
    selected.port,
    selected.city,
  ) ?? selected.country;
  const code = text(productOffer[`${side}_port_unlocode`], productOffer[`${side}_location_unlocode`], selected.unlocode);
  const placeId = numeric(productOffer[`${side}_port_id`], productOffer[`${side}_location_id`], selected.provider_place_id);
  return {
    country: text(selected.country, productOffer[`${side}_country_name`]) ?? '',
    city: label,
    port: label,
    display_name: label,
    provider_place_id: placeId,
    place_type_id: selected.place_type_id,
    ...(code ? { unlocode: code } : {}),
  };
}

function parseTransitDays(schedule: Record<string, unknown>): number | undefined {
  const direct = numeric(schedule.transit_days, schedule.transit_time_days, schedule.transit_time);
  if (direct !== undefined) return direct;
  const label = text(schedule.transit_time, schedule.transit_time_display);
  const match = label?.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function makeOption(
  row: Record<string, unknown>,
  input: FreightSearchInput,
  iso: string,
  organizationId: string,
  retrievedAt: string,
  secret: string,
): CargoFiveRateOption {
  const offer = object(row.product_offer) ?? {};
  const schedule = object(row.schedule) ?? {};
  const price = normalizePrice(row, input, iso);
  const rateId = text(offer.rate_uuid, row.rate_uuid, offer.id);
  const carrierName = text(offer.main_carrier_name, offer.carrier_name, offer.main_product_name, 'Carrier not specified')!;
  const carrierCode = text(offer.main_carrier_scac, offer.main_carrier_code, offer.carrier_code);
  const service = text(offer.service_type, offer.main_product_name);
  const sourceType = text(offer.main_source_type);
  const rateStatus = text(offer.rate_status)?.toLowerCase();
  const selectable = price.selectable && Boolean(rateId) && (!rateStatus || ['valid', 'published', 'active'].includes(rateStatus));
  const origin = routeLocation(offer, 'origin', input.origin);
  const destination = routeLocation(offer, 'destination', input.destination);
  const routing = array(schedule.via_ports ?? offer.via_port).map((via) => {
    const viaRow = object(via);
    return text(viaRow?.name, viaRow?.display_name, viaRow?.port_display_name, via);
  }).filter((item): item is string => Boolean(item));
  const validFrom = firstNonEmpty(offer.valid_from, offer.rate_valid_from, row.valid_from);
  const validUntil = firstNonEmpty(offer.valid_to, offer.rate_valid_to, row.valid_to);
  const providerMetadata: LogisticsProviderMetadata = {
    provider: 'CARGOFIVE',
    rate_id: rateId ?? 'unavailable',
    carrier_name: carrierName,
    ...(carrierCode ? { carrier_code: carrierCode } : {}),
    ...(service ? { service } : {}),
    ...(sourceType ? { source_type: sourceType } : {}),
    departure_date: input.shipment_date,
    ...(routing.length ? { routing } : {}),
    quantity: input.quantity,
    retrieved_at: retrievedAt,
    charges: price.charges.map((charge) => ({
      name: charge.name, category: charge.category, amount: charge.amount ?? 0, currency: charge.currency,
      ...(charge.rate_basis ? { rate_basis: charge.rate_basis } : {}),
    })),
  };
  const rate: PersistableRate = {
    organization_id: organizationId,
    origin,
    destination,
    mode: 'OCEAN',
    amount: price.amount ?? 0,
    currency: price.currency ?? '',
    ...(validFrom ? { valid_from: validFrom } : {}),
    ...(validUntil ? { valid_until: validUntil } : {}),
    ...(parseTransitDays(schedule) === undefined ? {} : { transit_days: parseTransitDays(schedule) }),
    weight_kg: input.weight_kg,
    equipment: input.equipment,
    source: 'OTHER_API',
    status: 'INDICATIVE',
    source_reference: rateId ? `CARGOFIVE:${rateId}` : undefined,
    components: { ...price.components, provider_metadata: providerMetadata },
  };
  const optionBase: CargoFiveRateOption = {
    ...rate,
    id: rateId ?? `${retrievedAt}:${carrierName}`,
    created_at: retrievedAt,
    updated_at: retrievedAt,
    provider_rate_id: rateId ?? '',
    carrier_name: carrierName,
    ...(carrierCode ? { carrier_code: carrierCode } : {}),
    ...(service ? { service } : {}),
    ...(sourceType ? { source_type: sourceType } : {}),
    ...(origin.unlocode ? { origin_code: origin.unlocode } : {}),
    ...(destination.unlocode ? { destination_code: destination.unlocode } : {}),
    equipment: input.equipment,
    quantity: input.quantity,
    departure_date: input.shipment_date,
    ...(parseTransitDays(schedule) === undefined ? {} : { transit_days: parseTransitDays(schedule) }),
    ...(validFrom ? { valid_from: validFrom } : {}),
    ...(validUntil ? { valid_until: validUntil } : {}),
    amount: price.amount,
    currency: price.currency,
    charges: price.charges,
    selectable,
    ...(!selectable ? { unavailable_reason: rateId ? price.reason ?? 'La tarifa no está vigente o no puede seleccionarse.' : 'CargoFive no devolvió el identificador de la tarifa.' } : {}),
  };

  if (!selectable || !rateId) return optionBase;
  const tokenPayload: SignedSelection = {
    organization_id: organizationId,
    expires_at: Date.now() + SELECTION_TOKEN_TTL_MS,
    rate,
  };
  return { ...optionBase, selection_token: signToken(tokenPayload, secret) };
}

function signToken(payload: SignedSelection, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export class CargoFiveProvider implements FreightRateProvider<CargoFiveRateOption> {
  readonly code = 'OTHER_API' as const;

  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}

  private configuration(): { apiKey: string; baseUrl: URL } | undefined {
    const apiKey = process.env.CARGOFIVE_API_KEY?.trim();
    const baseUrlText = process.env.CARGOFIVE_BASE_URL?.trim();
    if (!apiKey || !baseUrlText) return undefined;
    const baseUrl = normalizeBaseUrl(baseUrlText);
    if (!baseUrl) throw makeFailure('ERROR', 'INVALID_PROVIDER_CONFIGURATION');
    return { apiKey, baseUrl };
  }

  private async requestJson(endpoint: string, params?: URLSearchParams): Promise<unknown> {
    let config: ReturnType<CargoFiveProvider['configuration']>;
    try {
      config = this.configuration();
    } catch (error) {
      throw error;
    }
    if (!config) throw makeFailure('NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED');

    const url = new URL(`${config.baseUrl.toString().replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`);
    if (params) url.search = params.toString();
    try {
      const response = await this.fetcher(url, {
        method: 'GET',
        headers: { 'x-api-key': config.apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });
      if (response.status === 429) {
        console.warn('CargoFive request failed', { endpoint, status: response.status, code: 'PROVIDER_RATE_LIMITED' });
        throw makeFailure('RATE_LIMITED', 'PROVIDER_RATE_LIMITED');
      }
      if (!response.ok) {
        console.warn('CargoFive request failed', { endpoint, status: response.status, code: 'PROVIDER_REQUEST_FAILED' });
        throw makeFailure('ERROR', 'PROVIDER_REQUEST_FAILED');
      }
      return await response.json();
    } catch (error) {
      if (object(error) && 'status' in (error as Record<string, unknown>)) throw error;
      const row = object(error);
      const name = text(row?.name);
      if (name === 'TimeoutError' || name === 'AbortError') throw makeFailure('TIMEOUT', 'PROVIDER_TIMEOUT');
      console.warn('CargoFive request failed', { endpoint, code: 'PROVIDER_REQUEST_FAILED' });
      throw makeFailure('ERROR', 'PROVIDER_REQUEST_FAILED');
    }
  }

  async searchPlaces(search: string, placeTypeId?: 1 | 2): Promise<CargoFivePlaceSearchResult> {
    const trimmed = search.trim();
    if (trimmed.length < 4) return { status: 'ERROR', places: [], error_code: 'SEARCH_TOO_SHORT', message: 'Ingresá al menos 4 caracteres.' };
    const params = new URLSearchParams({ search: trimmed });
    if (placeTypeId) params.set('place_type_id', String(placeTypeId));
    try {
      const places = parsePlaces(await this.requestJson('places', params));
      return { status: 'OK', places };
    } catch (error) {
      const failure = error as RequestFailure;
      return { status: failure.status ?? 'ERROR', places: [], error_code: failure.errorCode ?? 'PROVIDER_REQUEST_FAILED', message: publicMessage(failure.status) };
    }
  }

  async searchRates(input: FreightSearchInput, organizationId: string): Promise<CargoFiveRateSearchResult> {
    try {
      if (input.load_type !== 'FCL') throw makeFailure('ERROR', 'UNSUPPORTED_SEARCH_TYPE');
      const config = this.configuration();
      if (!config) throw makeFailure('NOT_CONFIGURED', 'PROVIDER_NOT_CONFIGURED');
      const iso = NIUPACK_TO_CARGOFIVE_ISO[input.equipment as keyof typeof NIUPACK_TO_CARGOFIVE_ISO];
      if (!iso) throw makeFailure('ERROR', 'UNSUPPORTED_EQUIPMENT');
      const originId = input.origin.provider_place_id;
      const destinationId = input.destination.provider_place_id;
      if (!originId || !destinationId || !input.origin.place_type_id || !input.destination.place_type_id) {
        throw makeFailure('ERROR', 'VALID_PLACE_REQUIRED');
      }

      const containerPayload = await this.requestJson('containers');
      const containerRoot = object(containerPayload);
      const containerRows = array(containerRoot?.data ?? containerPayload).map(object).filter((row): row is Record<string, unknown> => Boolean(row));
      const supportedIsos = containerRows.flatMap((container) => array(container.equipments))
        .map(object).filter((equipment): equipment is Record<string, unknown> => Boolean(equipment))
        .map((equipment) => text(equipment.iso, equipment.label)?.toUpperCase())
        .filter((value): value is string => Boolean(value));
      if (!supportedIsos.includes(iso)) throw makeFailure('ERROR', 'UNSUPPORTED_EQUIPMENT');

      const params = new URLSearchParams({
        providers: '-1',
        api_providers: '-1',
        origins: String(originId),
        destinations: String(destinationId),
        origins_place_type_id: String(input.origin.place_type_id),
        destinations_place_type_id: String(input.destination.place_type_id),
        type: 'FCL',
        departure_date: input.shipment_date,
        cargo_details: `${input.quantity}x${iso}x${input.weight_kg}`,
        include_origin_charges: 'true',
        include_destination_charges: 'true',
        include_imo_charges: 'false',
      });
      const payload = await this.requestJson('rates', params);
      const retrievedAt = new Date().toISOString();
      const rates = extractRateRows(payload).map((row) => makeOption(row, input, iso, organizationId, retrievedAt, config.apiKey));
      return {
        provider: 'CargoFive',
        status: 'OK',
        rates,
        ...(rates.length === 0 ? { message: 'No se encontraron tarifas para la ruta y fecha seleccionadas.' } : {}),
      };
    } catch (error) {
      const failure = error as RequestFailure;
      return {
        provider: 'CargoFive',
        status: failure.status ?? 'ERROR',
        rates: [],
        error_code: failure.errorCode ?? 'PROVIDER_REQUEST_FAILED',
        message: publicMessage(failure.status),
      };
    }
  }

  verifySelectionToken(token: string, organizationId: string): { rate?: PersistableRate; error?: 'NOT_CONFIGURED' | 'INVALID_SELECTION' | 'EXPIRED_SELECTION' } {
    let config: ReturnType<CargoFiveProvider['configuration']>;
    try { config = this.configuration(); } catch { return { error: 'NOT_CONFIGURED' }; }
    if (!config) return { error: 'NOT_CONFIGURED' };
    const [encoded, providedSignature, extra] = token.split('.');
    if (!encoded || !providedSignature || extra) return { error: 'INVALID_SELECTION' };
    const expected = createHmac('sha256', config.apiKey).update(encoded).digest();
    let actual: Buffer;
    try { actual = Buffer.from(providedSignature, 'base64url'); } catch { return { error: 'INVALID_SELECTION' }; }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { error: 'INVALID_SELECTION' };
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedSelection;
      if (payload.organization_id !== organizationId || !payload.rate || payload.rate.source !== 'OTHER_API' || payload.rate.mode !== 'OCEAN') {
        return { error: 'INVALID_SELECTION' };
      }
      if (payload.expires_at < Date.now()) return { error: 'EXPIRED_SELECTION' };
      return { rate: payload.rate };
    } catch {
      return { error: 'INVALID_SELECTION' };
    }
  }
}

function publicMessage(status?: CargoFiveRequestStatus): string {
  if (status === 'NOT_CONFIGURED') return 'Proveedor de tarifas marítimas no configurado.';
  if (status === 'RATE_LIMITED') return 'El proveedor limitó temporalmente las consultas. Intentá nuevamente más tarde.';
  if (status === 'TIMEOUT') return 'La consulta de tarifas marítimas agotó el tiempo de espera.';
  return 'No fue posible obtener tarifas marítimas en este momento.';
}
