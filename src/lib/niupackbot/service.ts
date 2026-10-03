// NIUPACKBOT Service: orquesta inbound -> contexto -> bot -> CRM -> outbound.
// Diseñado para extraerse a worker/service sin reescribir dominio (solo inyectar sender).

import { crmRepository } from '@/lib/crm/repository';
import { niupackbotRepository } from './repository';
import { loadContext } from './conversation/context';
import { planEffects } from './conversation/engine';
import { runBotTurn } from './ai/router';
import { crmTools } from './tools/crm';
import { requestHandoff } from './handoff/service';
import type { NormalizedInbound } from './types';

export interface InboundResult {
  conversationId: string;
  leadId?: string | null;
  opportunityId?: string | null;
  reply: string | null;
  replySkipped: boolean;
  duplicate: boolean;
  intent?: string | null;
  qualification?: string | null;
}

async function sendWhatsapp(to: string, body: string): Promise<{ sent: boolean; mode: 'TWILIO' | 'STUB' }> {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  const from = process.env.TWILIO_WHATSAPP_FROM || '';
  if (!sid || !token || !from) return { sent: false, mode: 'STUB' };
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const params = new URLSearchParams({ From: from, To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`, Body: body });
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    return { sent: res.ok, mode: 'TWILIO' };
  } catch {
    return { sent: false, mode: 'STUB' };
  }
}

export const niupackbotService = {
  /**
   * Procesa un inbound normalizado. Idempotente por externalMessageId.
   * organizationId se resuelve fuera (por número/tenant o default test). V1: caller la provee.
   */
  async handleInbound(organizationId: string, inbound: NormalizedInbound): Promise<InboundResult> {
    const started = Date.now();
    const externalConvId = inbound.from.startsWith('whatsapp:') ? inbound.from : `whatsapp:${inbound.from}`;

    // 1) Resolver conversación (o crear).
    let conversation = await crmRepository.findConversationByExternal(organizationId, 'WHATSAPP', externalConvId);
    if (!conversation) {
      conversation = await crmRepository.createConversation({
        organization_id: organizationId,
        lead_id: null,
        opportunity_id: null,
        contact_id: null,
        channel: 'WHATSAPP',
        provider: 'TWILIO',
        external_conversation_id: externalConvId,
        status: 'OPEN',
        control_mode: 'BOT',
        last_message_at: new Date().toISOString(),
      });
    }
    const conversationId = conversation.id;

    // 2) Persistir inbound (idempotencia).
    const { message: inboundMsg, duplicate } = await niupackbotRepository.appendMessage({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: 'INBOUND',
      channel: 'WHATSAPP',
      provider: 'TWILIO',
      external_message_id: inbound.externalMessageId,
      author_role: 'CUSTOMER',
      body: inbound.body,
      intent: null,
      language: null,
      metadata: {},
    });
    if (duplicate) {
      await niupackbotRepository.logEvent({
        organization_id: organizationId,
        conversation_id: conversationId,
        external_message_id: inbound.externalMessageId,
        event_type: 'INBOUND_DUPLICATE',
        duration_ms: Date.now() - started,
      });
      return { conversationId, duplicate: true, reply: null, replySkipped: true };
    }
    void inboundMsg;

    await niupackbotRepository.logEvent({
      organization_id: organizationId,
      conversation_id: conversationId,
      external_message_id: inbound.externalMessageId,
      event_type: 'INBOUND_RECEIVED',
      duration_ms: Date.now() - started,
    });

    // 3) Si humano tiene el control, persistir pero no auto-responder.
    const freshConv = (await crmRepository.getConversation(conversationId, organizationId)) ?? conversation;
    if (freshConv.control_mode === 'HUMAN' || freshConv.control_mode === 'PAUSED') {
      await crmRepository.updateConversation(conversationId, organizationId, { last_message_at: new Date().toISOString() });
      await niupackbotRepository.logEvent({
        organization_id: organizationId,
        conversation_id: conversationId,
        external_message_id: inbound.externalMessageId,
        event_type: 'REPLY_SKIPPED_HUMAN',
        duration_ms: Date.now() - started,
        metadata: { control_mode: freshConv.control_mode },
      });
      return { conversationId, leadId: freshConv.lead_id ?? null, duplicate: false, reply: null, replySkipped: true };
    }

    // 4) Contexto + bot.
    let context;
    try {
      context = await loadContext(organizationId, conversationId);
    } catch (e) {
      await niupackbotRepository.logEvent({
        organization_id: organizationId,
        conversation_id: conversationId,
        external_message_id: inbound.externalMessageId,
        event_type: 'FAILURE_HANDLED',
        duration_ms: Date.now() - started,
        error_code: 'CONTEXT_FAILED',
        metadata: { error: e instanceof Error ? e.message : 'unknown' },
      });
      throw e;
    }
    await niupackbotRepository.logEvent({
      organization_id: organizationId,
      conversation_id: conversationId,
      external_message_id: inbound.externalMessageId,
      event_type: 'CONTEXT_LOADED',
      duration_ms: Date.now() - started,
    });

    const turn = await runBotTurn({ text: inbound.body, context });
    await niupackbotRepository.logEvent({
      organization_id: organizationId,
      conversation_id: conversationId,
      external_message_id: inbound.externalMessageId,
      event_type: 'INTENT_EXTRACTED',
      duration_ms: Date.now() - started,
      metadata: { intent: turn.intent, qualification: turn.qualification },
    });

    // 5) CRM via service (nunca directo).
    const { lead } = await crmTools.upsertInboundLead(organizationId, {
      externalSource: 'WHATSAPP_TWILIO',
      externalId: externalConvId,
      channel: 'WHATSAPP',
      contactName: inbound.profileName ?? null,
      whatsapp: inbound.from,
      extracted: turn.extracted,
    });
    // Vincular conversación<->lead si faltaba.
    if (!freshConv.lead_id) {
      await crmRepository.updateConversation(conversationId, organizationId, { lead_id: lead.id, last_message_at: new Date().toISOString() });
    } else {
      await crmRepository.updateConversation(conversationId, organizationId, { last_message_at: new Date().toISOString() });
    }
    await niupackbotRepository.logEvent({
      organization_id: organizationId,
      conversation_id: conversationId,
      lead_id: lead.id,
      external_message_id: inbound.externalMessageId,
      event_type: 'CRM_UPSERTED',
      duration_ms: Date.now() - started,
    });
    await crmTools.addActivity(organizationId, {
      lead_id: lead.id,
      conversation_id: conversationId,
      type: 'BOT_MESSAGE',
      title: `Inbound: ${turn.intent} / ${turn.qualification}`,
      body: inbound.body.slice(0, 1000),
      metadata: { intent: turn.intent, qualification: turn.qualification },
    });

    const effects = planEffects({ context: { ...context, leadId: lead.id }, turn });
    let opportunityId: string | null = null;

    if (turn.shouldRequestHandoff || effects.createTask) {
      await requestHandoff({
        organizationId,
        conversationId,
        leadId: lead.id,
        reason: turn.shouldRequestHandoff ? 'Cliente solicitó humano.' : `Lead ${turn.qualification} requiere seguimiento humano.`,
      });
      await niupackbotRepository.logEvent({
        organization_id: organizationId,
        conversation_id: conversationId,
        lead_id: lead.id,
        external_message_id: inbound.externalMessageId,
        event_type: 'HANDOFF_REQUESTED',
        duration_ms: Date.now() - started,
      });
    }

    if (effects.createOpportunity) {
      const opp = await crmTools.createOpportunityFromLead(organizationId, lead.id);
      opportunityId = opp.id;
      await crmRepository.updateConversation(conversationId, organizationId, { opportunity_id: opp.id });
      await niupackbotRepository.logEvent({
        organization_id: organizationId,
        conversation_id: conversationId,
        lead_id: lead.id,
        opportunity_id: opp.id,
        external_message_id: inbound.externalMessageId,
        event_type: 'OPPORTUNITY_CREATED',
        duration_ms: Date.now() - started,
      });
    }

    // 6) Outbound + persist.
    if (!effects.autoReply) {
      await niupackbotRepository.logEvent({
        organization_id: organizationId,
        conversation_id: conversationId,
        lead_id: lead.id,
        opportunity_id: opportunityId,
        external_message_id: inbound.externalMessageId,
        event_type: 'REPLY_SKIPPED_HUMAN',
        duration_ms: Date.now() - started,
      });
      return { conversationId, leadId: lead.id, opportunityId, reply: null, replySkipped: true, duplicate: false, intent: turn.intent, qualification: turn.qualification };
    }

    const { message: outbound } = await niupackbotRepository.appendMessage({
      organization_id: organizationId,
      conversation_id: conversationId,
      direction: 'OUTBOUND',
      channel: 'WHATSAPP',
      provider: 'TWILIO',
      external_message_id: null,
      author_role: 'BOT',
      body: turn.reply,
      intent: turn.intent,
      language: turn.language,
      metadata: {},
    });
    void outbound;
    const send = await sendWhatsapp(inbound.from, turn.reply);
    await niupackbotRepository.upsertState({
      conversation_id: conversationId,
      organization_id: organizationId,
      bot_status: turn.shouldRequestHandoff ? 'HANDOFF_REQUESTED' : 'ACTIVE',
      last_intent: turn.intent,
      language: turn.language,
      extracted: turn.extracted as unknown as Record<string, unknown>,
      turn_count: (context.state.turn_count ?? 0) + 1,
    });
    await niupackbotRepository.logEvent({
      organization_id: organizationId,
      conversation_id: conversationId,
      lead_id: lead.id,
      opportunity_id: opportunityId,
      external_message_id: inbound.externalMessageId,
      event_type: 'REPLY_SENT',
      duration_ms: Date.now() - started,
      metadata: { mode: send.mode, sent: send.sent },
    });

    return {
      conversationId,
      leadId: lead.id,
      opportunityId,
      reply: turn.reply,
      replySkipped: false,
      duplicate: false,
      intent: turn.intent,
      qualification: turn.qualification,
    };
  },
};
