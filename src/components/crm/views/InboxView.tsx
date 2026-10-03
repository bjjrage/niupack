'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, MessageSquareText, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Card,
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

type Seg = 'all' | 'human' | 'bot';

interface Detail {
  conversation: ConvRow;
  messages: Array<{ id: string; direction: string; author_role: string; body: string; occurred_at: string }>;
  lead360?: { lead: LeadRow; company?: { id?: string; name?: string } | null; contact?: { full_name?: string; whatsapp_phone?: string } | null } | null;
  campaign?: ConversationCampaign | null;
}

const phoneOf = (c: ConvRow) => c.external_conversation_id.replace('whatsapp:', '');

export function InboxView({ data, actions, focus }: { data: CrmData; actions: CrmActions; focus: { id: string; n: number } | null }) {
  const [seg, setSeg] = useState<Seg>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);

  const items = useMemo(
    () =>
      data.inbox.filter((i) => (seg === 'human' ? i.conversation.control_mode === 'HUMAN' : seg === 'bot' ? i.conversation.control_mode !== 'HUMAN' : true)),
    [data.inbox, seg],
  );

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

  // Llegar desde una campaña: abre ese chat, o filtra los que esperan vendedor si no hay uno puntual.
  useEffect(() => {
    if (!focus) return;
    if (focus.id) {
      setSeg('all');
      void load(focus.id);
    } else {
      setSeg('human');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  // Abre la primera conversación que espera a un vendedor (o la primera) al entrar.
  useEffect(() => {
    if (selected || focus?.id || data.inbox.length === 0) return;
    const first = data.inbox.find((i) => i.conversation.control_mode === 'HUMAN') ?? data.inbox[0];
    void load(first.conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.inbox.length]);

  const nameFor = (c: ConvRow): string => {
    const lead = c.lead_id ? data.leadById.get(c.lead_id) : null;
    const contact = lead?.contact_id ? data.contactById.get(lead.contact_id) : null;
    return contact?.full_name || phoneOf(c);
  };

  if (data.inbox.length === 0) {
    return (
      <Card>
        <Empty title="Todavía no hay conversaciones" hint="Cuando un cliente escriba al WhatsApp de NIUPACK, NIUPACKBOT lo atiende y la conversación aparece acá." />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:h-[calc(100vh-240px)] lg:min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)_320px]">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-slate-800 p-3">
          <Segmented<Seg>
            value={seg}
            onChange={setSeg}
            options={[
              { key: 'all', label: 'Todas' },
              { key: 'human', label: 'Vendedor', count: data.inbox.filter((i) => i.conversation.control_mode === 'HUMAN').length },
              { key: 'bot', label: 'Bot' },
            ]}
          />
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-slate-800/60 overflow-y-auto">
          {items.map(({ conversation: c, lead: l, campaign }) => {
            const human = c.control_mode === 'HUMAN';
            return (
              <li key={c.id}>
                <button
                  onClick={() => void load(c.id)}
                  className={`flex w-full gap-3 px-4 py-3 text-left transition ${selected === c.id ? 'bg-slate-800/50' : 'hover:bg-slate-800/20'}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${human ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">{nameFor(c)}</span>
                      <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(c.last_message_at)}</span>
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {l?.product_interest || 'Consulta general'}
                      {l?.qualification ? ` · interés ${label(QUALIFICATION_LABEL, l.qualification).toLowerCase()}` : ''}
                    </span>
                    {campaign && <span className="mt-0.5 block truncate text-[11px] text-slate-600">Campaña: {campaign.campaign_name}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Chat detail={selected === detail?.conversation.id ? detail : null} loading={loading} data={data} actions={actions} nameFor={nameFor} onRefresh={() => selected && void load(selected)} />

      <LeadPanel detail={selected === detail?.conversation.id ? detail : null} data={data} actions={actions} onRefresh={() => selected && void load(selected)} />
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
    <Card className="flex min-h-[480px] flex-col overflow-hidden">
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
