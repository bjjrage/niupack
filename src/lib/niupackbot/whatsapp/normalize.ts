import type { NormalizedInbound } from '../types';

function stripWhatsapp(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/^whatsapp:/i, '').trim();
}

/** Normaliza form-urlencoded de Twilio a inbound NIUPACK. */
export function normalizeTwilioParams(params: Record<string, string>): NormalizedInbound {
  const sid = params.MessageSid || params.MessageSid === '' ? params.MessageSid : params.SmsMessageSid || `NO-SID-${Date.now()}`;
  const from = stripWhatsapp(params.From || '');
  const to = stripWhatsapp(params.To || '');
  const body = (params.Body || '').slice(0, 4000);
  return {
    externalMessageId: sid || `NO-SID-${Date.now()}`,
    from,
    to,
    body,
    profileName: params.ProfileName ?? null,
    raw: { From: params.From ?? '', To: params.To ?? '' },
  };
}

export function externalConversationIdFor(from: string): string {
  return from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
}
