import { NextResponse } from 'next/server';
import { validateTwilioSignature } from '@/lib/niupackbot/whatsapp/twilio';
import { normalizeTwilioParams } from '@/lib/niupackbot/whatsapp/normalize';
import { resolveOrganizationIdStrict, twiml } from '@/lib/niupackbot/whatsapp/webhook';
import { niupackbotService } from '@/lib/niupackbot/service';

export async function GET() {
  const configured = Boolean(process.env.TWILIO_AUTH_TOKEN);
  return NextResponse.json({ status: 'ok', channel: 'WHATSAPP', provider: 'TWILIO', signature_validation: configured ? 'ENABLED' : 'NOT_CONFIGURED' });
}

export async function POST(request: Request) {
  // HARDENING: en TODOS los envs, sin token no se procesa. Cero writes, cero OpenAI.
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (!token) return twiml(null);

  try {
    const contentType = request.headers.get('content-type') || '';
    let params: Record<string, string> = {};
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      for (const [k, v] of form.entries()) params[k] = String(v);
    } else {
      try {
        params = (await request.json()) as Record<string, string>;
      } catch {
        return twiml(null);
      }
    }

    // Firma ausente o inválida => NO procesar. Cero writes.
    const signature = request.headers.get('x-twilio-signature');
    const url = process.env.TWILIO_WEBHOOK_URL || new URL(request.url).toString().split('?')[0];
    const check = validateTwilioSignature({ url, params, signature });
    if (!check.valid) return twiml(null);

    const inbound = normalizeTwilioParams(params);
    if (!inbound.body || !inbound.from || !inbound.externalMessageId) {
      return twiml(null);
    }

    let organizationId: string;
    try {
      organizationId = await resolveOrganizationIdStrict();
    } catch {
      return twiml(null);
    }

    // ÚNICA vía outbound V1: TwiML <Message>. Sin REST send aquí (ver sender.ts reservado).
    const result = await niupackbotService.handleInbound(organizationId, inbound);
    return twiml(result.replySkipped ? null : result.reply);
  } catch {
    return twiml(null);
  }
}
