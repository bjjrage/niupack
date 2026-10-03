import type { BotContext, BotTurnResult } from '../types';

/**
 * Conversation engine: decide efectos a partir del turno + contexto.
 * - HUMAN/PAUSED => el bot no responde ni crea nada.
 * - Handoff => task de seguimiento humano (la crea requestHandoff).
 * - Oportunidad SOLO con señal comercial concreta (turn.shouldCreateOpportunity),
 *   nunca por la calificación del lead ni por el solo hecho de responder.
 */
export function planEffects(input: { context: BotContext; turn: BotTurnResult }): {
  autoReply: boolean;
  createOpportunity: boolean;
  createTask: boolean;
} {
  const { context, turn } = input;
  if (context.controlMode === 'HUMAN' || context.controlMode === 'PAUSED') {
    return { autoReply: false, createOpportunity: false, createTask: false };
  }
  return { autoReply: true, createOpportunity: turn.shouldCreateOpportunity, createTask: turn.shouldRequestHandoff };
}
