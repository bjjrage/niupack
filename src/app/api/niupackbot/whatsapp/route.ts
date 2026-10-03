import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/db/supabase';
import { validateTwilioSignature } from '@/lib/niupackbot/whatsapp/twilio';
import { normalizeTwilioParams } from '@/lib/niupackbot/whatsapp/normalize';
import { niupackbotService } from '@/lib/niupackbot/service';

const TEST_ORG = '00000000-0000-0000-0000-000000000001';

async function resolveOrganizationId(): Promise<string> {
  if (process.env.NIUPACKBOT_ORGANIZATION_ID) return process.env.NIUPACKBOT_ORGANIZATION_ID;
  if (process.env.NODE_ENV === 'test') return TEST_ORG;
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin.from('organizations').select('id').limit(1).maybeSingle();
      if (data?.id) return data.id as string;
    } catch {
      // fallthrough a NOT_CONFIGURED controlado
    }
  }
  // Dev con memoria: usar org de test para no tumbar el webhook.
  if (process.env.NODE_ENV === 'development') return TEST_ORG;
  throw new Error('ORGANIZATION_NOT_RESOLVED');
}

function twiml(message: string | null): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET() {
  const configured = Boolean(process.env.TWILIO_AUTH_TOKEN);
  return NextResponse.json({ status: 'ok', channel: 'WHATSAPP', provider: 'TWILIO', signature_validation: configured ? 'ENABLED' : 'NOT_CONFIGURED' });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let params: Record<string, string> = {};
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      for (const [k, v] of form.entries()) params[k] = String(v);
    } else {
      // Soportar JSON en tests/dev sin Twilio real.
      try {
        params = (await request.json()) as Record<string, string>;
      } catch {
        params = {};
      }
    }

    // Validar firma Twilio cuando hay secreto configurado.
    const signature = request.headers.get('x-twilio-signature');
    const url = process.env.TWILIO_WEBHOOK_URL || new URL(request.url).toString().split('?')[0];
    const check = validateTwilioSignature({ url, params, signature });
    if (check.configured && !check.valid) {
      return twiml(null);
    }

    const inbound = normalizeTwilioParams(params);
    if (!inbound.body || !inbound.from || !inbound.externalMessageId) {
      return twiml(null);
    }

    let organizationId: string;
    try {
      organizationId = await resolveOrganizationId();
    } catch {
      return twiml(null);
    }

    const result = await niupackbotService.handleInbound(organizationId, inbound);
    return twiml(result.replySkipped ? null : result.reply);
  } catch {
    // Fail-closed para Twilio (200 vacío) pero CRM ya registró FAILURE_HANDLED; nunca exponer stack.
    return twiml(null);
  }
}
