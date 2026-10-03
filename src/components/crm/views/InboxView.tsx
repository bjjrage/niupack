'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, MessageSquareText, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Card,
  Drawer,
  DrawerClose,
  Empty,
  fmtDateLabel,
  fmtVolume,
  inputCls,
  label,
  ownerName,
  Pill,
  QUALIFICATION_LABEL,
  Segmented,
  sendJson,
  STAGE_LABEL,
  timeAgo,
} from '../commercial-ui';
import type { ConversationCampaign, ConvRow, CrmActions, CrmData, LeadRow } from '../types';
import { callApi } from '../campaigns/api';
import { errorMessage } from '../campaigns/labels';
import {
  conversationStage,
  conversationState,
  countByState,
  EMPTY_FILTERS,
  filterRows,
  sortRows,
  STAGE_META,
  STAGE_ORDER,
  STATE_META,
  STATE_ORDER,
  type InboxFilters,
  type InboxRow,
} from './inbox-state';

interface Detail {
  conversation: ConvRow;
  messages: Array<{ id: string; direction: string; author_role: string; body: string; occurred_at: string }>;
  lead360?: { lead: LeadRow; company?: { id?: string; name?: string } | null; contact?: { full_name?: string; whatsapp_phone?: string } | null } | null;
  campaign?: ConversationCampaign | null;
}

const phoneOf = (c: ConvRow) => c.external_conversation_id.replace('whatsapp:', '');

const PAGE_SIZE = 50;

/**
 * Conversaciones: tablero con estado, avance y origen (como la Mesa de Entrada de AutoLead, sin KPIs).
 * Escala a cientos de chats: filtros, búsqueda, los que esperan vendedor primero y paginado.
 * El chat completo se abre como detalle.
 */
export function InboxView({ data, actions, focus }: { data: CrmData; actions: CrmActions; focus: { id: string; n: number } | null }) {
  const [filters, setFilters] = useState<InboxFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);

  const nameFor = (c: ConvRow): string => {
    const lead = c.lead_id ? data.leadById.get(c.lead_id) : null;
    const contact = lead?.contact_id ? data.contactById.get(lead.contact_id) : null;
    return contact?.full_name || phoneOf(c);
  };

  const rows: InboxRow[] = useMemo(
    () =>
      data.inbox.map((item) => {
        const c = item.conversation;
        const lead = c.lead_id ? data.leadById.get(c.lead_id) : undefined;
        const contact = lead?.contact_id ? data.contactById.get(lead.contact_id) : undefined;
        return {
          item,
          state: conversationState(item),
          stage: conversationStage(item, data.oppById, data.leadById),
          name: contact?.full_name || phoneOf(c),
          phone: phoneOf(c),
          product: [lead?.product_interest, lead?.capacity].filter(Boolean).join(' · '),
          ownerId: lead?.owner_profile_id ?? null,
        };
      }),
    [data.inbox, data.leadById, data.contactById, data.oppById],
  );
  const counts = useMemo(() => countByState(rows), [rows]);
  const visible = useMemo(() => sortRows(filterRows(rows, filters)), [rows, filters]);
  const campaigns = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.item.campaign) m.set(r.item.campaign.campaign_id, r.item.campaign.campaign_name);
    return [...m.entries()];
  }, [rows]);
  const active = filters.state !== 'ALL' || filters.stage !== 'ALL' || filters.origin !== 'ALL' || filters.owner !== '' || filters.q !== '';
  const set = (patch: Partial<InboxFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setShown(PAGE_SIZE);
  };

  async function load(id: string) {
    setSelected(id);
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/inbox/${id}`, { cache: 'no-store' });
      if (res.ok) setDetail((await res.json()) as Detail);
    } catch {
      actions.notify('No se pudo abrir la conversación.', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Llegar desde una campaña u "Hoy": abre ese chat; sin chat puntual, filtra los que esperan vendedor.
  useEffect(() => {
    if (!focus) return;
    if (focus.id) void load(focus.id);
    else set({ ...EMPTY_FILTERS, state: 'WAITING_SELLER' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  if (data.inbox.length === 0) {
    return (
      <Card>
        <Empty title="Todavía no hay conversaciones" hint="Cuando un cliente escriba al WhatsApp de NIUPACK, NIUPACKBOT lo atiende y la conversación aparece acá." />
      </Card>
    );
  }

  const stateOptions = [
    { key: 'ALL' as const, label: 'Todas', count: rows.length },
    ...STATE_ORDER.filter((s) => counts[s] > 0 || s === 'WAITING_SELLER' || s === 'WITH_BOT').map((s) => ({ key: s, label: STATE_META[s].label, count: counts[s] })),
  ];
  const selectCls = 'rounded-lg border border-slate-800 bg-[#0c0f14] px-3 py-2 text-sm text-slate-300 focus:border-brand-500 focus:outline-none';
  const selectedRow = rows.find((r) => r.item.conversation.id === selected);
  const closeDetail = () => {
    setSelected(null);
    setDetail(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<InboxFilters['state']> value={filters.state} onChange={(state) => set({ state })} options={stateOptions} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Buscar por cliente, teléfono, producto o mensaje"
            className="w-full rounded-lg border border-slate-800 bg-[#0c0f14] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select value={filters.stage} onChange={(e) => set({ stage: e.target.value as InboxFilters['stage'] })} className={selectCls} aria-label="Filtrar por avance">
          <option value="ALL">Todos los avances</option>
          {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
        </select>
        <select value={filters.origin} onChange={(e) => set({ origin: e.target.value })} className={selectCls} aria-label="Filtrar por origen">
          <option value="ALL">Cualquier origen</option>
          <option value="DIRECT">Mensaje directo</option>
          {campaigns.map(([id, name]) => <option key={id} value={id}>Campaña: {name}</option>)}
        </select>
        <select value={filters.owner} onChange={(e) => set({ owner: e.target.value })} className={selectCls} aria-label="Filtrar por responsable">
          <option value="">Todo el equipo</option>
          {data.owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
        </select>
        {active && (
          <button onClick={() => set(EMPTY_FILTERS)} className="text-sm font-medium text-slate-400 hover:text-white">
            Limpiar
          </button>
        )}
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <Empty title="Ninguna conversación con estos filtros" action={<Button variant="outline" size="sm" onClick={() => set(EMPTY_FILTERS)}>Limpiar filtros</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500">
                  <th className="px-5 py-3 text-left font-medium">Cliente</th>
                  <th className="px-3 py-3 text-center font-medium">Producto</th>
                  <th className="px-3 py-3 text-center font-medium">Avance</th>
                  <th className="px-3 py-3 text-center font-medium">Estado</th>
                  <th className="px-3 py-3 text-center font-medium">Origen</th>
                  <th className="px-5 py-3 text-center font-medium">Actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {visible.slice(0, shown).map((r) => {
                  const c = r.item.conversation;
                  const st = STATE_META[r.state];
                  const sg = STAGE_META[r.stage];
                  const waiting = r.state === 'WAITING_SELLER';
                  const last = r.item.last_message;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => void load(c.id)}
                      className={`cursor-pointer hover:bg-slate-800/20 ${selected === c.id ? 'bg-slate-800/40' : ''} ${waiting ? 'shadow-[inset_3px_0_0_#f59e0b]' : ''}`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-100">{r.name}</p>
                        {r.name !== r.phone && <p className="text-xs tabular-nums text-slate-500">{r.phone}</p>}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-3 text-center text-slate-300">{r.product || <span className="text-slate-600">—</span>}</td>
                      <td className="px-3 py-3 text-center"><Pill tone={sg.tone}>{sg.label}</Pill></td>
                      <td className="px-3 py-3 text-center"><Pill tone={st.tone} dot>{st.label}</Pill></td>
                      <td className="max-w-[170px] truncate px-3 py-3 text-center text-xs text-slate-400">{r.item.campaign ? r.item.campaign.campaign_name : 'Directo'}</td>
                      <td className={`px-5 py-3 text-center text-xs tabular-nums ${waiting ? 'font-semibold text-amber-400' : 'text-slate-500'}`}>{timeAgo(last?.at ?? c.last_message_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {visible.length > shown && (
          <button onClick={() => setShown((n) => n + PAGE_SIZE)} className="w-full border-t border-slate-800 px-5 py-3 text-sm font-medium text-slate-400 hover:text-white">
            Mostrar más ({visible.length - shown} restantes)
          </button>
        )}
      </Card>
      <p className="text-xs text-slate-600">
        {visible.length} {visible.length === 1 ? 'conversación' : 'conversaciones'}
        {active ? ` de ${rows.length}` : ''} · las que esperan vendedor van primero
      </p>

      {selected && (
        <Drawer width="max-w-6xl" onClose={closeDetail}>
          <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="truncate text-lg font-semibold text-white">{selectedRow?.name ?? 'Conversación'}</h2>
              {selectedRow && <Pill tone={STATE_META[selectedRow.state].tone} dot>{STATE_META[selectedRow.state].label}</Pill>}
            </div>
            <DrawerClose onClose={closeDetail} />
          </header>
          <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Chat detail={selected === detail?.conversation.id ? detail : null} loading={loading} data={data} actions={actions} nameFor={nameFor} onRefresh={() => void load(selected)} />
            <LeadPanel detail={selected === detail?.conversation.id ? detail : null} data={data} actions={actions} onRefresh={() => void load(selected)} />
          </div>
        </Drawer>
      )}
    </div>
  );
}


function Chat({
  detail,
  loading,
  data,
  actions,
  nameFor,
  onRefresh,
}: {
  detail: Detail | null;
  loading: boolean;
  data: CrmData;
  actions: CrmActions;
  nameFor: (c: ConvRow) => string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = detail?.messages[detail.messages.length - 1]?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [detail?.conversation.id, lastId]);
  if (!detail) {
    return (
      <Card className="grid place-items-center p-8 text-center">
        <div>
          <MessageSquareText className="mx-auto h-6 w-6 text-slate-600" />
          <p className="mt-3 text-sm text-slate-400">{loading ? 'Cargando conversación…' : 'Elegí una conversación'}</p>
        </div>
      </Card>
    );
  }
  const c = detail.conversation;
  const human = c.control_mode === 'HUMAN';
  const company = detail.lead360?.company?.name;

  async function setControl(control: 'BOT' | 'HUMAN') {
    setBusy(true);
    try {
      await sendJson(`/api/crm/inbox/${c.id}/control`, 'POST', { control });
      actions.notify(control === 'HUMAN' ? 'Tomaste la conversación. NIUPACKBOT deja de responder.' : 'NIUPACKBOT vuelve a atender.');
      onRefresh();
      actions.reload();
    } catch {
      actions.notify('No se pudo cambiar quién atiende.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{nameFor(c)}</p>
          <p className="truncate text-xs text-slate-500">
            {[nameFor(c) !== phoneOf(c) ? phoneOf(c) : null, company, detail.campaign ? `Campaña: ${detail.campaign.campaign_name}` : null, human ? 'Atiende un vendedor' : 'Atiende NIUPACKBOT'].filter(Boolean).join(' · ')}
          </p>
        </div>
        {human ? (
          <Button variant="outline" size="sm" isLoading={busy} onClick={() => void setControl('BOT')}>
            <Bot className="h-3.5 w-3.5" /> Devolver al bot
          </Button>
        ) : (
          <Button variant="primary" size="sm" isLoading={busy} onClick={() => void setControl('HUMAN')}>
            <UserRound className="h-3.5 w-3.5" /> Tomar conversación
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#0e1218] px-5 py-4">
        {detail.messages.length === 0 && <p className="py-8 text-center text-xs text-slate-600">Sin mensajes.</p>}
        {detail.messages.map((m) => {
          const inbound = m.direction === 'INBOUND';
          const byHuman = m.author_role === 'HUMAN_AGENT';
          const byCampaign = m.author_role === 'SYSTEM';
          return (
            <div key={m.id} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${
                  inbound
                    ? 'rounded-bl-sm border border-slate-800 bg-[#141820]'
                    : byHuman
                      ? 'rounded-br-sm border border-amber-900/50 bg-amber-500/10'
                      : byCampaign
                        ? 'rounded-br-sm border border-dashed border-slate-600 bg-slate-800/50'
                        : 'rounded-br-sm border border-slate-700 bg-slate-800'
                }`}
              >
                {!inbound && <p className={`mb-0.5 text-[11px] font-medium ${byHuman ? 'text-amber-400' : 'text-slate-400'}`}>{byHuman ? 'Vendedor' : byCampaign ? 'Campaña (template enviado)' : 'NIUPACKBOT'}</p>}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{m.body}</p>
                <p className="mt-1 text-right text-[10px] text-slate-500">{timeAgo(m.occurred_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {human ? (
        <ReplyBox conversationId={c.id} messages={detail.messages} actions={actions} onSent={onRefresh} />
      ) : (
        <footer className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">NIUPACKBOT está atendiendo. Tomá la conversación si el cliente necesita a una persona.</footer>
      )}
    </Card>
  );
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Respuesta manual por WhatsApp. Texto libre solo dentro de las 24 h del último mensaje del cliente. */
function ReplyBox({ conversationId, messages, actions, onSent }: { conversationId: string; messages: Detail['messages']; actions: CrmActions; onSent: () => void }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'INBOUND');
  const open = Boolean(lastInbound) && Date.now() - new Date(lastInbound!.occurred_at).getTime() <= WINDOW_MS;

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    const r = await callApi(`/api/crm/inbox/${conversationId}/reply`, 'POST', { body: text.trim() });
    setSending(false);
    if (!r.ok) return actions.notify(errorMessage(r.error), 'error');
    setText('');
    onSent();
  }

  if (!open) {
    return (
      <footer className="border-t border-slate-800 px-5 py-3 text-xs text-amber-400">
        Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo permite enviar un template aprobado, no texto libre.
      </footer>
    );
  }
  return (
    <footer className="border-t border-slate-800 px-5 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder="Escribí tu respuesta… (Enter envía, Shift+Enter nueva línea)"
          className="min-h-[44px] flex-1 resize-none rounded-lg border border-slate-700 bg-[#0c0f14] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none"
        />
        <Button variant="primary" size="md" isLoading={sending} disabled={!text.trim()} onClick={() => void send()}>
          Enviar
        </Button>
      </div>
    </footer>
  );
}

function LeadPanel({ detail, data, actions, onRefresh }: { detail: Detail | null; data: CrmData; actions: CrmActions; onRefresh: () => void }) {
  const [owner, setOwner] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const conv = detail?.conversation;
  const lead = conv?.lead_id ? data.leadById.get(conv.lead_id) ?? detail?.lead360?.lead ?? null : null;

  useEffect(() => {
    setOwner(lead?.owner_profile_id ?? '');
    setCompany(lead?.company_id ?? '');
  }, [lead?.id, lead?.owner_profile_id, lead?.company_id]);

  if (!detail || !lead) {
    return (
      <Card className="p-5">
        <p className="text-sm font-semibold text-slate-100">Lo que entendió NIUPACKBOT</p>
        <p className="mt-2 text-xs text-slate-500">{detail ? 'Esta conversación todavía no generó un lead.' : 'Seleccioná una conversación.'}</p>
      </Card>
    );
  }

  const opps = data.opps.filter((o) => o.lead_id === lead.id || (conv?.opportunity_id && o.id === conv.opportunity_id));
  const linkedCompany = lead.company_id ? data.companyById.get(lead.company_id) : null;

  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    try {
      await fn();
      actions.notify(ok);
      actions.reload();
      onRefresh();
    } catch {
      actions.notify('No se pudo guardar.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const facts: Array<[string, string]> = [
    ['Origen', detail.campaign ? `Campaña “${detail.campaign.campaign_name}”` : 'Mensaje directo por WhatsApp'],
    ['Producto', [lead.product_interest, lead.capacity].filter(Boolean).join(' · ') || '—'],
    ['Volumen', fmtVolume(lead.estimated_volume, lead.volume_period)],
    ['Destino', [lead.destination_city, lead.destination_country].filter(Boolean).join(', ') || '—'],
  ];

  return (
    <Card className="flex min-h-0 flex-col overflow-y-auto">
      <div className="border-b border-slate-800 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100">Lo que entendió NIUPACKBOT</p>
          {lead.qualification && (
            <Pill tone={lead.qualification === 'HIGH' ? 'success' : lead.qualification === 'MEDIUM' ? 'warning' : 'neutral'}>
              Interés {label(QUALIFICATION_LABEL, lead.qualification).toLowerCase()}
            </Pill>
          )}
        </div>
        <dl className="mt-4 space-y-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="text-sm text-slate-100">{v}</dd>
            </div>
          ))}
          {lead.next_action && (
            <div>
              <dt className="text-xs text-slate-500">Próximo paso sugerido</dt>
              <dd className="text-sm text-slate-100">{lead.next_action} · {fmtDateLabel(lead.next_action_at)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs font-medium text-slate-400">Cuenta</p>
          {linkedCompany ? (
            <button onClick={() => actions.openAccount(linkedCompany.id)} className="mt-1 text-sm font-medium text-slate-100 underline-offset-2 hover:underline">
              {linkedCompany.name}
            </button>
          ) : (
            <div className="mt-1 flex gap-2">
              <select value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls}>
                <option value="">Vincular a una cuenta…</option>
                {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button
                variant="outline"
                size="sm"
                disabled={!company}
                isLoading={busy === 'company'}
                onClick={() => void run('company', async () => void (await sendJson(`/api/crm/leads/${lead.id}`, 'PATCH', { company_id: company })), 'Lead vinculado a la cuenta.')}
              >
                OK
              </Button>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400">Vendedor</p>
          <select
            value={owner}
            onChange={(e) => {
              const v = e.target.value;
              setOwner(v);
              if (v) void run('owner', async () => void (await sendJson(`/api/crm/leads/${lead.id}`, 'PATCH', { owner_profile_id: v })), `Asignado a ${ownerName(data.owners, v)}.`);
            }}
            className={`${inputCls} mt-1`}
          >
            <option value="">Sin asignar</option>
            {data.owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-400">Oportunidad</p>
          {opps.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {opps.map((o) => (
                <li key={o.id}>
                  <button onClick={() => actions.openOpp(o.id)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2 text-left hover:border-slate-600">
                    <span className="truncate text-sm text-slate-100">{o.title}</span>
                    <Pill>{STAGE_LABEL[o.stage] ?? o.stage}</Pill>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Button
              variant="primary"
              size="sm"
              className="mt-1 w-full"
              isLoading={busy === 'opp'}
              onClick={() =>
                void run(
                  'opp',
                  async () => {
                    const body = (await sendJson('/api/crm/opportunities', 'POST', { lead_id: lead.id })) as { opportunity?: { id: string } } | null;
                    if (body?.opportunity?.id) actions.openOpp(body.opportunity.id);
                  },
                  'Oportunidad creada desde el chat.',
                )
              }
            >
              Convertir en oportunidad
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => actions.newTask({ lead_id: lead.id, company_id: lead.company_id ?? undefined, title: 'Seguimiento por WhatsApp', task_type: 'WHATSAPP', assigned_to: lead.owner_profile_id ?? undefined })}
        >
          + Agendar seguimiento
        </Button>
      </div>
    </Card>
  );
}
