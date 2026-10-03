import { createHmac } from 'node:crypto';
import { crmRepository, resetCrmMemory } from '@/lib/crm/repository';
import { resetBotMemory } from '@/lib/niupackbot/repository';
import { resetOutreachMemory, outreachRepository } from '@/lib/niupackbot/outreach/repository';
import { createCampaign, launchCampaign } from '@/lib/niupackbot/outreach/campaigns';
import type { SendResult } from '@/lib/niupackbot/whatsapp/sender';
import type { OutreachTemplate, TemplateStatus } from '@/lib/niupackbot/outreach/types';

export const ORG = '00000000-0000-0000-0000-000000000001';
export const ORG_B = '00000000-0000-0000-0000-0000000000b2';
export const WEBHOOK = 'https://test.local/api/niupackbot/whatsapp';

export function setupEnv() {
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'tok_test';
  process.env.TWILIO_WHATSAPP_FROM = 'whatsapp:+595900000001';
  process.env.TWILIO_WEBHOOK_URL = WEBHOOK;
  delete process.env.OPENAI_API_KEY;
}

export function resetAll() {
  resetCrmMemory();
  resetBotMemory();
  resetOutreachMemory();
  setupEnv();
}

export function sign(url: string, params: Record<string, string>, token = 'tok_test'): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + (params[k] ?? ''), url);
  return createHmac('sha1', token).update(data, 'utf8').digest('base64');
}

export async function seedTemplate(status: TemplateStatus = 'APPROVED', org = ORG, body = 'Hola {{1}}, somos NIUPACK. ¿Te interesa conocer nuestros vasos y potes?'): Promise<OutreachTemplate> {
  return outreachRepository.insertTemplate({
    organization_id: org,
    name: `intro_${Math.random().toString(36).slice(2, 8)}`,
    language: 'es',
    category: 'MARKETING',
    body,
    variables: { '1': 'María' },
    twilio_content_sid: 'HXtest000000000000000000000000001',
    status,
    rejection_reason: null,
    created_by: null,
  });
}

/** Sender falso: registra cada envío y devuelve SIDs únicos. Nunca toca la red. */
export function fakeSender(opts: { fail?: (to: string, n: number) => SendResult | null } = {}) {
  const calls: Array<{ to: string; contentSid: string; variables?: Record<string, string> }> = [];
  const send = async (i: { to: string; contentSid: string; variables?: Record<string, string> }): Promise<SendResult> => {
    calls.push(i);
    const forced = opts.fail?.(i.to, calls.length);
    if (forced) return forced;
    return { ok: true, sid: `SM${String(calls.length).padStart(30, '0')}`, status: 'queued' };
  };
  return { calls, send };
}

/** Campaña RUNNING con N destinatarios paraguayos 0981 000 00X. */
export async function runningCampaign(n = 3, org = ORG) {
  const template = await seedTemplate('APPROVED', org);
  const { campaign } = await createCampaign(org, null, {
    name: 'Campaña test',
    templateId: template.id,
    audience: { rows: Array.from({ length: n }, (_, i) => ({ name: `Cliente ${i + 1}`, phone: `0981 000 00${i + 1}` })) },
  });
  await launchCampaign(org, null, campaign.id);
  return { campaign, template };
}

export async function conversationsOf(org = ORG) {
  return crmRepository.listConversations(org);
}
