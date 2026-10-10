import { describe, expect, it } from 'vitest';
import { FreightosProvider } from '@/lib/logistics/freightos-provider';

function estimatePayload(maxCurrency = 'USD') {
  return {
    response: {
      estimatedFreightRates: {
        numQuotes: '1',
        mode: {
          mode: 'FCL',
          price: {
            min: { moneyAmount: { amount: '3262', currency: 'USD' } },
            max: { moneyAmount: { amount: '3554', currency: maxCurrency } },
          },
          transitTimes: { min: '17', max: '21', unit: 'days' },
        },
      },
    },
  };
}

function mockProvider(payload: unknown = estimatePayload(), status = 200) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: new URL(input instanceof Request ? input.url : input.toString()), init });
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { provider: new FreightosProvider(fetcher), calls };
}

describe('Freightos public FCL estimator', () => {
  it('uses the public endpoint without a key and returns an indicative range', async () => {
    const { provider, calls } = mockProvider();
    const result = await provider.estimate({ origin: 'CNSHA', destination: 'USLGB', equipment: '40HC', quantity: 2, weight_kg: 15000 });

    expect(result.status).toBe('OK');
    expect(result.estimates[0]).toMatchObject({ min_amount: 3262, max_amount: 3554, currency: 'USD', min_transit_days: 17, max_transit_days: 21 });
    expect(result.estimates[0].marketplace_url).toBe('https://ship.freightos.com');
    expect(result.estimates[0]).not.toHaveProperty('selection_token');
    expect(calls).toHaveLength(1);
    expect(calls[0].url.origin + calls[0].url.pathname).toBe('https://ship.freightos.com/api/shippingCalculator');
    expect(calls[0].url.searchParams.get('format')).toBe('json');
    expect(calls[0].url.searchParams.has('estimate')).toBe(false);
    expect(calls[0].url.searchParams.get('mode')).toBe('FCL');
    expect(calls[0].url.searchParams.get('loadtype')).toBe('container40HC');
    expect(calls[0].url.searchParams.get('origin')).toBe('CNSHA');
    expect(calls[0].url.searchParams.get('destination')).toBe('USLGB');
    expect(calls[0].url.searchParams.get('quantity')).toBe('2');
    expect(calls[0].url.searchParams.get('weight')).toBe('15000');
    expect(calls[0].url.searchParams.has('apiKey')).toBe(false);
  });

  it.each([
    ['20GP', 'container20'],
    ['40GP', 'container40'],
    ['40HC', 'container40HC'],
  ] as const)('maps %s to its documented Freightos load type', async (equipment, loadType) => {
    const { provider, calls } = mockProvider();
    await provider.estimate({ origin: 'Shanghai, China', destination: 'Long Beach, CA', equipment, quantity: 1 });

    expect(calls[0].url.searchParams.get('loadtype')).toBe(loadType);
    expect(calls[0].url.searchParams.has('weight')).toBe(false);
  });

  it('does not fabricate a price when the route has no coverage', async () => {
    const { provider } = mockProvider({ response: { estimatedFreightRates: { numQuotes: '0' } } });
    const result = await provider.estimate({ origin: 'XXXAA', destination: 'YYYBB', equipment: '20GP', quantity: 1 });

    expect(result.status).toBe('NO_RESULTS');
    expect(result.estimates).toEqual([]);
  });

  it('rejects a malformed or inconsistent range rather than inventing a total', async () => {
    const { provider } = mockProvider(estimatePayload('EUR'));
    const result = await provider.estimate({ origin: 'CNSHA', destination: 'USLGB', equipment: '20GP', quantity: 1 });

    expect(result.status).toBe('NO_RESULTS');
    expect(result.estimates).toEqual([]);
  });

  it('reports the upstream public rate limit', async () => {
    const { provider } = mockProvider({}, 429);
    const result = await provider.estimate({ origin: 'CNSHA', destination: 'USLGB', equipment: '20GP', quantity: 1 });

    expect(result.status).toBe('RATE_LIMITED');
    expect(result.estimates).toEqual([]);
  });

  it('reports timeouts without returning stale or sample prices', async () => {
    const fetcher: typeof fetch = async () => { throw new DOMException('Timed out', 'TimeoutError'); };
    const result = await new FreightosProvider(fetcher).estimate({ origin: 'CNSHA', destination: 'USLGB', equipment: '20GP', quantity: 1 });

    expect(result.status).toBe('TIMEOUT');
    expect(result.estimates).toEqual([]);
  });
});
