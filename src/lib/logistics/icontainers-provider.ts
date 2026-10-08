import type { OceanEquipment } from './domain';

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_POLL_RETRIES = 3;
const POLL_INTERVAL_MS = 1_000;

export const ICONTAINERS_BASE_URLS = {
  development: 'https://brutus-dev.icontainers.com',
  production: 'https://brutus.icontainers.com',
} as const;

export type IContainersApiEnv = keyof typeof ICONTAINERS_BASE_URLS;

export const NIUPACK_TO_ICONTAINERS_EQUIPMENT: Record<Exclude<OceanEquipment, 'LCL'>, 'DV20' | 'DV40' | 'DV40HC'> = {
  '20GP': 'DV20',
  '40GP': 'DV40',
  '40HC': 'DV40HC',
};

export const ICONTAINERS_TO_NIUPACK_EQUIPMENT: Record<'DV20' | 'DV40' | 'DV40HC', Exclude<OceanEquipment, 'LCL'>> = {
  'DV20': '20GP',
  'DV40': '40GP',
  'DV40HC': '40HC',
};

/** Regional maritime transshipment ports that do NOT count as destination in Paraguay without inland/river transport */
export const REGIONAL_TRANSSHIPMENT_PORTS = ['BRSSZ', 'BRPNG', 'ARBUE', 'UYMVD'] as const;

export type ParaguayValidationStatus =
  | 'READY'
  | 'SCOPE_INCOMPLETE'
  | 'PARTIAL_QUOTE'
  | 'NO_RESULTS'
  | 'DESTINATION_UNSUPPORTED'
  | 'NOT_CONFIGURED'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'ERROR';

export interface IContainersPlace {
  id: string;
  name: string;
  type: 'port' | 'city' | 'postalCode';
  country_code: string;
  port_code?: string;
  city_name?: string;
  postal_code?: string;
  display_name: string;
  is_paraguay: boolean;
}

export interface IContainersPlaceSearchResult {
  provider: 'iContainers';
  status: ParaguayValidationStatus;
  places: IContainersPlace[];
  message?: string;
  error_code?: string;
}

export interface IContainersBillingItem {
  name: string;
  service_item: string;
  optional: boolean;
  amount?: number;
  taxes?: number;
  total?: number;
  currency?: string;
  has_valid_price?: boolean;
}

export interface IContainersNormalizedRate {
  id: string;
  provider: 'iContainers';
  quote_uuid: string;
  rate_uuid: string;

  origin: string;
  destination: string;
  origin_code: string;
  destination_code: string;

  equipment?: Exclude<OceanEquipment, 'LCL'>;
  quantity: number;

  freight_amount?: number;
  total_amount?: number;
  currency?: string;

  carrier_name?: string;

  billing_items: IContainersBillingItem[];
  included_services: string[];
  excluded_services: string[];

  valid_until?: string;
  departure_date?: string;
  transit_days?: number;
  transshipment_ports: string[];

  retrieved_at: string;
  quote_url?: string;

  is_partial: boolean;
  scope_complete: boolean;
  is_comparable: boolean;
  unavailable_reason?: string;
  paraguay_status: ParaguayValidationStatus;
}

export interface IContainersQuoteInput {
  origin: {
    port_code: string;
    name?: string;
    country_code?: string;
  };
  destination: {
    port_code: string;
    name?: string;
    country_code?: string;
  };
  equipment?: Exclude<OceanEquipment, 'LCL'>;
  quantity: number;
  shipment_date?: string;
  weight_kg?: number;
  currency?: string;
  lang?: 'en_US' | 'es_ES';
  max_execution_time?: number;
  validate_paraguay?: boolean;
}

export interface IContainersQuoteResult {
  provider: 'iContainers';
  status: ParaguayValidationStatus;
  quote_uuid?: string;
  rates: IContainersNormalizedRate[];
  message: string;
  error_code?: string;
  is_partial?: boolean;
  completed?: boolean;
}

export interface IContainersProviderConfig {
  token?: string;
  env?: IContainersApiEnv;
  enabled?: boolean;
  timeoutMs?: number;
}

type JsonRecord = Record<string, unknown>;

function object(val: unknown): JsonRecord | undefined {
  return val !== null && typeof val === 'object' && !Array.isArray(val) ? (val as JsonRecord) : undefined;
}

function array(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function text(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function numeric(...values: unknown[]): number | undefined {
  for (const v of values) {
    const num = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

export class IContainersProvider {
  private readonly fetcher: typeof fetch;
  private readonly configOverride?: Partial<IContainersProviderConfig>;

  constructor(fetcher: typeof fetch = (...args) => fetch(...args), configOverride?: Partial<IContainersProviderConfig>) {
    this.fetcher = fetcher;
    this.configOverride = configOverride;
  }

  /**
   * Resolves configuration strictly server-side.
   * Returns undefined if disabled or token is missing.
   */
  public configuration(): { token: string; baseUrl: URL; env: IContainersApiEnv } | undefined {
    const enabledStr = this.configOverride?.enabled !== undefined
      ? String(this.configOverride.enabled)
      : process.env.ICONTAINERS_ENABLED?.trim();
    if (enabledStr !== 'true') return undefined;

    const token = this.configOverride?.token ?? process.env.ICONTAINERS_API_TOKEN?.trim();
    if (!token) return undefined;

    const envName = (this.configOverride?.env ?? process.env.ICONTAINERS_API_ENV?.trim() ?? 'development') as IContainersApiEnv;
    const baseUrlStr = ICONTAINERS_BASE_URLS[envName] || ICONTAINERS_BASE_URLS.development;
    const baseUrl = new URL(baseUrlStr);

    return { token, baseUrl, env: envName };
  }

  /**
   * Verifies whether a destination place code or reference is in Paraguay (country PY or code starting with PY).
   */
  public isParaguayDestination(destination: { port_code?: string; country_code?: string } | string): boolean {
    if (typeof destination === 'string') {
      const trimmed = destination.trim().toUpperCase();
      return trimmed.startsWith('PY') || trimmed === 'PARAGUAY';
    }
    const country = destination.country_code?.trim().toUpperCase();
    if (country === 'PY' || country === 'PARAGUAY') return true;
    const code = destination.port_code?.trim().toUpperCase();
    return Boolean(code && code.startsWith('PY'));
  }

  private async requestJson(endpoint: string, options: { method?: string; body?: unknown; params?: URLSearchParams } = {}): Promise<unknown> {
    const config = this.configuration();
    if (!config) {
      throw { status: 'NOT_CONFIGURED', errorCode: 'NOT_CONFIGURED', message: 'iContainers no configurado — requiere credenciales.' };
    }

    const url = new URL(`${config.baseUrl.origin}/${endpoint.replace(/^\//, '')}`);
    if (options.params) url.search = options.params.toString();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const timeout = this.configOverride?.timeoutMs ?? REQUEST_TIMEOUT_MS;

    try {
      const response = await this.fetcher(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(timeout),
        redirect: 'error',
      });

      if (response.status === 401 || response.status === 403) {
        throw { status: 'AUTH_FAILED', errorCode: 'AUTH_FAILED', message: 'Error de autenticación con iContainers Brutus API.' };
      }
      if (response.status === 429) {
        throw { status: 'RATE_LIMITED', errorCode: 'RATE_LIMITED', message: 'Límite de consultas excedido en iContainers Brutus API. Esperá unos momentos.' };
      }
      if (response.status === 422) {
        const errJson = await response.json().catch(() => ({}));
        const errObj = object(errJson);
        const detailMsg = text(errObj?.message, errObj?.error) || 'Datos de consulta no válidos para iContainers Brutus API.';
        throw { status: 'ERROR', errorCode: 'VALIDATION_ERROR', message: detailMsg };
      }
      if (!response.ok) {
        throw { status: 'ERROR', errorCode: 'SERVER_ERROR', message: `iContainers Brutus API respondió con error HTTP ${response.status}.` };
      }

      return await response.json();
    } catch (err: unknown) {
      if (object(err) && 'status' in (err as JsonRecord)) throw err;
      const errName = (err instanceof Error ? err.name : text(object(err)?.name)) || '';
      if (errName === 'TimeoutError' || errName === 'AbortError') {
        throw { status: 'TIMEOUT', errorCode: 'TIMEOUT', message: 'La consulta a iContainers Brutus API agotó el tiempo de espera.' };
      }
      throw { status: 'ERROR', errorCode: 'NETWORK_ERROR', message: 'No fue posible conectar con iContainers Brutus API.' };
    }
  }

  /**
   * Search places in iContainers maritime directory.
   */
  public async searchPlaces(term: string, shipmentType: 'FCL' | 'LCL' = 'FCL'): Promise<IContainersPlaceSearchResult> {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      return {
        provider: 'iContainers',
        status: 'ERROR',
        places: [],
        error_code: 'SEARCH_TOO_SHORT',
        message: 'Ingresá al menos 2 caracteres para buscar puertos.',
      };
    }

    if (!this.configuration()) {
      return {
        provider: 'iContainers',
        status: 'NOT_CONFIGURED',
        places: [],
        error_code: 'NOT_CONFIGURED',
        message: 'iContainers no configurado — requiere credenciales.',
      };
    }

    const params = new URLSearchParams({
      term: trimmed,
      shipmentType,
    });

    try {
      const payload = await this.requestJson('api/v1/locations/maritime/places', { params });
      const root = object(payload);
      const data = object(root?.data) ?? root;

      const places: IContainersPlace[] = [];

      // Parse seaPorts
      for (const item of array(data?.seaPorts)) {
        const row = object(item);
        if (!row) continue;
        const portName = text(row.portName, row.name);
        const portIsoCode = text(row.portIsoCode, row.code);
        const countryIsoCode = text(row.countryIsoCode, row.country);
        const cityName = text(row.cityName, row.city);

        if (!portIsoCode && !portName) continue;
        const code = (portIsoCode ?? '').toUpperCase();
        const country = (countryIsoCode ?? '').toUpperCase();
        const isParaguay = country === 'PY' || code.startsWith('PY');

        places.push({
          id: code || `${country}-${portName}`,
          name: portName || code,
          type: 'port',
          country_code: country,
          port_code: code || undefined,
          city_name: cityName,
          display_name: `${portName ?? code} (${code})${cityName ? ', ' + cityName : ''}, ${country}`,
          is_paraguay: isParaguay,
        });
      }

      // Parse cities
      for (const item of array(data?.cities)) {
        const row = object(item);
        if (!row) continue;
        const cityName = text(row.cityName, row.name);
        const countryIsoCode = text(row.countryIsoCode, row.country);
        const defaultPostalCode = text(row.defaultPostalCode, row.postalCode);
        if (!cityName) continue;

        const country = (countryIsoCode ?? '').toUpperCase();
        const isParaguay = country === 'PY';

        places.push({
          id: `city:${country}:${cityName}`,
          name: cityName,
          type: 'city',
          country_code: country,
          city_name: cityName,
          postal_code: defaultPostalCode,
          display_name: `${cityName}, ${country}`,
          is_paraguay: isParaguay,
        });
      }

      return {
        provider: 'iContainers',
        status: places.length > 0 ? 'READY' : 'NO_RESULTS',
        places,
        message: places.length > 0 ? undefined : 'No se encontraron puertos para el término buscado.',
      };
    } catch (error: unknown) {
      const failure = object(error);
      const status = (text(failure?.status) as ParaguayValidationStatus) || 'ERROR';
      const message = text(failure?.message) || 'Error al buscar puertos en iContainers.';
      const errorCode = text(failure?.errorCode) || 'PROVIDER_ERROR';
      return {
        provider: 'iContainers',
        status,
        places: [],
        message,
        error_code: errorCode,
      };
    }
  }

  /**
   * Request FCL Quote from iContainers Brutus API and normalize results.
   */
  public async createFclQuote(input: IContainersQuoteInput): Promise<IContainersQuoteResult> {
    const config = this.configuration();
    if (!config) {
      return {
        provider: 'iContainers',
        status: 'NOT_CONFIGURED',
        rates: [],
        message: 'iContainers no configurado — requiere credenciales.',
        error_code: 'NOT_CONFIGURED',
      };
    }

    // Strict Paraguay Destination Check
    const validatePy = input.validate_paraguay !== false;
    if (validatePy && !this.isParaguayDestination(input.destination)) {
      return {
        provider: 'iContainers',
        status: 'DESTINATION_UNSUPPORTED',
        rates: [],
        message: 'El destino seleccionado no pertenece a Paraguay. Se requiere un puerto paraguayo (ej. PYASU).',
        error_code: 'DESTINATION_UNSUPPORTED',
      };
    }

    const containerType = input.equipment ? NIUPACK_TO_ICONTAINERS_EQUIPMENT[input.equipment] : undefined;
    if (!containerType) {
      return {
        provider: 'iContainers',
        status: 'ERROR',
        rates: [],
        message: input.equipment
          ? `Tipo de contenedor ${input.equipment} no soportado por iContainers Brutus.`
          : 'Debe especificarse el tipo de contenedor (20GP, 40GP o 40HC).',
        error_code: 'UNSUPPORTED_EQUIPMENT',
      };
    }

    const body = {
      currency: input.currency?.toUpperCase() || 'USD',
      lang: input.lang || 'en_US',
      origin: {
        type: 'port',
        portIsoCode: input.origin.port_code.toUpperCase(),
      },
      destination: {
        type: 'port',
        portIsoCode: input.destination.port_code.toUpperCase(),
      },
      containers: [
        {
          quantity: input.quantity,
          type: containerType,
        },
      ],
      bestOffer: false,
      maxExecutionTime: input.max_execution_time ?? 30,
    };

    try {
      const payload = await this.requestJson('api/v1/quotes/fcl', { method: 'POST', body });
      const root = object(payload);
      let quoteData = object(root?.data) ?? root;

      let quoteUuid = text(quoteData?.uuid);
      let isCompleted = Boolean(quoteData?.completed);

      // Async Quote Handling: if completed === false and we have a quote UUID, poll up to MAX_POLL_RETRIES
      if (!isCompleted && quoteUuid) {
        for (let attempt = 0; attempt < MAX_POLL_RETRIES; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          try {
            const pollPayload = await this.requestJson(`api/v1/quotes/${quoteUuid}`);
            const pollRoot = object(pollPayload);
            const polled = object(pollRoot?.data) ?? pollRoot;
            if (polled) {
              quoteData = polled;
              quoteUuid = text(quoteData?.uuid) || quoteUuid;
              if (polled.completed) {
                isCompleted = true;
                break;
              }
            }
          } catch {
            // Stop polling on error, process what was received originally
            break;
          }
        }
      }

      const retrievedAt = new Date().toISOString();
      const rates = this.normalizeRates(quoteData ?? {}, input, retrievedAt);

      if (rates.length === 0) {
        if (!isCompleted) {
          return {
            provider: 'iContainers',
            status: 'PARTIAL_QUOTE',
            quote_uuid: quoteUuid,
            rates: [],
            message: 'Cotización en proceso con el proveedor (pendiente de finalización). Podés consultar nuevamente en unos instantes con el identificador.',
            completed: false,
            is_partial: true,
          };
        }
        return {
          provider: 'iContainers',
          status: 'NO_RESULTS',
          quote_uuid: quoteUuid,
          rates: [],
          message: 'No se encontraron tarifas de flete para la ruta y equipo solicitados.',
          completed: true,
          is_partial: false,
        };
      }

      // Check overarching Paraguay status across rates
      const anyReady = rates.some((r) => r.paraguay_status === 'READY');
      const anyScopeIncomplete = rates.some((r) => r.paraguay_status === 'SCOPE_INCOMPLETE');
      const anyPartial = rates.some((r) => r.is_partial);

      let overallStatus: ParaguayValidationStatus = 'READY';
      if (!isCompleted || anyPartial) {
        overallStatus = 'PARTIAL_QUOTE';
      } else if (!anyReady && anyScopeIncomplete) {
        overallStatus = 'SCOPE_INCOMPLETE';
      }

      return {
        provider: 'iContainers',
        status: overallStatus,
        quote_uuid: quoteUuid,
        rates,
        message: overallStatus === 'SCOPE_INCOMPLETE'
          ? 'Las tarifas devueltas terminan en puerto marítimo regional y no confirman continuación fluvial a Paraguay.'
          : overallStatus === 'PARTIAL_QUOTE'
          ? 'Cotización parcial o pendiente de finalización por el proveedor.'
          : `${rates.length} tarifa(s) válida(s) recibida(s) de iContainers Brutus.`,
        completed: isCompleted,
        is_partial: !isCompleted,
      };
    } catch (error: unknown) {
      const failure = object(error);
      const status = (text(failure?.status) as ParaguayValidationStatus) || 'ERROR';
      const message = text(failure?.message) || 'Error al cotizar FCL con iContainers Brutus API.';
      const errorCode = text(failure?.errorCode) || 'PROVIDER_ERROR';
      return {
        provider: 'iContainers',
        status,
        rates: [],
        message,
        error_code: errorCode,
      };
    }
  }

  /**
   * Retrieve an existing quote by UUID.
   */
  public async getQuote(uuid: string, bestOffer = false): Promise<IContainersQuoteResult> {
    if (!this.configuration()) {
      return {
        provider: 'iContainers',
        status: 'NOT_CONFIGURED',
        rates: [],
        message: 'iContainers no configurado — requiere credenciales.',
        error_code: 'NOT_CONFIGURED',
      };
    }

    const params = new URLSearchParams();
    if (bestOffer) params.set('bestOffer', 'true');

    try {
      const payload = await this.requestJson(`api/v1/quotes/${uuid}`, { params });
      const root = object(payload);
      const quoteData = object(root?.data) ?? root;

      const retrievedAt = new Date().toISOString();
      const firstRate = object(array(quoteData?.rates)[0]);
      const firstSchedule = object(firstRate?.schedule);

      const originPort = text(
        object(quoteData?.origin)?.portIsoCode,
        object(quoteData?.origin)?.code,
        object(firstSchedule?.origin)?.code,
      ) || '';
      const destPort = text(
        object(quoteData?.destination)?.portIsoCode,
        object(quoteData?.destination)?.code,
        object(firstSchedule?.destination)?.code,
      ) || '';

      const containersArr = array(quoteData?.containers).length > 0
        ? array(quoteData?.containers)
        : array(quoteData?.items);
      const firstItem = object(containersArr[0]);
      const rawType = text(firstItem?.type) as 'DV20' | 'DV40' | 'DV40HC' | undefined;
      const niuEquipment: Exclude<OceanEquipment, 'LCL'> | undefined =
        rawType && rawType in ICONTAINERS_TO_NIUPACK_EQUIPMENT
          ? ICONTAINERS_TO_NIUPACK_EQUIPMENT[rawType]
          : undefined;
      const qty = numeric(firstItem?.quantity) ?? 1;

      const synthInput: IContainersQuoteInput = {
        origin: { port_code: originPort },
        destination: { port_code: destPort },
        equipment: niuEquipment,
        quantity: qty,
        validate_paraguay: Boolean(destPort),
      };

      const isCompleted = Boolean(quoteData?.completed);
      const rates = this.normalizeRates(quoteData ?? {}, synthInput, retrievedAt);

      if (rates.length === 0) {
        if (!isCompleted) {
          return {
            provider: 'iContainers',
            status: 'PARTIAL_QUOTE',
            quote_uuid: uuid,
            rates: [],
            message: 'Cotización en proceso con el proveedor (pendiente de finalización).',
            completed: false,
            is_partial: true,
          };
        }
        return {
          provider: 'iContainers',
          status: 'NO_RESULTS',
          quote_uuid: uuid,
          rates: [],
          message: 'No se encontraron tarifas para esta cotización.',
          completed: true,
          is_partial: false,
        };
      }

      const overallStatus: ParaguayValidationStatus = !isCompleted ? 'PARTIAL_QUOTE' : rates[0].paraguay_status;

      return {
        provider: 'iContainers',
        status: overallStatus,
        quote_uuid: uuid,
        rates,
        message: !isCompleted ? 'Cotización en proceso con el proveedor (pendiente de finalización).' : 'Cotización recuperada.',
        completed: isCompleted,
        is_partial: !isCompleted,
      };
    } catch (error: unknown) {
      const failure = object(error);
      const status = (text(failure?.status) as ParaguayValidationStatus) || 'ERROR';
      const message = text(failure?.message) || 'Error al recuperar cotización de iContainers Brutus.';
      return {
        provider: 'iContainers',
        status,
        rates: [],
        message,
        error_code: text(failure?.errorCode),
      };
    }
  }

  /**
   * Normalizes raw iContainers rate objects into domain-compliant IContainersNormalizedRate.
   */
  public normalizeRates(
    quoteData: JsonRecord,
    input: IContainersQuoteInput,
    retrievedAt: string,
  ): IContainersNormalizedRate[] {
    const rawRates = array(quoteData.rates);
    const quoteUuid = text(quoteData.uuid) || '';
    const quoteOnlineUrl = text(quoteData.quoteOnlineUrl);
    const isQuotePartial = Boolean(quoteData.isPartial) || quoteData.completed === false;

    const normalizedList: IContainersNormalizedRate[] = [];

    for (const item of rawRates) {
      const rateObj = object(item);
      if (!rateObj) continue;

      const rateUuid = text(rateObj.uuid) || crypto.randomUUID();
      const expirationDate = text(rateObj.expirationDate);
      const isRatePartial = Boolean(rateObj.isPartial) || isQuotePartial;

      const schedule = object(rateObj.schedule) ?? {};
      const departureDate = text(schedule.departureDate);
      const transitDays = numeric(rateObj.transitTime, schedule.transitDays);

      const scheduleOriginCode = text(object(schedule.origin)?.code);
      const scheduleDestCode = text(object(schedule.destination)?.code);

      const originCode = scheduleOriginCode || input.origin.port_code || '';
      const destCode = scheduleDestCode || input.destination.port_code || '';

      const supplierInfo = object(rateObj.suppliersInformation);
      const carrierName = text(
        object(supplierInfo?.freight)?.name,
        schedule.vesselName,
        'Naviera / Operador iContainers',
      );

      const transshipment = array(schedule.transhipment)
        .map((t) => text(object(t)?.code, t))
        .filter((code): code is string => Boolean(code));

      // Parse billing items
      const billingItems: IContainersBillingItem[] = [];
      const includedServices: string[] = [];
      const excludedServices: string[] = [];

      for (const bItem of array(rateObj.billingItems)) {
        const bObj = object(bItem);
        if (!bObj) continue;

        const name = text(bObj.name) || 'Cargo iContainers';
        const serviceItem = text(bObj.serviceItem) || 'Others';
        const optional = Boolean(bObj.optional);

        const priceObj = object(bObj.price);
        const itemCurrency = text(priceObj?.currency)?.toUpperCase();
        const itemAmount = numeric(priceObj?.amount, priceObj?.total);
        const taxes = numeric(priceObj?.taxes);
        const itemTotal = numeric(priceObj?.total, itemAmount);

        // 3. Cargos sin precio o moneda válida NO deben convertirse en cero ni en 'USD'
        const hasValidPrice = itemAmount !== undefined && Number.isFinite(itemAmount) && Boolean(itemCurrency);

        const parsedItem: IContainersBillingItem = {
          name,
          service_item: serviceItem,
          optional,
          ...(itemAmount !== undefined ? { amount: itemAmount } : {}),
          ...(taxes !== undefined ? { taxes } : {}),
          ...(itemTotal !== undefined ? { total: itemTotal } : {}),
          ...(itemCurrency ? { currency: itemCurrency } : {}),
          has_valid_price: hasValidPrice,
        };

        billingItems.push(parsedItem);

        if (optional) {
          excludedServices.push(`${name} (Opcional)`);
        } else {
          includedServices.push(name);
        }
      }

      // Check public tags
      for (const tag of array(rateObj.publicTags)) {
        const tagText = text(tag);
        if (tagText && !includedServices.includes(tagText)) {
          if (tagText.includes('Included')) includedServices.push(tagText);
        }
      }

      // Calculate freight amount and total amount without duplicating charges or combining mixed currencies
      const mandatoryItems = billingItems.filter((b) => !b.optional);
      const invalidMandatoryCharges = mandatoryItems.filter(
        (b) => !b.has_valid_price || b.amount === undefined || !b.currency,
      );

      let freightAmount: number | undefined;
      let totalAmount: number | undefined;
      let rateCurrency: string | undefined;
      let isComparable = true;
      let unavailableReason: string | undefined;

      // 3. Los cargos sin precio o moneda válida no deben convertirse en cero ni generar una tarifa comparable.
      if (invalidMandatoryCharges.length > 0) {
        isComparable = false;
        unavailableReason = 'La cotización contiene cargos obligatorios sin precio o moneda válida informada por el proveedor.';
      } else if (mandatoryItems.length > 0) {
        const currencies = [...new Set(mandatoryItems.map((b) => b.currency!))];
        if (currencies.length > 1) {
          isComparable = false;
          unavailableReason = 'La tarifa contiene cargos en varias monedas sin conversión unificada.';
        } else if (currencies.length === 1) {
          rateCurrency = currencies[0];
          const freightItems = mandatoryItems.filter(
            (b) => b.service_item.toLowerCase() === 'freight' || /flete|freight|ocean/i.test(b.name),
          );
          freightAmount = freightItems.length > 0
            ? freightItems.reduce((acc, curr) => acc + (curr.amount ?? 0), 0)
            : numeric(object(rateObj.total)?.amount);

          // Sum mandatory charges excluding taxes (no VAT / customs import taxes added to freight)
          totalAmount = mandatoryItems.reduce((acc, curr) => acc + (curr.amount ?? 0), 0);
        }
      } else if (mandatoryItems.length === 0 && object(rateObj.total)) {
        // Fallback to rateObj.total if no explicit billing items
        const totalObj = object(rateObj.total)!;
        const totalCur = text(totalObj.currency)?.toUpperCase();
        const totalNum = numeric(totalObj.amount, totalObj.total);
        if (totalCur && totalNum !== undefined) {
          rateCurrency = totalCur;
          totalAmount = totalNum;
          freightAmount = totalNum;
        } else {
          isComparable = false;
          unavailableReason = 'No se informaron cargos ni total con precio y moneda válidos para la tarifa.';
        }
      } else {
        isComparable = false;
        unavailableReason = 'No se informaron cargos suficientes para totalizar la tarifa.';
      }

      // Check equipment validity (Eliminar fallbacks inventados)
      const containerItems = array(rateObj.containers).length > 0
        ? array(rateObj.containers)
        : array(quoteData.containers).length > 0
        ? array(quoteData.containers)
        : array(quoteData.items);
      const rawRateType = text(object(containerItems[0])?.type) as 'DV20' | 'DV40' | 'DV40HC' | undefined;
      const resolvedEquipment = input.equipment || (rawRateType && rawRateType in ICONTAINERS_TO_NIUPACK_EQUIPMENT ? ICONTAINERS_TO_NIUPACK_EQUIPMENT[rawRateType] : undefined);

      if (!resolvedEquipment) {
        isComparable = false;
        if (!unavailableReason) {
          unavailableReason = 'Tipo de equipo no identificado o no soportado en la cotización.';
        }
      }

      // Expiration check
      if (expirationDate && new Date(expirationDate).getTime() < Date.now()) {
        isComparable = false;
        if (!unavailableReason) {
          unavailableReason = 'La tarifa se encuentra vencida según la vigencia informada por el proveedor.';
        }
      }

      // 1. scope_complete debe ser false por defecto hasta comprobar destino final paraguayo y alcance del transporte.
      // No inferir cobertura fluvial solamente del código solicitado.
      let scopeComplete = false;
      let paraguayStatus: ParaguayValidationStatus = 'SCOPE_INCOMPLETE';

      const isRequestedDestPy = input.destination && this.isParaguayDestination(input.destination);
      if (isRequestedDestPy) {
        const destUpper = destCode.toUpperCase();
        const terminatesInRegionalPort = (REGIONAL_TRANSSHIPMENT_PORTS as readonly string[]).includes(destUpper);

        // Destino paraguayo comprobado en la cotización devuelta
        const isConfirmedParaguayDest =
          Boolean(destUpper) &&
          (destUpper.startsWith('PY') || this.isParaguayDestination(destUpper)) &&
          !terminatesInRegionalPort;

        // Alcance del transporte: comprobar que la barcaza/feeder fluvial hasta Paraguay está cubierta
        // No inferir cobertura fluvial solo porque input o destCode diga PYASU
        const hasRiverBargeTransport =
          mandatoryItems.some(
            (b) =>
              /fluvial|barge|barcaza|feeder.*asunci[oó]n|feeder.*paraguay|transbordo.*asunci[oó]n|river.*feeder|river.*barge/i.test(b.name) ||
              (/paraguay|asunci[oó]n/i.test(b.name) &&
                (b.service_item === 'Delivery' ||
                  b.service_item === 'PortDestinationCharges' ||
                  b.service_item === 'InlandTransport')),
          ) ||
          includedServices.some((s) => /fluvial|barcaza|barge.*asunci[oó]n|barge.*paraguay/i.test(s));

        if (isConfirmedParaguayDest && hasRiverBargeTransport && !isRatePartial) {
          scopeComplete = true;
          paraguayStatus = 'READY';
        } else {
          scopeComplete = false;
          isComparable = false;
          if (isRatePartial) {
            paraguayStatus = 'PARTIAL_QUOTE';
            if (!unavailableReason) unavailableReason = 'Cotización parcial devuelta por el proveedor.';
          } else {
            paraguayStatus = 'SCOPE_INCOMPLETE';
            if (!unavailableReason) {
              if (terminatesInRegionalPort) {
                unavailableReason = `La tarifa finaliza en puerto marítimo regional (${destUpper}) y no incluye el tramo fluvial hasta Paraguay.`;
              } else if (!isConfirmedParaguayDest) {
                unavailableReason = `El destino de la tarifa (${destUpper || 'no especificado'}) no corresponde a un puerto en Paraguay.`;
              } else {
                unavailableReason = 'Falta comprobar el alcance del transporte fluvial hasta puerto paraguayo (no se infiere del código solicitado).';
              }
            }
          }
        }
      } else {
        // Rutas que no solicitan Paraguay (ej. validate_paraguay: false)
        if (isRatePartial) {
          scopeComplete = false;
          isComparable = false;
          paraguayStatus = 'PARTIAL_QUOTE';
          if (!unavailableReason) unavailableReason = 'Cotización parcial devuelta por el proveedor.';
        } else {
          scopeComplete = Boolean(destCode);
          paraguayStatus = 'READY';
        }
      }

      normalizedList.push({
        id: rateUuid,
        provider: 'iContainers',
        quote_uuid: quoteUuid,
        rate_uuid: rateUuid,
        origin: input.origin.name || originCode,
        destination: input.destination.name || destCode,
        origin_code: originCode,
        destination_code: destCode,
        ...(resolvedEquipment ? { equipment: resolvedEquipment } : {}),
        quantity: input.quantity,
        carrier_name: carrierName,
        ...(freightAmount !== undefined ? { freight_amount: freightAmount } : {}),
        ...(totalAmount !== undefined ? { total_amount: totalAmount } : {}),
        ...(rateCurrency ? { currency: rateCurrency } : {}),
        billing_items: billingItems,
        included_services: includedServices,
        excluded_services: excludedServices,
        ...(valid_until(expirationDate) ? { valid_until: expirationDate } : {}),
        ...(departureDate ? { departure_date: departureDate } : {}),
        ...(transitDays !== undefined ? { transit_days: transitDays } : {}),
        transshipment_ports: transshipment,
        retrieved_at: retrievedAt,
        ...(quoteOnlineUrl ? { quote_url: quoteOnlineUrl } : {}),
        is_partial: isRatePartial,
        scope_complete: scopeComplete,
        is_comparable: isComparable && scopeComplete,
        ...(unavailableReason ? { unavailable_reason: unavailableReason } : {}),
        paraguay_status: paraguayStatus,
      });
    }

    return normalizedList;
  }
}

function valid_until(dateStr?: string): boolean {
  return Boolean(dateStr && !Number.isNaN(new Date(dateStr).getTime()));
}
