import type { BotContext } from '../types';
import { niupackbotRepository } from '../repository';
import { crmRepository } from '@/lib/crm/repository';

/** Carga ventana de contexto (últimos mensajes + estado + lead) sin secretos. */
export async function loadContext(organizationId: string, conversationId: string): Promise<BotContext> {
  const [conversation, messages, state] = await Promise.all([
    crmRepository.getConversation(conversationId, organizationId),
    niupackbotRepository.listMessages(conversationId, organizationId, 20),
    niupackbotRepository.getState(conversationId),
  ]);
  if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');
  return {
    organizationId,
    conversationId,
    externalConversationId: conversation.external_conversation_id,
    controlMode: conversation.control_mode,
    recentMessages: messages.map((m) => ({
      direction: m.direction,
      author_role: m.author_role,
      body: m.body,
      occurred_at: m.occurred_at,
    })),
    state: {
      bot_status: state?.bot_status ?? 'ACTIVE',
      last_intent: state?.last_intent ?? null,
      language: state?.language ?? null,
      extracted: state?.extracted ?? {},
      turn_count: state?.turn_count ?? 0,
    },
    leadId: conversation.lead_id ?? null,
  };
}
