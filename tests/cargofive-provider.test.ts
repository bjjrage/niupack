import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportCostAdjustmentEngine } from '@/lib/engines/export-cost-adjustment-engine';
import { CargoFiveProvider, NIUPACK_TO_CARGOFIVE_ISO } from '@/lib/logistics/cargofive-provider';
import { logisticsRepository } from '@/lib/logistics/repository';
import { ManualRateProvider } from '@/lib/logistics/providers';
import type { FreightSearchInput } from '@/lib/logistics/domain';

const savedKey = process.env.CARGOFIVE_API_KEY;
const savedBase = process.env.CARGOFIVE_BASE_URL;
const orgId = '00000000-0000-0000-0000-00000000cf01';

const searchInput = (equipment: FreightSearchInput['equipment'] = '20GP'): FreightSearchInput => ({
  origin: { country: 'Spain', display_name: 'Barcelona, Spain', provider_place_id: 204, place_type_id: 1, unlocode: 'ESBCN' },
  destination: { country: 'Brazil', display_name: 'Santos, Brazil', provider_place_id: 120, place_type_id: 1, unlocode: 'BRSSZ' },
  shipment_date: '2026-11-15', load_type: 'FCL', equipment, quantity: 2, weight_kg: 15_000, volume_m3: 0,
});

const containerCatalog = {
  data: [{ id: 1, name: 'DRY', code: 'DV', equipments: [
    { id: 1, name: '20 DV', label: '20DV', iso: '20DV' },
    { id: 2, name: '40 DV', label: '40DV', iso: '40DV' },
    { id: 3, name: '40 HC', label: '40HC', iso: '40HC' },
  ] }],
};

const cargoFiveRates = {
  offers: { offer_uuid: 'test-offer', type: 'FCL' },
  rates: [{
    product_offer: {
      rate_uuid: 'rate-cf-001', rate_status: 'Valid', main_carrier_name: 'Maersk', main_carrier_scac: 'MAEU',
      main_source_type: 'Api', service_type: 'Direct', origin_port_id: 204, origin_port_display_name: 'Barcelona',
      origin_port_unlocode: 'ESBCN', destination_port_id: 120, destination_port_display_name: 'Santos',
      destination_port_unlocode: 'BRSSZ', valid_from: '2026-10-01', valid_to: '2026-12-01',
    },
    product_price: {
      totals: { currency: 'USD' },
      freight: { charges: [{ rate_type_code: 'freight', charge_name: 'Ocean Freight', rate_basis: 'Per Container', unit_price_currency: 'USD', tariffs: [{ quantity: 2, container_iso: '20DV', unit_price: 100, total_price_per_qty: 200 }] }] },
      origin: { charges: [{ rate_type_code: 'origin', charge_name: 'Origin Handling', rate_basis: 'Per Shipment', unit_price_currency: 'USD', tariffs: [{ quantity: 1, container_iso: '20DV', unit_price: 30, total_price_per_qty: 30 }] }] },
    },
    schedule: { transit_time: '22 days', via_ports: [{ name: 'Panama' }] },
  }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setupEnvironment() {
  process.env.CARGOFIVE_API_KEY = 'test-server-secret';
  process.env.CARGOFIVE_BASE_URL = 'https://api.cargofive.example/api/v1/public';
}

function mockedProvider(responses: Array<Response | (() => Promise<Response>)>) {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected CargoFive request');
    return typeof response === 'function' ? response() : response;
  });
  return { provider: new CargoFiveProvider(fetcher), fetcher };
}

beforeEach(() => setupEnvironment());
afterEach(() => {
  if (savedKey === undefined) delete process.env.CARGOFIVE_API_KEY;
  else process.env.CARGOFIVE_API_KEY = savedKey;
  if (savedBase === undefined) delete process.env.CARGOFIVE_BASE_URL;
  else process.env.CARGOFIVE_BASE_URL = savedBase;
  vi.restoreAllMocks();
});

describe('CargoFive maritime provider', () => {
  it('TEST 1 — no API key returns NOT_CONFIGURED and zero rates without a request', async () => {
    delete process.env.CARGOFIVE_API_KEY;
    const { provider, fetcher } = mockedProvider([]);
    const result = await provider.searchRates(searchInput(), orgId);
    expect(result.status).toBe('NOT_CONFIGURED');
    expect(result.rates).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('TEST 2 — no base URL returns NOT_CONFIGURED', async () => {
    delete process.env.CARGOFIVE_BASE_URL;
    const { provider } = mockedProvider([]);
    expect((await provider.searchRates(searchInput(), orgId)).status).toBe('NOT_CONFIGURED');
  });

  it('TEST 3 — place search normalizes id, place type, display label, country and UN/LOCODE', async () => {
    const { provider, fetcher } = mockedProvider([jsonResponse({ data: [{ id: 204, place_type_id: 1, name: 'Barcelona', display_name: 'Barcelona, Spain', country_name: 'Spain', code: 'ESBCN' }] })]);
    const result = await provider.searchPlaces('Barce');
    expect(result.status).toBe('OK');
    expect(result.places[0]).toMatchObject({ id: 204, place_type_id: 1, display_name: 'Barcelona, Spain', country_name: 'Spain', unlocode: 'ESBCN' });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/places?search=Barce');
  });

  it('TEST 4 — real rates normalize into LogisticsRate without changing their native currency', async () => {
    const { provider } = mockedProvider([jsonResponse(containerCatalog), jsonResponse(cargoFiveRates)]);
    const result = await provider.searchRates(searchInput(), orgId);
    expect(result.status).toBe('OK');
    expect(result.rates[0]).toMatchObject({
      organization_id: orgId, mode: 'OCEAN', source: 'OTHER_API', status: 'INDICATIVE',
      amount: 230, currency: 'USD', equipment: '20GP', transit_days: 22,
      carrier_name: 'Maersk', carrier_code: 'MAEU', provider_rate_id: 'rate-cf-001',
    });
    expect(result.rates[0].components).toMatchObject({ main_freight: 200, origin_charges: 30 });
    expect(result.rates[0].source_reference).toBe('CARGOFIVE:rate-cf-001');
    expect(result.rates[0].origin).toMatchObject({ provider_place_id: 204, place_type_id: 1, unlocode: 'ESBCN' });
  });

  it('TEST 5 — all NIUPACK FCL equipment codes map to documented ISO codes and place type IDs are sent', async () => {
    for (const [niuEquipment, iso] of Object.entries(NIUPACK_TO_CARGOFIVE_ISO)) {
      const { provider, fetcher } = mockedProvider([jsonResponse(containerCatalog), jsonResponse({ rates: [] })]);
      const input = { ...searchInput(niuEquipment as FreightSearchInput['equipment']), quantity: 3 };
      await provider.searchRates(input, orgId);
      const requestedUrl = new URL(String(fetcher.mock.calls[1]?.[0]));
      expect(requestedUrl.searchParams.get('cargo_details')).toBe(`3x${iso}x15000`);
      expect(requestedUrl.searchParams.get('origins')).toBe('204');
      expect(requestedUrl.searchParams.get('origins_place_type_id')).toBe('1');
      expect(requestedUrl.searchParams.get('destinations_place_type_id')).toBe('1');
    }
    expect(NIUPACK_TO_CARGOFIVE_ISO).toEqual({ '20GP': '20DV', '40GP': '40DV', '40HC': '40HC' });
  });

  it('TEST 6 — an empty provider response is successful and produces no rates', async () => {
    const { provider } = mockedProvider([jsonResponse(containerCatalog), jsonResponse({ rates: [] })]);
    const result = await provider.searchRates(searchInput(), orgId);
    expect(result.status).toBe('OK');
    expect(result.rates).toEqual([]);
    expect(result.message).toContain('No se encontraron tarifas');
  });

  it('TEST 7 — provider 500 is converted to a sanitized controlled error', async () => {
    const { provider } = mockedProvider([jsonResponse(containerCatalog), jsonResponse({ message: 'sensitive server payload' }, 500)]);
    const result = await provider.searchRates(searchInput(), orgId);
    expect(result.status).toBe('ERROR');
    expect(result.rates).toEqual([]);
    expect(result.message).not.toContain('sensitive');
  });

  it('TEST 8 — provider 429 is surfaced as RATE_LIMITED', async () => {
    const { provider } = mockedProvider([jsonResponse(containerCatalog), jsonResponse({}, 429)]);
    expect((await provider.searchRates(searchInput(), orgId)).status).toBe('RATE_LIMITED');
  });

  it('TEST 9 — timeouts are bounded and reported as TIMEOUT', async () => {
    const { provider } = mockedProvider([jsonResponse(containerCatalog), async () => { throw new DOMException('timeout', 'TimeoutError'); }]);
    expect((await provider.searchRates(searchInput(), orgId)).status).toBe('TIMEOUT');
  });

  it('TEST 10 — CargoFive API credentials and provider host are absent from browser code', () => {
    const clientCode = readFileSync(new URL('../src/components/logistics/LogisticsWorkspace.tsx', import.meta.url), 'utf8');
    expect(clientCode).not.toContain('CARGOFIVE_API_KEY');
    expect(clientCode).not.toContain('x-api-key');
    expect(clientCode).not.toContain('coreapp-qa.cargofive.com');
    expect(clientCode).toContain("'/api/logistics/ocean/search'");
  });

  it('TEST 11 — manual rates still use the ManualRateProvider and preserve entered values', () => {
    const rate = ManualRateProvider.create({
      organization_id: orgId, origin: { country: 'PY', city: 'Asunción' }, destination: { country: 'BR', city: 'Santos' },
      mode: 'OCEAN', amount: 900, currency: 'USD', equipment: '40HC', status: 'CONFIRMED', components: {},
    });
    expect(rate).toMatchObject({ source: 'MANUAL_RATE', amount: 900, currency: 'USD', equipment: '40HC' });
  });

  it('TEST 12 — a selected CargoFive rate remains readable through existing logistics history', async () => {
    const { provider } = mockedProvider([jsonResponse(containerCatalog), jsonResponse(cargoFiveRates)]);
    const option = (await provider.searchRates(searchInput(), orgId)).rates[0];
    const verified = provider.verifySelectionToken(option.selection_token!, orgId);
    expect(verified.rate).toBeDefined();
    const stored = await logisticsRepository.createRate({ ...verified.rate!, status: 'SELECTED' });
    const history = await logisticsRepository.listRates(orgId);
    expect(history.find((rate) => rate.id === stored.id)).toMatchObject({ source: 'OTHER_API', source_reference: 'CARGOFIVE:rate-cf-001', status: 'SELECTED' });
    expect(history.find((rate) => rate.id === stored.id)?.components.provider_metadata?.carrier_name).toBe('Maersk');
  });

  it('TEST 13 — terrestrial RFQs remain road quotes and are not routed through CargoFive', async () => {
    const rfq = await logisticsRepository.createRfq({
      organization_id: orgId, code: `ROAD-${crypto.randomUUID()}`, status: 'OPEN', origin_country: 'PY', origin_city: 'Asunción',
      destination_country: 'BR', destination_city: 'São Paulo', pickup_date: '2026-11-20', cargo_description: 'Cartons',
      weight_kg: 1000, volume_m3: 5, pallet_count: 2, equipment_type: 'TRUCK', transport_mode: 'ROAD', commercial_term: 'CPT',
      quote_deadline: '2026-11-10T00:00:00.000Z', currency_preferences: ['USD'],
    });
    expect(await logisticsRepository.getRfq(rfq.id, orgId)).toMatchObject({ transport_mode: 'ROAD', status: 'OPEN' });
  });

  it('TEST 14 — a selected LogisticsRate feeds the existing export cost engine unchanged', async () => {
    const { provider } = mockedProvider([jsonResponse(containerCatalog), jsonResponse(cargoFiveRates)]);
    const option = (await provider.searchRates(searchInput(), orgId)).rates[0];
    const verified = provider.verifySelectionToken(option.selection_token!, orgId);
    const selected = await logisticsRepository.createRate({ ...verified.rate!, status: 'SELECTED' });
    const result = ExportCostAdjustmentEngine.calculate({
      sku: 'CUP-12OZ', quantity: 100, units_per_box: 10, total_m3: 2, total_weight_kg: 1500,
      manufacturing_components: [], export_specific_costs: 0, logistics_rate: selected,
      fx_source: 'BNF', fx_rate: 7000, fx_timestamp: new Date().toISOString(),
    });
    expect(result.logistics_cost).toBe(230);
    expect(result.freight_per_unit).toBe(2.3);
  });

  it('does not enable selection or fabricate a combined total for charges in different currencies', async () => {
    const mixed = structuredClone(cargoFiveRates);
    mixed.rates[0].product_price.origin.charges[0].unit_price_currency = 'EUR';
    const { provider } = mockedProvider([jsonResponse(containerCatalog), jsonResponse(mixed)]);
    const rate = (await provider.searchRates(searchInput(), orgId)).rates[0];
    expect(rate.selectable).toBe(false);
    expect(rate.selection_token).toBeUndefined();
    expect(rate.amount).toBeUndefined();
    expect(rate.currency).toBeUndefined();
    expect(rate.unavailable_reason).toContain('varias monedas');
    expect(new Set(rate.charges.map((charge) => charge.currency))).toEqual(new Set(['USD', 'EUR']));
  });

  it('shows a single foreign-currency total natively but does not select it into the USD cost engine', async () => {
    const foreign = structuredClone(cargoFiveRates);
    foreign.rates[0].product_price.freight.charges[0].unit_price_currency = 'EUR';
    foreign.rates[0].product_price.origin.charges[0].unit_price_currency = 'EUR';
    const { provider } = mockedProvider([jsonResponse(containerCatalog), jsonResponse(foreign)]);
    const rate = (await provider.searchRates(searchInput(), orgId)).rates[0];
    expect(rate.amount).toBe(230);
    expect(rate.currency).toBe('EUR');
    expect(rate.selectable).toBe(false);
    expect(rate.selection_token).toBeUndefined();
    expect(rate.unavailable_reason).toContain('requerido por el motor de costos');
  });

  it('rejects modified and cross-organization selection tokens', async () => {
    const { provider } = mockedProvider([jsonResponse(containerCatalog), jsonResponse(cargoFiveRates)]);
    const option = (await provider.searchRates(searchInput(), orgId)).rates[0];
    expect(provider.verifySelectionToken(`${option.selection_token}x`, orgId).error).toBe('INVALID_SELECTION');
    expect(provider.verifySelectionToken(option.selection_token!, '00000000-0000-0000-0000-00000000cf02').error).toBe('INVALID_SELECTION');
  });
});
