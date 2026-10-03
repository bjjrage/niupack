// Estado, avance y filtros del listado de Conversaciones. PURO: sin React ni fetch, para poder testearlo.
// Reemplaza el "Área / Estado / Heatmap" de la Mesa de Entrada de AutoLead por conceptos de NIUPACK.

import type { Tone } from '../commercial-ui';
import type { InboxItem, LeadRow, Opp } from '../types';

/** Quién tiene la pelota. Es lo que más importa cuando se acumulan chats. */
export type InboxState = 'WAITING_SELLER' | 'WITH_SELLER' | 'WITH_BOT' | 'NO_CONTACT' | 'CLOSED';

export const STATE_META: Record<InboxState, { label: string; tone: Tone }> = {
  WAITING_SELLER: { label: 'Espera vendedor', tone: 'warning' },
  WITH_SELLER: { label: 'Con vendedor', tone: 'info' },
  WITH_BOT: { label: 'Con NIUPACKBOT', tone: 'success' },
  NO_CONTACT: { label: 'No contactar', tone: 'danger' },
  CLOSED: { label: 'Cerrada', tone: 'neutral' },
};

/** Orden de las pestañas de estado. */
export const STATE_ORDER: InboxState[] = ['WAITING_SELLER', 'WITH_SELLER', 'WITH_BOT', 'NO_CONTACT', 'CLOSED'];

export function conversationState(item: InboxItem): InboxState {
  const rs = item.campaign?.recipient_status;
  if (rs === 'OPT_OUT' || rs === 'NO_INTEREST') return 'NO_CONTACT';
  const c = item.conversation;
  if (c.status !== 'OPEN') return 'CLOSED';
  if (c.control_mode === 'BOT') return 'WITH_BOT';
  // HUMAN / PAUSED: si el último mensaje es del cliente, el vendedor todavía no contestó.
  return !item.last_message || item.last_message.direction === 'INBOUND' ? 'WAITING_SELLER' : 'WITH_SELLER';
}

/** Hasta dónde avanzó el contacto en el embudo comercial. */
export type Stage = 'NEW' | 'INTEREST' | 'OPPORTUNITY' | 'WON' | 'LOST';

export const STAGE_META: Record<Stage, { label: string; tone: Tone }> = {
  NEW: { label: 'Sin datos', tone: 'neutral' },
  INTEREST: { label: 'Interés identificado', tone: 'info' },
  OPPORTUNITY: { label: 'Oportunidad abierta', tone: 'brand' },
  WON: { label: 'Ganada', tone: 'success' },
  LOST: { label: 'Perdida', tone: 'neutral' },
};

export const STAGE_ORDER: Stage[] = ['NEW', 'INTEREST', 'OPPORTUNITY', 'WON', 'LOST'];

export function conversationStage(item: InboxItem, oppById: Map<string, Opp>, leadById: Map<string, LeadRow>): Stage {
  const opp = item.conversation.opportunity_id ? oppById.get(item.conversation.opportunity_id) : undefined;
  if (opp) return opp.stage === 'GANADO' ? 'WON' : opp.stage === 'PERDIDO' ? 'LOST' : 'OPPORTUNITY';
  const lead = item.conversation.lead_id ? leadById.get(item.conversation.lead_id) : undefined;
  if (lead?.product_interest || (lead?.qualification && lead.qualification !== 'LOW')) return 'INTEREST';
  return 'NEW';
}

export interface InboxFilters {
  state: InboxState | 'ALL';
  stage: Stage | 'ALL';
  /** 'ALL' | 'DIRECT' | id de campaña */
  origin: string;
  owner: string; // '' = todos
  q: string;
}

export const EMPTY_FILTERS: InboxFilters = { state: 'ALL', stage: 'ALL', origin: 'ALL', owner: '', q: '' };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface InboxRow {
  item: InboxItem;
  state: InboxState;
  stage: Stage;
  name: string;
  phone: string;
  product: string;
  ownerId: string | null;
}

/**
 * Orden: primero lo que espera a un vendedor (el que lleva más tiempo esperando arriba),
 * después el resto por actividad reciente.
 */
export function sortRows(rows: InboxRow[]): InboxRow[] {
  const at = (r: InboxRow) => new Date(r.item.last_message?.at ?? r.item.conversation.last_message_at ?? 0).getTime();
  return [...rows].sort((a, b) => {
    const wa = a.state === 'WAITING_SELLER';
    const wb = b.state === 'WAITING_SELLER';
    if (wa !== wb) return wa ? -1 : 1;
    return wa ? at(a) - at(b) : at(b) - at(a);
  });
}

export function filterRows(rows: InboxRow[], f: InboxFilters): InboxRow[] {
  const q = norm(f.q.trim());
  return rows.filter((r) => {
    if (f.state !== 'ALL' && r.state !== f.state) return false;
    if (f.stage !== 'ALL' && r.stage !== f.stage) return false;
    if (f.origin === 'DIRECT' && r.item.campaign) return false;
    if (f.origin !== 'ALL' && f.origin !== 'DIRECT' && r.item.campaign?.campaign_id !== f.origin) return false;
    if (f.owner && r.ownerId !== f.owner) return false;
    if (!q) return true;
    return norm(`${r.name} ${r.phone} ${r.product} ${r.item.last_message?.preview ?? ''} ${r.item.campaign?.campaign_name ?? ''}`).includes(q);
  });
}

export function countByState(rows: InboxRow[]): Record<InboxState, number> {
  const out: Record<InboxState, number> = { WAITING_SELLER: 0, WITH_SELLER: 0, WITH_BOT: 0, NO_CONTACT: 0, CLOSED: 0 };
  for (const r of rows) out[r.state] += 1;
  return out;
}
