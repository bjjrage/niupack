export interface AutoLeadBotMetrics {
  total_leads: number;
  total_conversations: number;
  total_messages: number;
  leads_last_7_days: number;
  conversations_last_7_days: number;
}

export interface AutoLeadBotLead {
  id: string;
  name: string | null;
  phone: string | null;
  created_at: string | null;
  updated_at: string | null;
  source_channel: string | null;
  source_campaign: string | null;
  source_vehicle: string | null;
  current_vehicle: string | null;
  current_intent: string | null;
  status: string | null;
  last_message_at: string | null;
}

export interface AutoLeadBotMessage {
  role?: string;
  content?: string;
  at?: string;
  [key: string]: unknown;
}

export interface AutoLeadBotConversation {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  controlBot: string | null;
  updated_at: string | null;
}

export class AutoLeadBridgeError extends Error {
  constructor(
    public readonly code:
      | 'BOT_BRIDGE_NOT_CONFIGURED'
      | 'BOT_BRIDGE_UNAUTHORIZED'
      | 'BOT_BRIDGE_FORBIDDEN'
      | 'BOT_BRIDGE_UNAVAILABLE'
      | 'BOT_BRIDGE_BAD_RESPONSE',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AutoLeadBridgeError';
  }
}

function config() {
  const baseUrl = process.env.AUTOLEADBOT_API_BASE_URL?.replace(/\/+$/, '');
  const token = process.env.AUTOLEADBOT_API_TOKEN;
  if (!baseUrl || !token) {
    throw new AutoLeadBridgeError(
      'BOT_BRIDGE_NOT_CONFIGURED',
      'AUTOLEADBOT_API_BASE_URL/AUTOLEADBOT_API_TOKEN are required',
    );
  }
  return { baseUrl, token };
}

async function request<T>(path: string): Promise<T> {
  const { baseUrl, token } = config();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(9_000),
    });
  } catch {
    throw new AutoLeadBridgeError('BOT_BRIDGE_UNAVAILABLE');
  }

  if (response.status === 401) throw new AutoLeadBridgeError('BOT_BRIDGE_UNAUTHORIZED');
  if (response.status === 403) throw new AutoLeadBridgeError('BOT_BRIDGE_FORBIDDEN');
  if (!response.ok) throw new AutoLeadBridgeError('BOT_BRIDGE_BAD_RESPONSE');

  const data = (await response.json()) as T & { ok?: boolean };
  if (!data || typeof data !== 'object' || data.ok !== true) {
    throw new AutoLeadBridgeError('BOT_BRIDGE_BAD_RESPONSE');
  }
  return data;
}

export async function getAutoLeadMetrics(): Promise<AutoLeadBotMetrics> {
  const data = await request<{ ok: true; metrics: AutoLeadBotMetrics }>('/api/bot/metrics');
  return data.metrics;
}

export async function getAutoLeadLeads(params?: {
  limit?: number;
  offset?: number;
  since?: string;
  status?: string;
}): Promise<{ items: AutoLeadBotLead[]; pagination: unknown }> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set('limit', String(params.limit));
  if (params?.offset !== undefined) search.set('offset', String(params.offset));
  if (params?.since) search.set('since', params.since);
  if (params?.status) search.set('status', params.status);

  const suffix = search.size ? `?${search.toString()}` : '';
  const data = await request<{ ok: true; items: AutoLeadBotLead[]; pagination?: unknown }>(
    `/api/bot/leads${suffix}`,
  );
  return { items: Array.isArray(data.items) ? data.items : [], pagination: data.pagination ?? null };
}

export async function getAutoLeadConversation(conversationId: string): Promise<{
  conversation: AutoLeadBotConversation;
  messages: AutoLeadBotMessage[];
}> {
  const data = await request<{
    ok: true;
    conversation: AutoLeadBotConversation;
    messages?: AutoLeadBotMessage[];
  }>(`/api/bot/conversations/${encodeURIComponent(conversationId)}`);

  return {
    conversation: data.conversation,
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
}
