import { describe, it, expect } from 'vitest';
import {
  conversationStage,
  conversationState,
  countByState,
  EMPTY_FILTERS,
  filterRows,
  sortRows,
  type InboxRow,
} from '@/components/crm/views/inbox-state';
import type { InboxItem, LeadRow, Opp } from '@/components/crm/types';

const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

function item(over: {
  id?: string;
  control?: 'BOT' | 'HUMAN' | 'PAUSED';
  status?: string;
  last?: 'INBOUND' | 'OUTBOUND' | null;
  at?: string;
  campaign?: { id: string; name: string; rs: string } | null;
  lead_id?: string | null;
  opp_id?: string | null;
  preview?: string;
}): InboxItem {
  return {
    conversation: {
      id: over.id ?? 'c1',
      external_conversation_id: 'whatsapp:+595981000001',
      control_mode: over.control ?? 'BOT',
      status: over.status ?? 'OPEN',
      lead_id: over.lead_id ?? null,
      opportunity_id: over.opp_id ?? null,
      last_message_at: over.at ?? ago(5),
    },
    campaign: over.campaign ? { campaign_id: over.campaign.id, campaign_name: over.campaign.name, recipient_status: over.campaign.rs } : null,
    last_message: over.last === null ? null : { direction: over.last ?? 'INBOUND', author_role: 'CUSTOMER', preview: over.preview ?? 'hola', at: over.at ?? ago(5) },
  };
}

const row = (i: InboxItem, extra: Partial<InboxRow> = {}): InboxRow => ({
  item: i,
  state: conversationState(i),
  stage: 'NEW',
  name: 'Cliente',
  phone: '+595981000001',
  product: '',
  ownerId: null,
  ...extra,
});

describe('Estado de la conversación (quién tiene la pelota)', () => {
  it('bot atiende', () => expect(conversationState(item({ control: 'BOT' }))).toBe('WITH_BOT'));
  it('humano y el último mensaje es del cliente => espera vendedor', () => {
    expect(conversationState(item({ control: 'HUMAN', last: 'INBOUND' }))).toBe('WAITING_SELLER');
  });
  it('humano y ya contestó => con vendedor', () => {
    expect(conversationState(item({ control: 'HUMAN', last: 'OUTBOUND' }))).toBe('WITH_SELLER');
  });
  it('humano sin mensajes conocidos => espera vendedor (no se esconde)', () => {
    expect(conversationState(item({ control: 'HUMAN', last: null }))).toBe('WAITING_SELLER');
  });
  it('PAUSED se trata como atención humana', () => {
    expect(conversationState(item({ control: 'PAUSED', last: 'OUTBOUND' }))).toBe('WITH_SELLER');
  });
  it('baja o rechazo de campaña => no contactar, aunque esté en HUMAN', () => {
    expect(conversationState(item({ control: 'HUMAN', campaign: { id: 'g', name: 'X', rs: 'OPT_OUT' } }))).toBe('NO_CONTACT');
    expect(conversationState(item({ control: 'BOT', campaign: { id: 'g', name: 'X', rs: 'NO_INTEREST' } }))).toBe('NO_CONTACT');
  });
  it('cerrada/archivada', () => {
    expect(conversationState(item({ status: 'CLOSED' }))).toBe('CLOSED');
    expect(conversationState(item({ status: 'ARCHIVED' }))).toBe('CLOSED');
  });
});

describe('Avance en el embudo', () => {
  const opps = new Map<string, Opp>([
    ['o1', { id: 'o1', title: 'x', stage: 'COTIZACIÓN' }],
    ['o2', { id: 'o2', title: 'y', stage: 'GANADO' }],
    ['o3', { id: 'o3', title: 'z', stage: 'PERDIDO' }],
  ]);
  const leads = new Map<string, LeadRow>([
    ['l1', { id: 'l1', product_interest: 'vaso polipapel', qualification: 'LOW' }],
    ['l2', { id: 'l2', qualification: 'MEDIUM' }],
    ['l3', { id: 'l3', qualification: 'LOW' }],
  ]);
  it('oportunidad abierta / ganada / perdida', () => {
    expect(conversationStage(item({ opp_id: 'o1' }), opps, leads)).toBe('OPPORTUNITY');
    expect(conversationStage(item({ opp_id: 'o2' }), opps, leads)).toBe('WON');
    expect(conversationStage(item({ opp_id: 'o3' }), opps, leads)).toBe('LOST');
  });
  it('interés por producto o calificación; si no, sin datos', () => {
    expect(conversationStage(item({ lead_id: 'l1' }), opps, leads)).toBe('INTEREST');
    expect(conversationStage(item({ lead_id: 'l2' }), opps, leads)).toBe('INTEREST');
    expect(conversationStage(item({ lead_id: 'l3' }), opps, leads)).toBe('NEW');
    expect(conversationStage(item({}), opps, leads)).toBe('NEW');
  });
});

describe('Orden y filtros con muchos chats', () => {
  const waitingOld = row(item({ id: 'a', control: 'HUMAN', last: 'INBOUND', at: ago(120) }));
  const waitingNew = row(item({ id: 'b', control: 'HUMAN', last: 'INBOUND', at: ago(10) }));
  const botRecent = row(item({ id: 'c', control: 'BOT', at: ago(1) }));
  const botOld = row(item({ id: 'd', control: 'BOT', at: ago(500) }));

  it('primero los que esperan (el que lleva más tiempo, arriba), después por actividad reciente', () => {
    expect(sortRows([botOld, botRecent, waitingNew, waitingOld]).map((r) => r.item.conversation.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('no muta el arreglo original', () => {
    const arr = [botOld, waitingOld];
    sortRows(arr);
    expect(arr[0]).toBe(botOld);
  });

  it('filtra por estado, origen (campaña / directo), responsable y búsqueda sin acentos ni mayúsculas', () => {
    const camp = row(item({ id: 'e', control: 'BOT', campaign: { id: 'g1', name: 'Cafeterías Octubre', rs: 'REPLIED' } }), { name: 'María López', product: 'Vaso 12 oz', ownerId: 'u1' });
    const direct = row(item({ id: 'f', control: 'BOT' }), { name: 'Juan', ownerId: 'u2' });
    const all = [camp, direct, waitingOld];
    expect(filterRows(all, { ...EMPTY_FILTERS, state: 'WAITING_SELLER' }).map((r) => r.item.conversation.id)).toEqual(['a']);
    expect(filterRows(all, { ...EMPTY_FILTERS, origin: 'g1' }).map((r) => r.item.conversation.id)).toEqual(['e']);
    expect(filterRows(all, { ...EMPTY_FILTERS, origin: 'DIRECT' }).map((r) => r.item.conversation.id)).toEqual(['f', 'a']);
    expect(filterRows(all, { ...EMPTY_FILTERS, owner: 'u2' }).map((r) => r.item.conversation.id)).toEqual(['f']);
    expect(filterRows(all, { ...EMPTY_FILTERS, q: 'MARIA lopez' }).map((r) => r.item.conversation.id)).toEqual(['e']);
    expect(filterRows(all, { ...EMPTY_FILTERS, q: 'cafeterias' }).map((r) => r.item.conversation.id)).toEqual(['e']);
    expect(filterRows(all, { ...EMPTY_FILTERS, q: 'inexistente' })).toHaveLength(0);
  });

  it('cuenta por estado', () => {
    expect(countByState([waitingOld, waitingNew, botRecent, botOld])).toEqual({ WAITING_SELLER: 2, WITH_SELLER: 0, WITH_BOT: 2, NO_CONTACT: 0, CLOSED: 0 });
  });
});
