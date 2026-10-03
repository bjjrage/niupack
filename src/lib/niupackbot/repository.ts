// NIUPACKBOT repository: solo tablas niupackbot_*. CRM vía crmRepository/crmService.
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/db/supabase';
import type { BotAuthorRole, BotStatus } from './types';

export interface BotMessage {
  id: string;
  organization_id: string;
  conversation_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channel: string;
  provider: string;
  external_message_id?: string | null;
  author_role: BotAuthorRole;
  body: string;
  intent?: string | null;
  language?: string | null;
  metadata?: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
}

interface BotMem {
  messages: BotMessage[];
  states: Array<{
    conversation_id: string;
    organization_id: string;
    bot_status: BotStatus;
    last_intent?: string | null;
    language?: string | null;
    extracted?: Record<string, unknown>;
    turn_count: number;
    last_error?: string | null;
    updated_at: string;
  }>;
  events: Array<Record<string, unknown>>;
}

declare global {
  // eslint-disable-next-line no-var
  var __niu_bot_store: BotMem | undefined;
}

function mem(): BotMem {
  if (!global.__niu_bot_store) global.__niu_bot_store = { messages: [], states: [], events: [] };
  return global.__niu_bot_store;
}

export function resetBotMemory(): void {
  global.__niu_bot_store = { messages: [], states: [], events: [] };
}

type Mode = 'SUPABASE' | 'MEMORY_FALLBACK' | 'NOT_CONFIGURED';

function mode(): Mode {
  if (isSupabaseAdminConfigured && supabaseAdmin) return 'SUPABASE';
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') return 'MEMORY_FALLBACK';
  return 'NOT_CONFIGURED';
}

const now = () => new Date().toISOString();

export const niupackbotRepository = {
  persistenceMode: mode,

  async findMessageByExternal(organizationId: string, externalId: string): Promise<BotMessage | undefined> {
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('niupackbot_messages')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('external_message_id', externalId)
        .maybeSingle();
      if (error) throw new Error(`niupackbot_messages: ${error.message}`);
      return (data as BotMessage | null) ?? undefined;
    }
    return mem().messages.find((m) => m.organization_id === organizationId && m.external_message_id === externalId);
  },

  async appendMessage(input: Omit<BotMessage, 'id' | 'created_at' | 'occurred_at'> & { occurred_at?: string }): Promise<{ message: BotMessage; duplicate: boolean }> {
    if (input.external_message_id) {
      const existing = await this.findMessageByExternal(input.organization_id, input.external_message_id);
      if (existing) return { message: existing, duplicate: true };
    }
    const record: BotMessage = {
      ...input,
      id: crypto.randomUUID(),
      occurred_at: input.occurred_at ?? now(),
      created_at: now(),
    };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        // supabase typed via any
        .from('niupackbot_messages')
        .insert(record)
        .select()
        .single();
      if (error) {
        if (error.code === '23505' && input.external_message_id) {
          const existing = await this.findMessageByExternal(input.organization_id, input.external_message_id);
          if (existing) return { message: existing, duplicate: true };
        }
        throw new Error(`niupackbot_messages: ${error.message}`);
      }
      return { message: data as BotMessage, duplicate: false };
    }
    mem().messages.push(record);
    return { message: record, duplicate: false };
  },

  /**
   * Último mensaje de cada conversación (para el listado de Conversaciones).
   * Lee los mensajes más recientes de la organización y se queda con el último por conversación:
   * evita una consulta por chat. Una conversación sin actividad reciente puede quedar sin dato.
   */
  async lastMessages(organizationId: string, conversationIds: string[], scan = 3000): Promise<Map<string, BotMessage>> {
    const out = new Map<string, BotMessage>();
    if (conversationIds.length === 0) return out;
    const wanted = new Set(conversationIds);
    let rows: BotMessage[];
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('niupackbot_messages')
        .select('id,organization_id,conversation_id,direction,channel,provider,external_message_id,author_role,body,occurred_at,created_at')
        .eq('organization_id', organizationId)
        .order('occurred_at', { ascending: false })
        .limit(scan);
      if (error) throw new Error(`niupackbot_messages: ${error.message}`);
      rows = (data ?? []) as BotMessage[];
    } else {
      rows = [...mem().messages].filter((m) => m.organization_id === organizationId).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    }
    for (const m of rows) if (wanted.has(m.conversation_id) && !out.has(m.conversation_id)) out.set(m.conversation_id, m);
    return out;
  },

  async listMessages(conversationId: string, organizationId: string, limit = 50): Promise<BotMessage[]> {
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('niupackbot_messages')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('conversation_id', conversationId)
        .order('occurred_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(`niupackbot_messages: ${error.message}`);
      return (data ?? []) as BotMessage[];
    }
    return mem()
      .messages.filter((m) => m.conversation_id === conversationId && m.organization_id === organizationId)
      .slice(-limit);
  },

  async getState(conversationId: string): Promise<BotMem['states'][number] | undefined> {
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('niupackbot_state').select('*').eq('conversation_id', conversationId).maybeSingle();
      if (error) throw new Error(`niupackbot_state: ${error.message}`);
      return (data as BotMem['states'][number] | null) ?? undefined;
    }
    return mem().states.find((s) => s.conversation_id === conversationId);
  },

  async upsertState(input: { conversation_id: string; organization_id: string; bot_status?: BotStatus; last_intent?: string | null; language?: string | null; extracted?: Record<string, unknown>; turn_count?: number; last_error?: string | null }) {
    const record = {
      conversation_id: input.conversation_id,
      organization_id: input.organization_id,
      bot_status: input.bot_status ?? 'ACTIVE' as BotStatus,
      last_intent: input.last_intent ?? null,
      language: input.language ?? null,
      extracted: input.extracted ?? {},
      turn_count: input.turn_count ?? 0,
      last_error: input.last_error ?? null,
      updated_at: now(),
    };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        // supabase typed via any
        .from('niupackbot_state')
        .upsert(record)
        .select()
        .single();
      if (error) throw new Error(`niupackbot_state: ${error.message}`);
      return data;
    }
    const store = mem();
    const idx = store.states.findIndex((s) => s.conversation_id === input.conversation_id);
    if (idx >= 0) store.states[idx] = { ...store.states[idx], ...record };
    else store.states.push(record);
    return record;
  },

  async logEvent(input: {
    organization_id: string;
    conversation_id?: string | null;
    lead_id?: string | null;
    opportunity_id?: string | null;
    external_message_id?: string | null;
    event_type: string;
    duration_ms?: number | null;
    error_code?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const record = { id: crypto.randomUUID(), ...input, metadata: input.metadata ?? {}, created_at: now() };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { error } = await supabaseAdmin
        // supabase typed via any
        .from('niupackbot_events')
        .insert({
          organization_id: record.organization_id,
          conversation_id: record.conversation_id,
          lead_id: record.lead_id,
          opportunity_id: record.opportunity_id,
          external_message_id: record.external_message_id,
          event_type: record.event_type,
          duration_ms: record.duration_ms,
          error_code: record.error_code,
          metadata: record.metadata,
        });
      if (error) throw new Error(`niupackbot_events: ${error.message}`);
      return record;
    }
    mem().events.push(record);
    return record;
  },
};
