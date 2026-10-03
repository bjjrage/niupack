import { describe, it, expect } from 'vitest';
import { validateTwilioSignature } from '@/lib/niupackbot/whatsapp/twilio';
import { normalizeTwilioParams } from '@/lib/niupackbot/whatsapp/normalize';
import { getCommercialPrice } from '@/lib/niupackbot/tools/pricing';
import { estimateLogistics } from '@/lib/niupackbot/tools/logistics';

describe('Twilio security (red team)', () => {
  it('sin secreto => NOT_CONFIGURED, nunca valida como true', () => {
    const prev = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_AUTH_TOKEN;
    const r = validateTwilioSignature({ url: 'https://x.test/api', params: { a: '1' }, signature: 'abc' });
    expect(r.configured).toBe(false);
    expect(r.valid).toBe(false);
    if (prev) process.env.TWILIO_AUTH_TOKEN = prev;
  });

  it('firma inválida se rechaza cuando hay secreto', () => {
    process.env.TWILIO_AUTH_TOKEN = 'test-secret-token';
    const r = validateTwilioSignature({ url: 'https://x.test/api', params: { From: 'a' }, signature: 'invalid' });
    expect(r.configured).toBe(true);
    expect(r.valid).toBe(false);
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  it('normaliza whatsapp:+ y limita PII en logs', () => {
    const n = normalizeTwilioParams({ MessageSid: 'SM1', From: 'whatsapp:+5511999', To: 'whatsapp:+595900', Body: 'Hola' });
    expect(n.from).toBe('+5511999');
    expect(n.to).toBe('+595900');
    expect(n.raw.From).toBe('whatsapp:+5511999');
    // No incluir Body en raw (reducir PII en logs).
    expect('Body' in n.raw).toBe(false);
  });
});

describe('Tools nunca inventan datos', () => {
  it('pricing sin fuente => NOT_CONFIGURED', async () => {
    const r = await getCommercialPrice({ sku: 'CUP-12OZ', volume: 500000 });
    expect(r.status).toBe('NOT_CONFIGURED');
  });

  it('logistics sin ciudad => UNAVAILABLE, sin fuente => NOT_CONFIGURED', async () => {
    const a = await estimateLogistics({ destination_city: null, volume: 100 });
    expect(a.status).toBe('UNAVAILABLE');
    const b = await estimateLogistics({ destination_city: 'Curitiba', volume: 500000 });
    expect(b.status).toBe('NOT_CONFIGURED');
  });
});
