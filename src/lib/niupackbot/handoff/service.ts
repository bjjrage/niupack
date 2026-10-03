import { crmService } from '@/lib/crm/service';

/** Handoff: cambia a HUMAN, crea activity + task, actualiza estado bot. */
export async function requestHandoff(input: { organizationId: string; conversationId: string; leadId?: string | null; reason?: string | null }) {
  const { niupackbotRepository } = await import('../repository');
  const result = await crmService.requestHumanHandoff(input.organizationId, {
    conversation_id: input.conversationId,
    lead_id: input.leadId ?? null,
    reason: input.reason ?? null,
  });
  await niupackbotRepository.upsertState({
    conversation_id: input.conversationId,
    organization_id: input.organizationId,
    bot_status: 'HANDOFF_REQUESTED',
  });
  return result;
}
