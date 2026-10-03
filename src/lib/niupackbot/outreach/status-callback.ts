// Status callback de Twilio (queued/sent/delivered/read/failed/undelivered) → destinatario de campaña.
// Idempotente y tolerante a desorden: nunca retrocede un estado ni pisa timestamps ya fijados.

import { outreachRepository } from './repository';
import type { CampaignRecipient, RecipientStatus } from './types';

/** Orden del avance feliz. HUMAN y REPLIED están por encima de lo que Twilio puede informar. */
const RANK: Partial<Record<RecipientStatus, number>> = { PENDING: 0, QUEUED: 1, SENT: 2, DELIVERED: 3, READ: 4, REPLIED: 5, HUMAN: 6 };

export interface CallbackResult {
  matched: boolean;
  recipientId?: string;
  from?: RecipientStatus;
  to?: RecipientStatus;
  changed: boolean;
}

export async function applyStatusCallback(
  organizationId: string,
  params: { MessageSid?: string; SmsSid?: string; MessageStatus?: string; SmsStatus?: string; ErrorCode?: string },
  nowIso = new Date().toISOString(),
): Promise<CallbackResult> {
  const sid = params.MessageSid || params.SmsSid || '';
  const raw = String(params.MessageStatus || params.SmsStatus || '').toLowerCase();
  if (!sid || !raw) return { matched: false, changed: false };
  // Mensajes que no son de campaña (respuestas del bot/manuales) no tienen destinatario: se ignoran.
  const r = await outreachRepository.findRecipientBySid(organizationId, sid);
  if (!r) return { matched: false, changed: false };

  const rank = RANK[r.status];
  const updates: Partial<CampaignRecipient> = {};
  let next: RecipientStatus = r.status;

  if (raw === 'sent') {
    if (rank !== undefined && rank < RANK.SENT!) next = 'SENT';
    if (!r.sent_at) updates.sent_at = nowIso;
  } else if (raw === 'delivered') {
    if (rank !== undefined && rank < RANK.DELIVERED!) next = 'DELIVERED';
    if (!r.delivered_at) updates.delivered_at = nowIso;
    if (!r.sent_at) updates.sent_at = nowIso;
  } else if (raw === 'read') {
    if (rank !== undefined && rank < RANK.READ!) next = 'READ';
    if (!r.read_at) updates.read_at = nowIso;
    if (!r.delivered_at) updates.delivered_at = nowIso;
    if (!r.sent_at) updates.sent_at = nowIso;
  } else if (raw === 'failed' || raw === 'undelivered') {
    // Un fallo tardío no puede deshacer una entrega/lectura/respuesta que ya ocurrió.
    if (r.status === 'PENDING' || r.status === 'QUEUED' || r.status === 'SENT') {
      next = 'FAILED';
      updates.failed_at = r.failed_at ?? nowIso;
      updates.last_error = params.ErrorCode ? `TWILIO_${params.ErrorCode}` : raw.toUpperCase();
    }
  }
  // queued / accepted / sending: sin efecto.

  if (next !== r.status) updates.status = next;
  const changed = Object.keys(updates).length > 0;
  if (changed) await outreachRepository.updateRecipient(r.id, organizationId, updates);
  return { matched: true, recipientId: r.id, from: r.status, to: next, changed };
}
