import { createHmac, timingSafeEqual } from 'node:crypto';

/** Valida firma Twilio X-Twilio-Signature (HMAC-SHA1 sobre URL + params ordenados). */
export function validateTwilioSignature(input: { url: string; params: Record<string, string>; signature: string | null }): { configured: boolean; valid: boolean } {
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (!token) return { configured: false, valid: false };
  if (!input.signature) return { configured: true, valid: false };
  const sorted = Object.keys(input.params).sort();
  let data = input.url;
  for (const k of sorted) data += k + (input.params[k] ?? '');
  const expected = createHmac('sha1', token).update(data, 'utf8').digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length) return { configured: true, valid: false };
  return { configured: true, valid: timingSafeEqual(a, b) };
}

export function twilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_ACCOUNT_SID);
}
