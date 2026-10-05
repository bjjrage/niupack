'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Pause, Play, RotateCcw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, Drawer, DrawerClose, Empty, fmtDateLabel, ownerName, Pill, Segmented, timeAgo } from '../commercial-ui';
import type { CampaignRecipient, OutreachTemplate } from '@/lib/niupackbot/outreach/types';
import type { CampaignSummary } from '@/lib/niupackbot/outreach/campaigns';
import type { CrmActions, CrmData } from '../types';
import { callApi } from './api';
import { CAMPAIGN_STATUS, errorMessage, LANGUAGE_LABEL, recipientError, RECIPIENT_STATUS } from './labels';

type Filter = 'all' | 'PENDING' | 'REPLIED' | 'HUMAN' | 'FAILED' | 'OPT_OUT';
const PAGE = 100;
const POLL_MS = 15_000;

type Detail = { campaign: CampaignSummary & { template: OutreachTemplate | null }; recipients: CampaignRecipient[] };

export function CampaignDrawer({ campaignId, data, actions, onClose, onChanged }: { campaignId: string; data: CrmData; actions: CrmActions; onClose: () => void; onChanged: () => void }) {
  const [campaign, setCampaign] = useState<Detail['campaign'] | null>(null);
  const [rows, setRows] = useState<CampaignRecipient[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const load = useCallback(
    async (append = false, offset = 0) => {
      const f = filterRef.current;
      const r = await callApi<Detail>(`/api/crm/campaigns/${campaignId}?limit=${PAGE}&offset=${offset}${f === 'all' ? '' : `&status=${f}`}`, 'GET');
      if (!r.ok) return setError(r.error);
      setCampaign(r.data.campaign);
      setRows((prev) => (append ? [...prev, ...r.data.recipients] : r.data.recipients));
      setHasMore(r.data.recipients.length === PAGE);
    },
    [campaignId],
  );

  useEffect(() => {
    void load();
  }, [load, filter]);

  // Mientras la campaña envía, este panel hace avanzar la cola (un lote por tick) y se refresca.
  const live = campaign?.status === 'RUNNING' || campaign?.status === 'SCHEDULED';
  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      await callApi(`/api/niupackbot/campaigns/process?campaignId=${campaignId}`, 'POST');
      await load();
      onChanged();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [live, campaignId, load, onChanged]);

  async function act(action: 'launch' | 'pause' | 'resume' | 'cancel' | 'retry_failed', confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    const r = await callApi(`/api/crm/campaigns/${campaignId}/action`, 'POST', { action });
    setBusy(null);
    if (!r.ok) return actions.notify(errorMessage(r.error), 'error');
    actions.notify({ launch: 'Campaña lanzada.', pause: 'Campaña pausada.', resume: 'Campaña reanudada.', cancel: 'Campaña cancelada.', retry_failed: 'Fallidos puestos en cola de nuevo.' }[action]);
    await load();
    onChanged();
  }

  if (!campaign) {
    return (
      <Drawer onClose={onClose} width="max-w-4xl">
        <div className="grid flex-1 place-items-center p-10 text-sm text-slate-500">{error ? errorMessage(error) : 'Cargando campaña…'}</div>
      </Drawer>
    );
  }

  const c = campaign.counters;
  const st = CAMPAIGN_STATUS[campaign.status];
  const tplOk = campaign.template_status === 'APPROVED';
  const pct = (n: number) => (c.total > 0 ? `${Math.round((n / c.total) * 100)}%` : '—');
  const done = c.total - c.pending;

  return (
    <Drawer onClose={onClose} width="max-w-4xl">
      <header className="border-b border-slate-800 px-6 pb-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">
              Campaña · {campaign.template_name ?? 'template eliminado'}
              {campaign.template ? ` · ${LANGUAGE_LABEL[campaign.template.language]}` : ''}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="truncate text-xl font-semibold text-white">{campaign.name}</h2>
              <Pill tone={st.tone} dot>{st.label}</Pill>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Creada {timeAgo(campaign.created_at)} por {ownerName(data.owners, campaign.created_by)} · {campaign.send_rate_per_min} msj/min
              {campaign.status === 'SCHEDULED' && campaign.scheduled_at ? ` · sale ${fmtDateLabel(campaign.scheduled_at)} ${new Date(campaign.scheduled_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          </div>
          <DrawerClose onClose={onClose} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {campaign.status === 'DRAFT' && (
            <Button variant="primary" size="md" isLoading={busy === 'launch'} disabled={!tplOk || c.pending === 0} onClick={() => void act('launch', `Se enviará un WhatsApp a ${c.pending} contactos. ¿Lanzar la campaña?`)}>
              <Play className="h-4 w-4" /> Lanzar a {c.pending}
            </Button>
          )}
          {(campaign.status === 'RUNNING' || campaign.status === 'SCHEDULED') && (
            <Button variant="secondary" size="md" isLoading={busy === 'pause'} onClick={() => void act('pause')}>
              <Pause className="h-4 w-4" /> Pausar
            </Button>
          )}
          {campaign.status === 'PAUSED' && (
            <Button variant="primary" size="md" isLoading={busy === 'resume'} disabled={!tplOk} onClick={() => void act('resume')}>
              <Play className="h-4 w-4" /> Reanudar
            </Button>
          )}
          {c.failed > 0 && campaign.status !== 'CANCELLED' && (
            <Button variant="outline" size="md" isLoading={busy === 'retry_failed'} disabled={!tplOk} onClick={() => void act('retry_failed', `Se reintentará el envío a ${c.failed} contactos que fallaron. Los de “Envío incierto” pudieron haber recibido el mensaje: verificá antes. ¿Continuar?`)}>
              <RotateCcw className="h-4 w-4" /> Reintentar {c.failed} fallidos
            </Button>
          )}
          {['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED'].includes(campaign.status) && (
            <Button variant="ghost" size="md" isLoading={busy === 'cancel'} onClick={() => void act('cancel', 'Se cancela la campaña y no se envía nada más. No se puede deshacer. ¿Cancelar?')}>
              <XCircle className="h-4 w-4" /> Cancelar campaña
            </Button>
          )}
        </div>
        {!tplOk && ['DRAFT', 'PAUSED'].includes(campaign.status) && (
          <p className="mt-3 text-sm text-amber-400">El template está “{(campaign.template_status ?? 'sin estado').toLowerCase()}”: hasta que WhatsApp lo apruebe no se puede enviar.</p>
        )}
        {live && <p className="mt-3 text-xs text-slate-500">Enviando. Esta pantalla avanza la cola cada 15 s mientras esté abierta.</p>}
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <Card className="p-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: c.total ? `${(done / c.total) * 100}%` : '0%' }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            <span className="tabular-nums text-slate-300">{done}</span> de <span className="tabular-nums text-slate-300">{c.total}</span> procesados
            {c.pending > 0 ? ` · ${c.pending} pendientes` : ''}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-6">
            <Stat k="Enviados" v={c.sent} sub={pct(c.sent)} />
            <Stat k="Entregados" v={c.delivered} sub={pct(c.delivered)} />
            <Stat k="Leídos" v={c.read} sub={pct(c.read)} />
            <Stat k="Respondieron" v={c.replied} sub={pct(c.replied)} tone="success" />
            <Stat k="Requieren vendedor" v={c.human} sub={pct(c.human)} tone={c.human > 0 ? 'warning' : undefined} />
            <Stat k="Fallidos" v={c.failed} sub={c.optOut + c.noInterest > 0 ? `${c.optOut} baja · ${c.noInterest} no interesa` : pct(c.failed)} tone={c.failed > 0 ? 'danger' : undefined} />
          </dl>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { key: 'all', label: 'Todos', count: c.total },
              { key: 'PENDING', label: 'Pendientes', count: c.pending },
              { key: 'REPLIED', label: 'Respondieron' },
              { key: 'HUMAN', label: 'Vendedor', count: c.human },
              { key: 'FAILED', label: 'Fallidos', count: c.failed },
              { key: 'OPT_OUT', label: 'Bajas', count: c.optOut },
            ]}
          />
        </div>

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <Empty title="Nadie en este filtro" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Contacto</th>
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                    <th className="px-3 py-2.5 font-medium">Último movimiento</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {rows.map((r) => {
                    const rs = RECIPIENT_STATUS[r.status];
                    const company = r.company_id ? data.companyById.get(r.company_id)?.name : null;
                    const last = r.replied_at ?? r.read_at ?? r.delivered_at ?? r.sent_at ?? r.failed_at;
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5">
                          <p className="text-slate-100">{r.name}</p>
                          <p className="text-xs text-slate-500">
                            <span className="tabular-nums">{r.phone_e164}</span>
                            {company ? ` · ${company}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <Pill tone={rs.tone} dot>{rs.label}</Pill>
                          {r.last_error && r.status === 'FAILED' && <p className="mt-1 max-w-[220px] text-xs text-red-400">{recipientError(r.last_error)}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{last ? timeAgo(last) : '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          {r.conversation_id && (
                            <Button variant="ghost" size="sm" onClick={() => { onClose(); actions.openConversation(r.conversation_id!); }}>
                              <MessageSquare className="h-3.5 w-3.5" /> Chat
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && (
            <button onClick={() => void load(true, rows.length)} className="w-full border-t border-slate-800 px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-white">
              Cargar más
            </button>
          )}
        </Card>
      </div>
    </Drawer>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: number; sub: string; tone?: 'success' | 'warning' | 'danger' }) {
  const color = tone === 'success' ? 'text-emerald-400' : tone === 'warning' ? 'text-amber-400' : tone === 'danger' ? 'text-red-400' : 'text-white';
  return (
    <div className="niu-kpi min-w-0 rounded-md">
      <dt className="truncate text-xs text-slate-500">{k}</dt>
      <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{v}</dd>
      <dd className="truncate text-[11px] text-slate-600">{sub}</dd>
    </div>
  );
}
