import { NextResponse } from 'next/server';
import { applyStatusCallback } from '@/lib/niupackbot/outreach/status-callback';
import { statusCallbackUrl } from '@/lib/niupackbot/whatsapp/sender';
import { validateTwilioSignature } from '@/lib/niupackbot/whatsapp/twilio';
import { resolveOrganizationIdStrict } from '@/lib/niupackbot/whatsapp/webhook';

/**
 * Status callback de Twilio (queued/sent/delivered/read/failed/undelivered).
 * Endpoint SEPARADO del inbound: no crea conversaciones ni dispara al bot.
 * Firma inválida => 403 y cero writes. Twilio reintenta: el procesamiento es idempotente.
 */
export async function POST(request: Request) {
  if (!process.env.TWILIO_AUTH_TOKEN) return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  try {
    const params: Record<string, string> = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      for (const [k, v] of (await request.formData()).entries()) params[k] = String(v);
    } else {
      Object.assign(params, (await request.json()) as Record<string, string>);
    }

    const url = statusCallbackUrl() ?? new URL(request.url).toString().split('?')[0];
    const check = validateTwilioSignature({ url, params, signature: request.headers.get('x-twilio-signature') });
    if (!check.valid) return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 403 });

    const organizationId = await resolveOrganizationIdStrict();
    const result = await applyStatusCallback(organizationId, params);
    return NextResponse.json({ ok: true, matched: result.matched, changed: result.changed });
  } catch {
    // 5xx hace que Twilio reintente; el callback es idempotente.
    return NextResponse.json({ error: 'CALLBACK_FAILED' }, { status: 500 });
  }
}
