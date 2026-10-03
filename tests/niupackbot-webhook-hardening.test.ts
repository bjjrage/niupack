import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { resetCrmMemory, crmRepository } from '@/lib/crm/repository';
import { resetBotMemory, niupackbotRepository } from '@/lib/niupackbot/repository';
import { POST } from '@/app/api/niupackbot/whatsapp/route';
import { TEST_ORG } from '@/lib/niupackbot/whatsapp/webhook';

function sign(url: string, params: Record<string, string>, token: string): string {
  const sorted = Object.keys(params).sort();
  let data = url;
  for (const k of sorted) data += k + (params[k] ?? '');
  return createHmac('sha1', token).update(data, 'utf8').digest('base64');
}

const URL = 'https://test.local/api/niupackbot/whatsapp';

function req(params: Record<string, string>, signature: string | null, url = URL): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature) headers['x-twilio-signature'] = signature;
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(params) });
}

async function leadsCount(): Promise<number> {
  return (await crmRepository.listLeads(TEST_ORG)).length;
}

async function messagesCount(): Promise<number> {
  const convs = await crmRepository.listConversations(TEST_ORG);
  let n = 0;
  for (const c of convs) n += (await niupackbotRepository.listMessages(c.id, TEST_ORG, 100)).length;
  return n;
}

describe('Webhook hardening (route-level)', () => {
  const OLD_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const OLD_ORG = process.env.NIUPACKBOT_ORGANIZATION_ID;
  const OLD_OPENAI = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    resetCrmMemory();
    resetBotMemory();
    delete process.env.OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (OLD_TOKEN === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = OLD_TOKEN;
    if (OLD_ORG === undefined) delete process.env.NIUPACKBOT_ORGANIZATION_ID;
    else process.env.NIUPACKBOT_ORGANIZATION_ID = OLD_ORG;
    if (OLD_OPENAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = OLD_OPENAI;
    vi.restoreAllMocks();
  });

  it('sin TWILIO_AUTH_TOKEN => TwiML vacío y cero writes', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const params = { MessageSid: 'SM_NOSEC_1', From: 'whatsapp:+551100000001', To: 'whatsapp:+595900', Body: 'Hola' };
    const res = await POST(req(params, null));
    const xml = await res.text();
    expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(await leadsCount()).toBe(0);
    expect(await messagesCount()).toBe(0);
  });

  it('firma ausente con token => no procesa', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'tok-test-123';
    const params = { MessageSid: 'SM_NOSIG_1', From: 'whatsapp:+551100000002', To: 'whatsapp:+595900', Body: 'Hola' };
    const res = await POST(req(params, null));
    expect(await res.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(await leadsCount()).toBe(0);
  });

  it('firma inválida => no procesa', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'tok-test-123';
    const params = { MessageSid: 'SM_BADSIG_1', From: 'whatsapp:+551100000003', To: 'whatsapp:+595900', Body: 'Hola' };
    const res = await POST(req(params, 'invalid-signature'));
    expect(await res.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(await leadsCount()).toBe(0);
    expect(await messagesCount()).toBe(0);
  });

  it('firma válida => UN solo reply vía TwiML, sin REST doble', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'tok-test-123';
    process.env.TWILIO_WEBHOOK_URL = URL;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const params = {
      MessageSid: 'SM_OK_1',
      From: 'whatsapp:+551100000004',
      To: 'whatsapp:+595900',
      Body: 'Preciso copos de papel 12 oz personalizados. 500 mil por mês. Entrega em Curitiba.',
    };
    const res = await POST(req(params, sign(URL, params, 'tok-test-123')));
    const xml = await res.text();
    expect(xml).toContain('<Message>');
    expect(xml).not.toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(await leadsCount()).toBe(1);
    // SINGLE OUTBOUND: ningún POST REST a api.twilio.com en el flujo inbound.
    const twilioRest = fetchSpy.mock.calls.filter(([u]) => String(u).includes('api.twilio.com'));
    expect(twilioRest).toHaveLength(0);
    delete process.env.TWILIO_WEBHOOK_URL;
  });

  it('Twilio retry (mismo Sid) => no duplica', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'tok-test-123';
    process.env.TWILIO_WEBHOOK_URL = URL;
    const params = { MessageSid: 'SM_RETRY_1', From: 'whatsapp:+551100000005', To: 'whatsapp:+595900', Body: 'Hola, necesito vasos 12 oz' };
    const sig = sign(URL, params, 'tok-test-123');
    await POST(req(params, sig));
    const second = await POST(req(params, sig));
    expect(await second.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(await leadsCount()).toBe(1);
    delete process.env.TWILIO_WEBHOOK_URL;
  });

  it('HUMAN en control => segundo inbound persiste pero sin auto-reply', async () => {
    process.env.TWILIO_AUTH_TOKEN = 'tok-test-123';
    process.env.TWILIO_WEBHOOK_URL = URL;
    const p1 = { MessageSid: 'SM_HR_1', From: 'whatsapp:+595981000010', To: 'whatsapp:+595900', Body: 'quiero hablar con un humano' };
    const r1 = await POST(req(p1, sign(URL, p1, 'tok-test-123')));
    expect(await r1.text()).toContain('<Message>');
    const p2 = { MessageSid: 'SM_HR_2', From: 'whatsapp:+595981000010', To: 'whatsapp:+595900', Body: 'siguen ahí?' };
    const r2 = await POST(req(p2, sign(URL, p2, 'tok-test-123')));
    expect(await r2.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    delete process.env.TWILIO_WEBHOOK_URL;
  });
});
