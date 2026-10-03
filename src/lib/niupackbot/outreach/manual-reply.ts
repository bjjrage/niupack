// Respuesta manual del vendedor desde el CRM. Texto libre SOLO dentro de la ventana de 24h
// posterior al último mensaje del cliente y con la conversación en control HUMAN.

import { crmRepository } from '@/lib/crm/repository';
import { crmService } from '@/lib/crm/service';
import { niupackbotRepository } from '../repository';
import { sendWhatsappText, type SendResult } from '../whatsapp/sender';
import { normalizePhone } from './phone';
import { outreachRepository } from './repository';

export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MANUAL_REPLY_MAX = 1000;

export async function sendManualReply(
  organizationId: string,
  actorProfileId: string | null,
  conversationId: string,
  rawBody: string,
  opts: { send?: (i: { to: string; body: string }) => Promise<SendResult>; now?: Date } = {},
) {
  const body = rawBody.trim();
  if (!body || body.length > MANUAL_REPLY_MAX) throw new Error('REPLY_BODY_INVALID');
  const conv = await crmRepository.getConversation(conversationId, organizationId);
  if (!conv) throw new Error('CONVERSATION_NOT_FOUND');
  if (conv.control_mode !== 'HUMAN') throw new Error('NOT_HUMAN_CONTROL');

  const phone = normalizePhone(conv.external_conversation_id);
  const to = phone.ok ? phone.e164 : conv.external_conversation_id.replace(/^whatsapp:/i, '');
  if (await outreachRepository.isOptedOut(organizationId, to)) throw new Error('OPTED_OUT');

  const messages = await niupackbotRepository.listMessages(conversationId, organizationId, 100);
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'INBOUND');
  const now = (opts.now ?? new Date()).getTime();
  if (!lastInbound || now - new Date(lastInbound.occurred_at).getTime() > REPLY_WINDOW_MS) throw new Error('OUTSIDE_24H_WINDOW');

  const res = await (opts.send ?? sendWhatsappText)({ to, body });
  if (!res.ok) throw Object.assign(new Error(res.code === 'TWILIO_NOT_CONFIGURED' ? 'TWILIO_NOT_CONFIGURED' : 'SEND_FAILED'), { providerCode: res.code });

  const { message } = await niupackbotRepository.appendMessage({
    organization_id: organizationId,
    conversation_id: conversationId,
    direction: 'OUTBOUND',
    channel: 'WHATSAPP',
    provider: 'TWILIO',
    external_message_id: res.sid,
    author_role: 'HUMAN_AGENT',
    body,
    intent: null,
    language: null,
    metadata: { actor_profile_id: actorProfileId },
  });
  await crmRepository.updateConversation(conversationId, organizationId, { last_message_at: new Date().toISOString() });
  await crmService.addActivity(
    organizationId,
    { conversation_id: conversationId, lead_id: conv.lead_id ?? null, opportunity_id: conv.opportunity_id ?? null, type: 'HUMAN_MESSAGE', source: 'CRM_UI', title: 'Respuesta del vendedor', body: body.slice(0, 1000) },
    actorProfileId ?? undefined,
  );
  return message;
}
