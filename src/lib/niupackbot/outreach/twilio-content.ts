// Twilio Content API (templates WhatsApp). Adaptado de sfRoutes.cjs (AutoLead):
// crear Content → pedir aprobación WhatsApp → consultar estado. SOLO SERVER.

import type { TemplateCategory, TemplateLanguage, TemplateStatus } from './types';

const BASE = 'https://content.twilio.com/v1';

export class ContentApiError extends Error {
  constructor(public code: string, public httpStatus: number | null) {
    super(code);
  }
}

function authHeader(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (!sid || !token) throw new ContentApiError('TWILIO_NOT_CONFIGURED', null);
  return `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
}

async function call(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof ContentApiError) throw e;
    throw new ContentApiError('NETWORK_ERROR', null);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ContentApiError(data.code ? `TWILIO_${String(data.code)}` : `HTTP_${res.status}`, res.status);
  return data;
}

/** Crea el Content Template (tipo twilio/text). Devuelve el ContentSid (HX...). */
export async function createContent(input: {
  name: string;
  language: TemplateLanguage;
  body: string;
  variables: Record<string, string>;
}): Promise<string> {
  const data = await call('/Content', 'POST', {
    friendly_name: input.name,
    language: input.language,
    variables: input.variables,
    types: { 'twilio/text': { body: input.body } },
  });
  const sid = String(data.sid ?? '');
  if (!sid) throw new ContentApiError('TWILIO_CONTENT_SID_MISSING', null);
  return sid;
}

export async function requestApproval(contentSid: string, input: { name: string; category: TemplateCategory }): Promise<void> {
  await call(`/Content/${encodeURIComponent(contentSid)}/ApprovalRequests/whatsapp`, 'POST', { name: input.name, category: input.category });
}

/** Mapea el estado de aprobación de WhatsApp al estado del template NIUPACK. */
export function mapApprovalStatus(raw: unknown): TemplateStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'approved') return 'APPROVED';
  if (s === 'rejected') return 'REJECTED';
  if (s === 'paused') return 'PAUSED';
  if (s === 'disabled') return 'DISABLED';
  if (s === 'received' || s === 'pending' || s === 'submitted' || s === 'in_review') return 'PENDING';
  return 'DRAFT'; // unsubmitted / desconocido
}

export async function fetchApproval(contentSid: string): Promise<{ status: TemplateStatus; rejectionReason: string | null }> {
  const data = await call(`/Content/${encodeURIComponent(contentSid)}/ApprovalRequests`, 'GET');
  const wa = (data.whatsapp ?? (Array.isArray(data.approval_requests) ? data.approval_requests[0] : data)) as Record<string, unknown> | undefined;
  const reason = String(wa?.rejection_reason ?? '').trim();
  return { status: mapApprovalStatus(wa?.status ?? wa?.approval_status), rejectionReason: reason || null };
}
