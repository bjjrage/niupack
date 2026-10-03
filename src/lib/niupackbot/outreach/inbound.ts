// Puente campaña ↔ NIUPACKBOT inbound. La respuesta del prospecto entra al bot existente
// (no hay un sistema paralelo): acá solo se vincula destinatario → teléfono → conversación → contacto,
// se honran bajas y rechazos, y se deja el template enviado como contexto de la charla.

import { crmRepository } from '@/lib/crm/repository';
import { niupackbotRepository } from '../repository';
import { detectNoInterest, detectOptOut } from './signals';
import { isE164, normalizePhone } from './phone';
import { outreachRepository } from './repository';
import { renderTemplate } from './templates';
import type { CampaignRecipient, RecipientStatus } from './types';

/** Estados de un destinatario al que ya le llegó (o pudo llegarle) el primer mensaje. */
const CONTACTED: RecipientStatus[] = ['SENT', 'DELIVERED', 'READ', 'REPLIED', 'HUMAN', 'NO_INTEREST'];

export interface InboundCampaignResult {
  /** El mensaje es una baja: el caller responde la confirmación y corta el flujo del bot. */
  optOut: boolean;
  /** Rechazo cortés: el caller responde una vez y corta el flujo. */
  noInterest: boolean;
  recipientId?: string;
  campaignId?: string;
}

export async function onCampaignInbound(
  organizationId: string,
  input: { from: string; conversationId: string; body: string; now?: Date },
): Promise<InboundCampaignResult> {
  // Una baja de un número fuera de BR/AR/BO/PY igual se registra (E.164 genérico).
  const strict = normalizePhone(input.from);
  const generic = `+${input.from.replace(/^whatsapp:/i, '').replace(/[^0-9]/g, '')}`;
  const phone = strict.ok ? strict : isE164(generic) ? { ok: true as const, e164: generic } : null;
  if (!phone) return { optOut: false, noInterest: false };
  const nowIso = (input.now ?? new Date()).toISOString();

  // Una baja se honra aunque el número no venga de campaña ni haya un humano en la charla.
  if (detectOptOut(input.body)) {
    await outreachRepository.addOptOut(organizationId, phone.e164, 'INBOUND_KEYWORD', 'Baja por mensaje del cliente');
    await outreachRepository.optOutPendingForPhone(organizationId, phone.e164);
    const latest = (await outreachRepository.listRecipientsByPhone(organizationId, phone.e164)).find((r) => CONTACTED.includes(r.status));
    if (latest) await outreachRepository.updateRecipient(latest.id, organizationId, { status: 'OPT_OUT', conversation_id: latest.conversation_id ?? input.conversationId });
    return { optOut: true, noInterest: false, recipientId: latest?.id, campaignId: latest?.campaign_id };
  }

  const latest = (await outreachRepository.listRecipientsByPhone(organizationId, phone.e164)).find((r) => CONTACTED.includes(r.status));
  if (!latest) return { optOut: false, noInterest: false };

  const updates: Partial<CampaignRecipient> = { conversation_id: latest.conversation_id ?? input.conversationId };
  if (!latest.replied_at) updates.replied_at = nowIso;
  const noInterest = detectNoInterest(input.body);
  if (noInterest) updates.status = 'NO_INTEREST';
  else if (latest.status !== 'HUMAN' && latest.status !== 'NO_INTEREST') updates.status = 'REPLIED';
  await outreachRepository.updateRecipient(latest.id, organizationId, updates);

  // Contacto del CRM → la conversación queda ligada a la persona/empresa.
  if (latest.contact_id) {
    const conv = await crmRepository.getConversation(input.conversationId, organizationId);
    if (conv && !conv.contact_id) await crmRepository.updateConversation(conv.id, organizationId, { contact_id: latest.contact_id });
  }
  await seedCampaignMessage(organizationId, latest, input.conversationId);
  return { optOut: false, noInterest, recipientId: latest.id, campaignId: latest.campaign_id };
}

/** Deja el template enviado como primer mensaje saliente: el bot y el vendedor ven a qué responde el cliente. */
async function seedCampaignMessage(organizationId: string, recipient: CampaignRecipient, conversationId: string): Promise<void> {
  if (!recipient.message_sid) return;
  const campaign = await outreachRepository.getCampaign(recipient.campaign_id, organizationId);
  const template = campaign ? await outreachRepository.getTemplate(campaign.template_id, organizationId) : undefined;
  if (!campaign || !template) return;
  await niupackbotRepository.appendMessage({
    organization_id: organizationId,
    conversation_id: conversationId,
    direction: 'OUTBOUND',
    channel: 'WHATSAPP',
    provider: 'TWILIO',
    external_message_id: recipient.message_sid, // idempotente: el mismo SID no se inserta dos veces
    author_role: 'SYSTEM',
    body: renderTemplate(template.body, recipient.content_variables),
    intent: null,
    language: null,
    metadata: { campaign_id: campaign.id, campaign_name: campaign.name, template_id: template.id },
    occurred_at: recipient.sent_at ?? undefined, // ordena el template ANTES de la respuesta del cliente
  });
}

/** El vendedor tomó la conversación o el bot derivó: el destinatario pasa a HUMAN. */
export async function markRecipientsHuman(organizationId: string, conversationId: string): Promise<number> {
  const rows = await outreachRepository.listRecipientsByConversations(organizationId, [conversationId]);
  let n = 0;
  for (const r of rows) {
    if (['REPLIED', 'READ', 'DELIVERED', 'SENT'].includes(r.status)) {
      await outreachRepository.updateRecipient(r.id, organizationId, { status: 'HUMAN' });
      n += 1;
    }
  }
  return n;
}

/** Campaña de una conversación (para mostrar "vino de campaña" en Conversaciones). */
export async function campaignsForConversations(
  organizationId: string,
  conversationIds: string[],
): Promise<Map<string, { campaign_id: string; campaign_name: string; recipient_status: RecipientStatus }>> {
  const out = new Map<string, { campaign_id: string; campaign_name: string; recipient_status: RecipientStatus }>();
  const recs = await outreachRepository.listRecipientsByConversations(organizationId, conversationIds);
  if (recs.length === 0) return out;
  const campaigns = await outreachRepository.listCampaigns(organizationId);
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  for (const r of recs) {
    if (r.conversation_id && !out.has(r.conversation_id)) {
      out.set(r.conversation_id, { campaign_id: r.campaign_id, campaign_name: names.get(r.campaign_id) ?? 'Campaña', recipient_status: r.status });
    }
  }
  return out;
}
