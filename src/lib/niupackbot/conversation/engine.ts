import type { BotContext, BotTurnResult } from '../types';

/**
 * Conversation engine V1: decide efectos a partir del turno + contexto.
 * - Si control HUMAN/PAUSED => no auto-responder.
 * - Si HIGH => crear oportunidad (vía tools) + task solo si falta contacto humano.
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
  if (turn.shouldRequestHandoff) return { autoReply: true, createOpportunity: false, createTask: true };
  if (turn.shouldCreateOpportunity) {
    return { autoReply: true, createOpportunity: true, createTask: turn.qualification === 'HIGH' };
  }
  return { autoReply: true, createOpportunity: false, createTask: false };
}
