// NIUPACKBOT V1 — tipos del dominio conversacional (packaging, ES/PT-BR).
// CRM es verdad comercial; acá solo runtime conversacional.

import type { CrmIntent, Qualification, VolumePeriod } from '@/lib/crm/types';

export type BotLanguage = 'es' | 'pt-BR';
export type BotAuthorRole = 'CUSTOMER' | 'BOT' | 'HUMAN_AGENT' | 'SYSTEM';
export type BotStatus = 'ACTIVE' | 'PAUSED' | 'HANDOFF_REQUESTED' | 'CLOSED';

export interface ExtractedCommercial {
  country?: string | null;
  language?: BotLanguage | null;
  product_interest?: string | null;
  capacity?: string | null;
  material?: string | null;
  printing?: string | null;
  estimated_volume?: number | null;
  volume_period?: VolumePeriod | null;
  destination_city?: string | null;
  destination_state?: string | null;
  destination_country?: string | null;
  intent?: CrmIntent | null;
  qualification?: Qualification | null;
}

export interface NormalizedInbound {
  externalMessageId: string;
  from: string;
  to: string;
  body: string;
  profileName?: string | null;
  raw: Record<string, string>;
}

export interface BotContext {
  organizationId: string;
  conversationId: string;
  externalConversationId: string;
  controlMode: 'BOT' | 'HUMAN' | 'PAUSED';
  recentMessages: Array<{ direction: 'INBOUND' | 'OUTBOUND'; author_role: BotAuthorRole; body: string; occurred_at: string }>;
  state: { bot_status: BotStatus; last_intent?: string | null; language?: string | null; extracted?: Record<string, unknown>; turn_count: number };
  leadId?: string | null;
}

export interface BotTurnResult {
  reply: string;
  language: BotLanguage;
  extracted: ExtractedCommercial;
  intent: CrmIntent;
  qualification: Qualification;
  shouldRequestHandoff: boolean;
  shouldCreateOpportunity: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ToolResult<T = unknown> {
  status: 'OK' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'ERROR';
  data?: T;
  message?: string;
}
