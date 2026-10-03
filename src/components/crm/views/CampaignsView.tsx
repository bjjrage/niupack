'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, Empty, fmtDateLabel, ownerName, Pill, Segmented, timeAgo, useCrmFetch } from '../commercial-ui';
import type { CampaignSummary } from '@/lib/niupackbot/outreach/campaigns';
import type { CrmActions, CrmData } from '../types';
import { callApi } from '../campaigns/api';
import { CampaignDrawer } from '../campaigns/CampaignDrawer';
import { CampaignWizard } from '../campaigns/CampaignWizard';
import { CAMPAIGN_STATUS } from '../campaigns/labels';
import { TemplatesPanel } from '../campaigns/TemplatesPanel';

type Filter = 'all' | 'active' | 'draft' | 'done';

const ACTIVE = ['RUNNING', 'SCHEDULED', 'PAUSED'];
const DONE = ['COMPLETED', 'CANCELLED'];

/** Campañas de WhatsApp (outbound). Las respuestas entran a Conversaciones y NIUPACKBOT las atiende. */
export function CampaignsView({ data, actions }: { data: CrmData; actions: CrmActions }) {
  const q = useCrmFetch<{ campaigns: CampaignSummary[] }>('/api/crm/campaigns');
  const [filter, setFilter] = useState<Filter>('all');
  const [wizard, setWizard] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const campaigns = useMemo(() => q.data?.campaigns ?? [], [q.data]);

  // Si hay campañas enviando y el detalle está cerrado, esta vista avanza la cola.
  const running = campaigns.some((c) => c.status === 'RUNNING' || c.status === 'SCHEDULED');
  useEffect(() => {
    if (!running || openId) return;
    const id = setInterval(async () => {
      await callApi('/api/niupackbot/campaigns/process', 'POST');
      await q.reload();
    }, 20_000);
    return () => clearInterval(id);
  }, [running, openId, q]);

  const counts = useMemo(
    () => ({
      all: campaigns.length,
      active: campaigns.filter((c) => ACTIVE.includes(c.status)).length,
      draft: campaigns.filter((c) => c.status === 'DRAFT').length,
      done: campaigns.filter((c) => DONE.includes(c.status)).length,
    }),
    [campaigns],
  );
  const visible = campaigns.filter((c) => filter === 'all' || (filter === 'active' && ACTIVE.includes(c.status)) || (filter === 'draft' && c.status === 'DRAFT') || (filter === 'done' && DONE.includes(c.status)));
  const needSeller = campaigns.reduce((a, c) => a + c.counters.human, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'all', label: 'Todas', count: counts.all },
            { key: 'active', label: 'Activas', count: counts.active },
            { key: 'draft', label: 'Borradores', count: counts.draft },
            { key: 'done', label: 'Finalizadas', count: counts.done },
          ]}
        />
        {needSeller > 0 && (
          <button onClick={() => actions.openConversation('')} className="text-sm text-amber-400 hover:text-amber-300">
            {needSeller} {needSeller === 1 ? 'contacto espera' : 'contactos esperan'} a un vendedor →
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="md" onClick={() => setTemplates(true)}>
            <FileText className="h-4 w-4" /> Templates
          </Button>
          <Button variant="primary" size="md" onClick={() => setWizard(true)}>
            <Plus className="h-4 w-4" /> Nueva campaña
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <Empty
            title={q.loading ? 'Cargando campañas…' : filter === 'all' ? 'Todavía no hay campañas' : 'Ninguna campaña en este filtro'}
            hint={q.loading || filter !== 'all' ? undefined : 'Una campaña manda un primer WhatsApp con un template aprobado. Cuando el contacto responde, NIUPACKBOT lo atiende y te lo pasa si pide precio o una persona.'}
            action={!q.loading && filter === 'all' ? <Button variant="primary" size="sm" onClick={() => setWizard(true)}><Plus className="h-3.5 w-3.5" /> Crear la primera campaña</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500">
                  <th className="px-5 py-3 font-medium">Campaña</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 text-right font-medium">Destinatarios</th>
                  <th className="px-3 py-3 text-right font-medium">Entregados</th>
                  <th className="px-3 py-3 text-right font-medium">Respondieron</th>
                  <th className="px-3 py-3 text-right font-medium">Vendedor</th>
                  <th className="px-5 py-3 font-medium">Creada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {visible.map((c) => {
                  const st = CAMPAIGN_STATUS[c.status];
                  const pct = (n: number) => (c.counters.sent > 0 ? `${Math.round((n / c.counters.sent) * 100)}%` : '');
                  return (
                    <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer hover:bg-slate-800/20">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-100">{c.name}</p>
                        <p className="text-xs text-slate-500">{c.template_name ?? 'Template eliminado'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={st.tone} dot>{st.label}</Pill>
                        {c.status === 'DRAFT' && c.template_status && c.template_status !== 'APPROVED' && <p className="mt-1 text-xs text-amber-400">Template sin aprobar</p>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-200">
                        {c.counters.total}
                        {c.counters.pending > 0 && c.status !== 'DRAFT' && <span className="block text-xs text-slate-500">{c.counters.pending} pendientes</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-300">
                        {c.counters.delivered}
                        <span className="block text-xs text-slate-500">{pct(c.counters.delivered)}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-300">
                        {c.counters.replied}
                        <span className="block text-xs text-slate-500">{pct(c.counters.replied)}</span>
                      </td>
                      <td className={`px-3 py-3 text-right tabular-nums ${c.counters.human > 0 ? 'font-semibold text-amber-400' : 'text-slate-500'}`}>{c.counters.human}</td>
                      <td className="px-5 py-3 text-xs text-slate-400">
                        {fmtDateLabel(c.created_at)}
                        <span className="block text-slate-600">{ownerName(data.owners, c.created_by)} · {timeAgo(c.created_at)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {wizard && (
        <CampaignWizard
          data={data}
          actions={actions}
          onClose={() => setWizard(false)}
          onCreated={(id) => {
            setWizard(false);
            void q.reload();
            setOpenId(id);
          }}
        />
      )}
      {templates && <TemplatesPanel actions={actions} onClose={() => setTemplates(false)} onChanged={() => void q.reload()} />}
      {openId && <CampaignDrawer campaignId={openId} data={data} actions={actions} onClose={() => { setOpenId(null); void q.reload(); }} onChanged={() => void q.reload()} />}
    </div>
  );
}
