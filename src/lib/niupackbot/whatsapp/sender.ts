// Outbound WhatsApp por REST Twilio. SEPARADO del flujo inbound:
//   Inbound response  → webhook → TwiML (/api/niupackbot/whatsapp)
//   Campaign / manual → este módulo → Twilio REST
// Nunca usar este módulo dentro de handleInbound (duplicaría la respuesta al cliente).
// SOLO SERVER: lee TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN.

export interface TwilioOutboundConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

export type SendResult =
  | { ok: true; sid: string; status: string }
  | { ok: false; code: string; httpStatus: number | null; transient: boolean; message: string };

export function twilioOutboundConfig(): TwilioOutboundConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const from = process.env.TWILIO_WHATSAPP_FROM || '';
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from: from.startsWith('whatsapp:') ? from : `whatsapp:${from}` };
}

/** URL pública donde Twilio notifica sent/delivered/read/failed de cada mensaje saliente. */
export function statusCallbackUrl(): string | null {
  const explicit = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (explicit) return explicit;
  const webhook = process.env.TWILIO_WEBHOOK_URL;
  if (webhook) return `${webhook.replace(/\/+$/, '')}/status`;
  return null;
}

const whatsappAddress = (e164: string) => (e164.startsWith('whatsapp:') ? e164 : `whatsapp:${e164}`);

async function postMessage(config: TwilioOutboundConfig, params: URLSearchParams): Promise<SendResult> {
  const callback = statusCallbackUrl();
  if (callback) params.set('StatusCallback', callback);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
    if (res.ok && data.sid) return { ok: true, sid: data.sid, status: data.status ?? 'queued' };
    // 429 y 5xx son reintentables; el resto (número inválido, template no aprobado, etc.) no.
    const transient = res.status === 429 || res.status >= 500;
    return {
      ok: false,
      code: data.code ? String(data.code) : `HTTP_${res.status}`,
      httpStatus: res.status,
      transient,
      // El message de Twilio puede traer el número: no se propaga a logs/UI.
      message: transient ? 'Twilio no disponible' : 'Twilio rechazó el mensaje',
    };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', httpStatus: null, transient: true, message: 'Sin conexión con Twilio' };
  }
}

/** Primer contacto fuera de la ventana de 24h: SIEMPRE template aprobado (ContentSid). */
export async function sendWhatsappTemplate(input: {
  to: string;
  contentSid: string;
  variables?: Record<string, string>;
}): Promise<SendResult> {
  const config = twilioOutboundConfig();
  if (!config) return { ok: false, code: 'TWILIO_NOT_CONFIGURED', httpStatus: null, transient: false, message: 'Twilio no configurado' };
  const params = new URLSearchParams({ From: config.from, To: whatsappAddress(input.to), ContentSid: input.contentSid });
  if (input.variables && Object.keys(input.variables).length > 0) params.set('ContentVariables', JSON.stringify(input.variables));
  return postMessage(config, params);
}

/** Texto libre: válido solo dentro de la ventana de 24h tras un inbound del cliente (respuesta manual). */
export async function sendWhatsappText(input: { to: string; body: string }): Promise<SendResult> {
  const config = twilioOutboundConfig();
  if (!config) return { ok: false, code: 'TWILIO_NOT_CONFIGURED', httpStatus: null, transient: false, message: 'Twilio no configurado' };
  return postMessage(config, new URLSearchParams({ From: config.from, To: whatsappAddress(input.to), Body: input.body }));
}
