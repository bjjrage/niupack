import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IContainersProvider,
  NIUPACK_TO_ICONTAINERS_EQUIPMENT,
  ICONTAINERS_TO_NIUPACK_EQUIPMENT,
  REGIONAL_TRANSSHIPMENT_PORTS,
  type IContainersQuoteInput,
} from '@/lib/logistics/icontainers-provider';
import { FreightosProvider } from '@/lib/logistics/freightos-provider';
import { CargoFiveProvider } from '@/lib/logistics/cargofive-provider';
import { logisticsRepository } from '@/lib/logistics/repository';

const savedToken = process.env.ICONTAINERS_API_TOKEN;
const savedEnv = process.env.ICONTAINERS_API_ENV;
const savedEnabled = process.env.ICONTAINERS_ENABLED;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockProvider(responses: Array<Response | (() => Promise<Response>)>) {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected iContainers request');
    return typeof response === 'function' ? response() : response;
  });
  return { provider: new IContainersProvider(fetcher), fetcher };
}

const mockChinaToParaguayQuote = {
  data: {
    uuid: 'quote-ic-001',
    quotedAt: '2026-10-07T20:00:00Z',
    currency: 'USD',
    lang: 'en_US',
    quoteType: 'Instant quote',
    quoteResultMovement: 'P2P',
    quoteOnlineUrl: 'https://my.icontainers.com/quotes/quote-ic-001',
    completed: true,
    rates: [
      {
        uuid: 'rate-ic-001',
        expirationDate: '2026-11-30',
        direct: false,
        isPartial: false,
        transitTime: 38,
        schedule: {
          departureDate: '2026-11-01T00:00:00Z',
          transitDays: 38,
          origin: { code: 'CNSHA' },
          destination: { code: 'PYASU' },
          vesselName: 'Ocean Phoenix',
          voyageNumber: 'OP-2026',
          transhipment: [{ code: 'BRSSZ' }],
        },
        suppliersInformation: {
          freight: { name: 'Mediterranean Shipping Company (MSC)' },
        },
        total: { currency: 'USD', amount: 3200, taxes: 0, total: 3200 },
        publicTags: ['Cheapest', 'Destination Included'],
        billingItems: [
          {
            name: 'Ocean Freight',
            serviceItem: 'Freight',
            optional: false,
            price: { currency: 'USD', amount: 2600, taxes: 0, total: 2600 },
          },
          {
            name: 'Terminal Handling Origin',
            serviceItem: 'PortOriginCharges',
            optional: false,
            price: { currency: 'USD', amount: 200, taxes: 0, total: 200 },
          },
          {
            name: 'Paraguay River Feeder / Transshipment to Asunción',
            serviceItem: 'PortDestinationCharges',
            optional: false,
            price: { currency: 'USD', amount: 400, taxes: 0, total: 400 },
          },
          {
            name: 'Cargo Insurance',
            serviceItem: 'AdditionalService',
            optional: true,
            price: { currency: 'USD', amount: 95, taxes: 0, total: 95 },
          },
        ],
      },
    ],
  },
};

const defaultInput: IContainersQuoteInput = {
  origin: { port_code: 'CNSHA', name: 'Shanghai Port', country_code: 'CN' },
  destination: { port_code: 'PYASU', name: 'Asunción Port', country_code: 'PY' },
  equipment: '40HC',
  quantity: 1,
  validate_paraguay: true,
};

beforeEach(() => {
  process.env.ICONTAINERS_API_TOKEN = 'test-bearer-token-123';
  process.env.ICONTAINERS_API_ENV = 'development';
  process.env.ICONTAINERS_ENABLED = 'true';
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.ICONTAINERS_API_TOKEN;
  else process.env.ICONTAINERS_API_TOKEN = savedToken;
  if (savedEnv === undefined) delete process.env.ICONTAINERS_API_ENV;
  else process.env.ICONTAINERS_API_ENV = savedEnv;
  if (savedEnabled === undefined) delete process.env.ICONTAINERS_ENABLED;
  else process.env.ICONTAINERS_ENABLED = savedEnabled;
  vi.restoreAllMocks();
});

describe('iContainers Brutus API Provider', () => {
  // TEST 1 — Credenciales ausentes
  it('TEST 1 — credenciales ausentes retorna NOT_CONFIGURED sin realizar llamadas de red', async () => {
    delete process.env.ICONTAINERS_API_TOKEN;
    const { provider, fetcher } = mockProvider([]);
    const res = await provider.createFclQuote(defaultInput);
    expect(res.status).toBe('NOT_CONFIGURED');
    expect(res.rates).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();

    process.env.ICONTAINERS_API_TOKEN = 'token';
    process.env.ICONTAINERS_ENABLED = 'false';
    const res2 = await provider.createFclQuote(defaultInput);
    expect(res2.status).toBe('NOT_CONFIGURED');
    expect(fetcher).not.toHaveBeenCalled();
  });

  // TEST 2 — Búsqueda de puertos FCL
  it('TEST 2 — búsqueda de puertos FCL normaliza seaPorts y cities con UN/LOCODE y país', async () => {
    const placesResponse = {
      data: {
        seaPorts: [
          { portName: 'Asuncion Port', countryIsoCode: 'PY', cityName: 'Asuncion', portIsoCode: 'PYASU' },
          { portName: 'Shanghai Port', countryIsoCode: 'CN', cityName: 'Shanghai', portIsoCode: 'CNSHA' },
        ],
        cities: [
          { cityName: 'Asunción', countryIsoCode: 'PY', defaultPostalCode: '001001' },
        ],
      },
    };
    const { provider, fetcher } = mockProvider([jsonResponse(placesResponse)]);
    const res = await provider.searchPlaces('Asu');
    expect(res.status).toBe('READY');
    expect(res.places).toHaveLength(3);

    const pyPort = res.places.find((p) => p.port_code === 'PYASU');
    expect(pyPort).toBeDefined();
    expect(pyPort?.is_paraguay).toBe(true);
    expect(pyPort?.country_code).toBe('PY');
    expect(pyPort?.display_name).toContain('PYASU');

    const cnPort = res.places.find((p) => p.port_code === 'CNSHA');
    expect(cnPort?.is_paraguay).toBe(false);

    const callUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(callUrl.pathname).toBe('/api/v1/locations/maritime/places');
    expect(callUrl.searchParams.get('term')).toBe('Asu');
    expect(callUrl.searchParams.get('shipmentType')).toBe('FCL');
  });

  // TEST 3 — Código/country del destino
  it('TEST 3 — valida estrictamente que el destino final pertenezca a Paraguay (PY/PYASU)', async () => {
    const { provider, fetcher } = mockProvider([]);
    const invalidInput: IContainersQuoteInput = {
      origin: { port_code: 'CNSHA' },
      destination: { port_code: 'USLGB', country_code: 'US' }, // Long Beach, USA
      equipment: '40HC',
      quantity: 1,
      validate_paraguay: true,
    };
    const res = await provider.createFclQuote(invalidInput);
    expect(res.status).toBe('DESTINATION_UNSUPPORTED');
    expect(res.rates).toEqual([]);
    expect(res.message).toContain('Paraguay');
    expect(fetcher).not.toHaveBeenCalled();
  });

  // TEST 4 — Mapeo 20GP/40GP/40HC
  it('TEST 4 — mapea exactamente 20GP -> DV20, 40GP -> DV40 y 40HC -> DV40HC sin inventar códigos', () => {
    expect(NIUPACK_TO_ICONTAINERS_EQUIPMENT['20GP']).toBe('DV20');
    expect(NIUPACK_TO_ICONTAINERS_EQUIPMENT['40GP']).toBe('DV40');
    expect(NIUPACK_TO_ICONTAINERS_EQUIPMENT['40HC']).toBe('DV40HC');

    expect(ICONTAINERS_TO_NIUPACK_EQUIPMENT['DV20']).toBe('20GP');
    expect(ICONTAINERS_TO_NIUPACK_EQUIPMENT['DV40']).toBe('40GP');
    expect(ICONTAINERS_TO_NIUPACK_EQUIPMENT['DV40HC']).toBe('40HC');
  });

  // TEST 5 — Cotización FCL
  it('TEST 5 — cotización FCL genera payload conforme a la especificación OpenAPI de Brutus', async () => {
    const { provider, fetcher } = mockProvider([jsonResponse(mockChinaToParaguayQuote)]);
    const res = await provider.createFclQuote(defaultInput);

    expect(res.status).toBe('READY');
    expect(res.rates).toHaveLength(1);
    expect(res.quote_uuid).toBe('quote-ic-001');

    const callInit = fetcher.mock.calls[0]?.[1];
    expect(callInit?.method).toBe('POST');
    const sentBody = JSON.parse(String(callInit?.body));
    expect(sentBody).toMatchObject({
      currency: 'USD',
      origin: { type: 'port', portIsoCode: 'CNSHA' },
      destination: { type: 'port', portIsoCode: 'PYASU' },
      containers: [{ quantity: 1, type: 'DV40HC' }],
    });
  });

  // TEST 6 — Recuperación por UUID
  it('TEST 6 — recuperación de cotización por UUID consulta GET /api/v1/quotes/{uuid}', async () => {
    const { provider, fetcher } = mockProvider([jsonResponse(mockChinaToParaguayQuote)]);
    const res = await provider.getQuote('quote-ic-001');

    expect(res.status).toBe('READY');
    expect(res.rates[0]).toMatchObject({
      quote_uuid: 'quote-ic-001',
      rate_uuid: 'rate-ic-001',
      equipment: '40HC',
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/api/v1/quotes/quote-ic-001');
  });

  // TEST 7 — Cotización todavía no completada (asíncrona)
  it('TEST 7 — cotización con completed=false ejecuta polling acotado y no bloquea indefinidamente', async () => {
    const uncompletedPayload = {
      data: {
        uuid: 'quote-async-001',
        completed: false,
        rates: [],
      },
    };
    const completedPoll = {
      data: {
        uuid: 'quote-async-001',
        completed: true,
        rates: mockChinaToParaguayQuote.data.rates,
      },
    };

    // First call returns uncompleted, second call (poll 1) returns completed
    const { provider, fetcher } = mockProvider([
      jsonResponse(uncompletedPayload),
      jsonResponse(completedPoll),
    ]);

    const res = await provider.createFclQuote(defaultInput);
    expect(res.completed).toBe(true);
    expect(res.rates).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  // TEST 8 — Sin tarifas
  it('TEST 8 — respuesta exitosa pero sin tarifas devuelve NO_RESULTS', async () => {
    const emptyRatesQuote = {
      data: {
        uuid: 'quote-empty',
        completed: true,
        rates: [],
      },
    };
    const { provider } = mockProvider([jsonResponse(emptyRatesQuote)]);
    const res = await provider.createFclQuote(defaultInput);

    expect(res.status).toBe('NO_RESULTS');
    expect(res.rates).toEqual([]);
    expect(res.message).toContain('No se encontraron tarifas');
  });

  // TEST 9 — Tarifa parcial
  it('TEST 9 — tarifa marcada con isPartial=true no se considera completa (PARTIAL_QUOTE)', async () => {
    const partialQuote = structuredClone(mockChinaToParaguayQuote);
    partialQuote.data.rates[0].isPartial = true;

    const { provider } = mockProvider([jsonResponse(partialQuote)]);
    const res = await provider.createFclQuote(defaultInput);

    expect(res.status).toBe('PARTIAL_QUOTE');
    expect(res.rates[0].is_partial).toBe(true);
    expect(res.rates[0].scope_complete).toBe(false);
    expect(res.rates[0].is_comparable).toBe(false);
  });

  // TEST 10 — Precio y billingItems
  it('TEST 10 — desglosa flete marítimo y cargos portuarios con sus monedas e importes exactos', async () => {
    const { provider } = mockProvider([jsonResponse(mockChinaToParaguayQuote)]);
    const res = await provider.createFclQuote(defaultInput);
    const rate = res.rates[0];

    expect(rate.freight_amount).toBe(2600);
    expect(rate.total_amount).toBe(3200); // 2600 + 200 + 400 (mandatory charges only)
    expect(rate.currency).toBe('USD');
    expect(rate.billing_items).toHaveLength(4);
    expect(rate.billing_items.map((b) => b.service_item)).toEqual([
      'Freight',
      'PortOriginCharges',
      'PortDestinationCharges',
      'AdditionalService',
    ]);
  });

  // TEST 11 — Cargos opcionales
  it('TEST 11 — los cargos opcionales no se suman obligatoriamente al flete y se listan en exclusiones', async () => {
    const { provider } = mockProvider([jsonResponse(mockChinaToParaguayQuote)]);
    const res = await provider.createFclQuote(defaultInput);
    const rate = res.rates[0];

    const optionalItem = rate.billing_items.find((b) => b.optional);
    expect(optionalItem?.name).toBe('Cargo Insurance');
    expect(rate.excluded_services.some((s) => s.includes('Insurance'))).toBe(true);
    expect(rate.total_amount).toBe(3200); // Does NOT include the 95 USD optional insurance
  });

  // TEST 12 — No doble contabilización
  it('TEST 12 — no duplica cargos ni suma impuestos no aplicables al flete neto', async () => {
    const quoteWithTaxes = structuredClone(mockChinaToParaguayQuote);
    quoteWithTaxes.data.rates[0].billingItems[0].price.taxes = 546;
    quoteWithTaxes.data.rates[0].billingItems[0].price.total = 3146;

    const { provider } = mockProvider([jsonResponse(quoteWithTaxes)]);
    const res = await provider.createFclQuote(defaultInput);

    // Sums net amounts (amount: 2600 + 200 + 400 = 3200), not adding taxes
    expect(res.rates[0].total_amount).toBe(3200);
  });

  // TEST 13 — Tarifas vencidas
  it('TEST 13 — tarifa con fecha de vencimiento expirada se marca como no comparable', async () => {
    const expiredQuote = structuredClone(mockChinaToParaguayQuote);
    expiredQuote.data.rates[0].expirationDate = '2020-01-01';

    const { provider } = mockProvider([jsonResponse(expiredQuote)]);
    const res = await provider.createFclQuote(defaultInput);

    expect(res.rates[0].is_comparable).toBe(false);
    expect(res.rates[0].unavailable_reason).toContain('vencida');
  });

  // TEST 14 — Monedas mixtas
  it('TEST 14 — no inventa un total USD si existen cargos mandatorios en monedas mixtas', async () => {
    const mixedQuote = structuredClone(mockChinaToParaguayQuote);
    mixedQuote.data.rates[0].billingItems[1].price.currency = 'EUR';

    const { provider } = mockProvider([jsonResponse(mixedQuote)]);
    const res = await provider.createFclQuote(defaultInput);

    expect(res.rates[0].is_comparable).toBe(false);
    expect(res.rates[0].total_amount).toBeUndefined();
    expect(res.rates[0].unavailable_reason).toContain('varias monedas');
  });

  // TEST 15 — Alcance hasta Paraguay sin verificar
  it('TEST 15 — una tarifa que termina en puerto regional (Santos/Buenos Aires) sin tramo fluvial es SCOPE_INCOMPLETE', async () => {
    const regionalPortQuote = structuredClone(mockChinaToParaguayQuote);
    regionalPortQuote.data.rates[0].schedule.destination = { code: 'BRSSZ' }; // Terminates at Santos
    // Remove the feeder fluvial item
    regionalPortQuote.data.rates[0].billingItems = regionalPortQuote.data.rates[0].billingItems.slice(0, 2);

    const { provider } = mockProvider([jsonResponse(regionalPortQuote)]);
    const res = await provider.createFclQuote(defaultInput);

    expect(res.status).toBe('SCOPE_INCOMPLETE');
    expect(res.rates[0].scope_complete).toBe(false);
    expect(res.rates[0].is_comparable).toBe(false);
    expect(res.rates[0].paraguay_status).toBe('SCOPE_INCOMPLETE');
    expect(res.rates[0].unavailable_reason).toContain('fluvial');
  });

  // TEST 16 — Respuestas 401/403/422/429/500
  it('TEST 16 — mapea respuestas de error HTTP de manera sanitizada y controlada', async () => {
    const { provider: p401 } = mockProvider([jsonResponse({}, 401)]);
    expect((await p401.createFclQuote(defaultInput)).status).toBe('AUTH_FAILED');

    const { provider: p403 } = mockProvider([jsonResponse({}, 403)]);
    expect((await p403.createFclQuote(defaultInput)).status).toBe('AUTH_FAILED');

    const { provider: p429 } = mockProvider([jsonResponse({}, 429)]);
    expect((await p429.createFclQuote(defaultInput)).status).toBe('RATE_LIMITED');

    const { provider: p422 } = mockProvider([jsonResponse({ message: 'Invalid payload' }, 422)]);
    expect((await p422.createFclQuote(defaultInput)).status).toBe('ERROR');

    const { provider: p500 } = mockProvider([jsonResponse({}, 500)]);
    expect((await p500.createFclQuote(defaultInput)).status).toBe('ERROR');
  });

  // TEST 17 — Timeout
  it('TEST 17 — abortos y fallos de timeout se capturan como TIMEOUT', async () => {
    const timeoutFetcher: typeof fetch = async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };
    const provider = new IContainersProvider(timeoutFetcher);
    const res = await provider.createFclQuote(defaultInput);

    expect(res.status).toBe('TIMEOUT');
    expect(res.rates).toEqual([]);
    expect(res.message).toContain('tiempo de espera');
  });

  // TEST 18 — Credenciales privadas
  it('TEST 18 — el código del cliente no contiene tokens de iContainers ni URLs privadas', () => {
    const clientCode = readFileSync(new URL('../src/components/logistics/LogisticsWorkspace.tsx', import.meta.url), 'utf8');
    expect(clientCode).not.toContain('ICONTAINERS_API_TOKEN');
    expect(clientCode).not.toContain('brutus.icontainers.com');
    expect(clientCode).not.toContain('brutus-dev.icontainers.com');
    expect(clientCode).toContain("'/api/logistics/ocean/icontainers/quote'");
  });

  // TEST 19 — No persistencia automática
  it('TEST 19 — la consulta de tarifas iContainers es read-only y no persiste tarifas en la base de datos', async () => {
    const initialRates = await logisticsRepository.listRates('test-org');
    const { provider } = mockProvider([jsonResponse(mockChinaToParaguayQuote)]);
    await provider.createFclQuote(defaultInput);
    const postRates = await logisticsRepository.listRates('test-org');

    expect(postRates).toEqual(initialRates);
  });

  // TEST 20 — Regresión Freightos
  it('TEST 20 — el estimador Freightos no sufre regresiones y sigue operando', async () => {
    const freightosPayload = {
      response: {
        estimatedFreightRates: {
          numQuotes: '1',
          mode: {
            mode: 'FCL',
            price: {
              min: { moneyAmount: { amount: '2800', currency: 'USD' } },
              max: { moneyAmount: { amount: '3100', currency: 'USD' } },
            },
            transitTimes: { min: '35', max: '42' },
          },
        },
      },
    };
    const fetcher: typeof fetch = async () => jsonResponse(freightosPayload);
    const result = await new FreightosProvider(fetcher).estimate({
      origin: 'CNSHA',
      destination: 'PYASU',
      equipment: '40HC',
      quantity: 1,
    });

    expect(result.status).toBe('OK');
    expect(result.estimates[0].min_amount).toBe(2800);
    expect(result.estimates[0].max_amount).toBe(3100);
  });

  // TEST 21 — Regresión CargoFive
  it('TEST 21 — el adapter CargoFive no sufre regresiones y conserva su cobertura', async () => {
    delete process.env.CARGOFIVE_API_KEY;
    const result = await new CargoFiveProvider().searchPlaces('Barcelona');
    expect(result.status).toBe('NOT_CONFIGURED');
    expect(result.places).toEqual([]);
  });
});
