import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AutoLeadBridgeError,
  getAutoLeadLeads,
  getAutoLeadMetrics,
} from '@/lib/crm/autolead-bridge';

const originalBaseUrl = process.env.AUTOLEADBOT_API_BASE_URL;
const originalToken = process.env.AUTOLEADBOT_API_TOKEN;

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.AUTOLEADBOT_API_BASE_URL;
  else process.env.AUTOLEADBOT_API_BASE_URL = originalBaseUrl;

  if (originalToken === undefined) delete process.env.AUTOLEADBOT_API_TOKEN;
  else process.env.AUTOLEADBOT_API_TOKEN = originalToken;

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AutoLeadBot CRM bridge', () => {
  it('fails closed when the service-to-service bridge is not configured', async () => {
    delete process.env.AUTOLEADBOT_API_BASE_URL;
    delete process.env.AUTOLEADBOT_API_TOKEN;

    await expect(getAutoLeadMetrics()).rejects.toMatchObject({
      code: 'BOT_BRIDGE_NOT_CONFIGURED',
    } satisfies Partial<AutoLeadBridgeError>);
  });

  it('sends the bearer token and preserves the existing AutoLead leads contract', async () => {
    process.env.AUTOLEADBOT_API_BASE_URL = 'https://autolead.example.test';
    process.env.AUTOLEADBOT_API_TOKEN = 'bridge-secret';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          items: [
            {
              id: 'conv-1',
              name: 'Cliente Test',
              phone: '+595981000000',
              created_at: null,
              updated_at: '2026-10-03T12:00:00.000Z',
              source_channel: 'WhatsApp / Twilio',
              source_campaign: null,
              source_vehicle: null,
              current_vehicle: 'Producto heredado',
              current_intent: 'Cotización',
              status: 'En curso',
              last_message_at: '2026-10-03T12:00:00.000Z',
            },
          ],
          pagination: { limit: 25, offset: 0, count: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getAutoLeadLeads({ limit: 25 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('conv-1');
    expect(result.pagination).toEqual({ limit: 25, offset: 0, count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://autolead.example.test/api/bot/leads?limit=25');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer bridge-secret',
      Accept: 'application/json',
    });
  });

  it('maps unauthorized bridge responses to a controlled error', async () => {
    process.env.AUTOLEADBOT_API_BASE_URL = 'https://autolead.example.test';
    process.env.AUTOLEADBOT_API_TOKEN = 'bad-secret';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

    await expect(getAutoLeadMetrics()).rejects.toMatchObject({
      code: 'BOT_BRIDGE_UNAUTHORIZED',
    } satisfies Partial<AutoLeadBridgeError>);
  });
});
