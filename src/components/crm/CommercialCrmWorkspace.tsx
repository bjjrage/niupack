'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Building2,
  Columns3,
  Inbox,
  ListTodo,
  MessageSquareText,
  Sparkles,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';

type View = 'dashboard' | 'pipeline' | 'accounts' | 'inbox' | 'tasks';

const views: Array<{ key: View; label: string; icon: typeof Users }> = [
  { key: 'dashboard', label: 'Dashboard', icon: Sparkles },
  { key: 'pipeline', label: 'Pipeline', icon: Columns3 },
  { key: 'accounts', label: 'Empresas', icon: Building2 },
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'tasks', label: 'Tareas', icon: ListTodo },
];

const STAGES = ['NUEVO', 'CONTACTADO', 'CALIFICADO', 'COTIZACIÓN', 'NEGOCIACIÓN', 'GANADO', 'PERDIDO'] as const;

interface DashboardData {
  leads_total: number;
  opportunities_open: number;
  in_quote: number;
  in_negotiation: number;
  won_total: number;
  tasks_overdue: number;
  conversations_active: number;
  persistence?: string;
}

function useCrmFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP_${res.status}`);
      }
      const body = (await res.json()) as T & { persistence?: string };
      setData(body);
      if (body && typeof body === 'object' && 'persistence' in body) setPersistence(String((body as { persistence?: string }).persistence ?? ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, persistence };
}

function fmtVolume(v: number | null | undefined): string {
  if (v == null) return '—';
  return Number(v).toLocaleString('es-PY');
}

export function CommercialCrmWorkspace() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [selectedLead360, setSelectedLead360] = useState<string | null>(null);
  const [taskModal, setTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const dash = useCrmFetch<DashboardData & { persistence?: string }>('/api/crm/dashboard');
  const leadsQ = useCrmFetch<{ leads: Array<Record<string, never> & { id: string; product_interest?: string; capacity?: string; estimated_volume?: number; destination_city?: string; intent?: string; qualification?: string; status?: string }> }>('/api/crm/leads');
  const oppsQ = useCrmFetch<{ opportunities: Array<{ id: string; title: string; stage: string; product_interest?: string; estimated_volume?: number; destination_city?: string; lead_id?: string }> }>('/api/crm/opportunities');
  const tasksQ = useCrmFetch<{ tasks: Array<{ id: string; title: string; status: string; priority: string; due_at?: string; lead_id?: string; opportunity_id?: string }> }>('/api/crm/tasks');
  const inboxQ = useCrmFetch<{ inbox: Array<{ conversation: { id: string; external_conversation_id: string; control_mode: string; status: string; lead_id?: string; last_message_at?: string }; lead?: { product_interest?: string; qualification?: string } | null }> }>('/api/crm/inbox');
  const companiesQ = useCrmFetch<{ companies: Array<{ id: string; name: string; country_code?: string; city?: string; phone?: string }>; contacts: Array<{ id: string; full_name: string; whatsapp_phone?: string; company_id?: string }> }>('/api/crm/companies');
  const convDetail = useCrmFetch<{
    conversation: { id: string; control_mode: string; external_conversation_id: string; lead_id?: string };
    messages: Array<{ id: string; direction: string; author_role: string; body: string; occurred_at: string }>;
    activities: Array<{ id: string; type: string; title?: string; body?: string; occurred_at: string }>;
    lead360?: {
      lead: { id: string; product_interest?: string; capacity?: string; material?: string; printing?: string; estimated_volume?: number; destination_city?: string; destination_country?: string; intent?: string; qualification?: string; status?: string; owner_profile_id?: string; next_action?: string };
      company?: { name?: string } | null;
      contact?: { full_name?: string; whatsapp_phone?: string } | null;
      opportunities?: Array<{ id: string; title: string; stage: string }>;
      tasks?: Array<{ id: string; title: string; status: string }>;
    } | null;
  }>(selectedConv ? `/api/crm/inbox/${selectedConv}` : null);
  const lead360Q = useCrmFetch<{
    lead: { id: string; product_interest?: string; capacity?: string; material?: string; printing?: string; estimated_volume?: number; volume_period?: string; destination_city?: string; destination_country?: string; country_code?: string; intent?: string; qualification?: string; status?: string; owner_profile_id?: string; next_action?: string };
    company?: { name?: string } | null;
    contact?: { full_name?: string; whatsapp_phone?: string; email?: string } | null;
    opportunities: Array<{ id: string; title: string; stage: string }>;
    tasks: Array<{ id: string; title: string; status: string }>;
    activities: Array<{ id: string; type: string; title?: string; occurred_at: string }>;
  }>(selectedLead360 ? `/api/crm/leads/${selectedLead360}/360` : null);

  const oppsByStage = useMemo(() => {
    const map = new Map<string, Array<{ id: string; title: string; stage: string; product_interest?: string; estimated_volume?: number; destination_city?: string; lead_id?: string }>>();
    for (const s of STAGES) map.set(s, []);
    for (const o of oppsQ.data?.opportunities ?? []) {
      const arr = map.get(o.stage) ?? map.get('NUEVO')!;
      arr.push(o);
    }
    return map;
  }, [oppsQ.data]);

  async function moveStage(id: string, stage: string) {
    setActionMsg(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error('STAGE_CHANGE_FAILED');
      await oppsQ.reload();
      await dash.reload();
    } catch {
      setActionMsg('No se pudo mover la oportunidad.');
    }
  }

  async function completeTask(id: string) {
    try {
      const res = await fetch(`/api/crm/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DONE' }),
      });
      if (!res.ok) throw new Error('TASK_UPDATE_FAILED');
      await tasksQ.reload();
      await dash.reload();
    } catch {
      setActionMsg('No se pudo completar la tarea.');
    }
  }

  async function createTask() {
    if (!taskTitle.trim()) return;
    try {
      const res = await fetch('/api/crm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: taskTitle.trim(), source: 'CRM_UI' }),
      });
      if (!res.ok) throw new Error('TASK_CREATE_FAILED');
      setTaskTitle('');
      setTaskModal(false);
      await tasksQ.reload();
      await dash.reload();
    } catch {
      setActionMsg('No se pudo crear la tarea.');
    }
  }

  const persistenceBadge = dash.persistence || dash.data?.persistence || '—';

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold uppercase text-brand-400">Commercial CRM</span>
            <Badge variant="brand" size="sm">V1</Badge>
            <Badge variant="neutral" size="sm">NIUPACKBOT · {persistenceBadge}</Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Ventas & Conversaciones NIUPACK</h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            CRM nativo de NIUPACK OS. Misma identidad visual, misma densidad operativa. Sin dependencia productiva de AutoLeadBot.
          </p>
          {actionMsg && <p className="mt-2 text-[11px] text-amber-400">{actionMsg}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => { void dash.reload(); void leadsQ.reload(); void oppsQ.reload(); void tasksQ.reload(); void inboxQ.reload(); void companiesQ.reload(); }}>
          Recargar
        </Button>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-[#11161d] p-2">
        {views.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`inline-flex items-center gap-2 rounded px-3 py-2 text-xs font-medium transition ${
              view === key
                ? 'bg-brand-500/15 text-white ring-1 ring-brand-800/70'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      <div className="rounded-lg border border-brand-900/40 bg-brand-950/10 p-4">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
          <div>
            <p className="text-xs font-semibold text-slate-200">NIUPACKBOT interno · WhatsApp → CRM Service → Pipeline</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              El bot sugiere y califica; el CRM decide owner, etapa, valor y next action. Endpoint: POST /api/niupackbot/whatsapp.
            </p>
          </div>
        </div>
      </div>

      {view === 'dashboard' && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Leads', dash.data?.leads_total ?? (dash.loading ? '…' : 0), dash.error ? `Error: ${dash.error}` : 'Total leads del tenant'],
              ['Conversaciones activas', dash.data?.conversations_active ?? (dash.loading ? '…' : 0), 'Inbox / WhatsApp'],
              ['Oportunidades abiertas', dash.data?.opportunities_open ?? (dash.loading ? '…' : 0), `Cotización ${dash.data?.in_quote ?? 0} · Negociación ${dash.data?.in_negotiation ?? 0}`],
              ['Tareas vencidas', dash.data?.tasks_overdue ?? (dash.loading ? '…' : 0), `Ganadas ${dash.data?.won_total ?? 0}`],
            ].map(([label, value, note]) => (
              <div key={label as string} className="rounded-lg border border-slate-800 bg-[#141820] p-4">
                <p className="text-xs font-medium text-slate-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
                <p className="mt-2 text-[11px] text-slate-500">{note}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <section className="rounded-lg border border-slate-800 bg-[#141820] p-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-semibold text-white">Pipeline comercial</h2>
                <p className="mt-1 text-[11px] text-slate-500">Persistente por tenant. Sin drag & drop en V1; usar acciones en Pipeline.</p>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 xl:grid-cols-7">
                {STAGES.map((stage) => (
                  <div key={stage} className="rounded border border-slate-800 bg-[#0c0f14] p-3">
                    <p className="text-[10px] font-mono text-slate-500">{stage}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{oppsByStage.get(stage)?.length ?? 0}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-[#141820]">
              <div className="flex items-center gap-2 border-b border-slate-800 p-4">
                <MessageSquareText className="h-4 w-4 text-brand-400" />
                <h2 className="text-sm font-semibold text-white">Últimas conversaciones</h2>
              </div>
              {inboxQ.loading ? (
                <p className="p-6 text-center text-[11px] text-slate-500">Cargando…</p>
              ) : (inboxQ.data?.inbox ?? []).length === 0 ? (
                <div className="grid min-h-[180px] place-items-center p-8 text-center">
                  <div className="max-w-md">
                    <Inbox className="mx-auto h-6 w-6 text-brand-400" />
                    <h3 className="mt-3 text-sm font-semibold text-white">Sin conversaciones</h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">Vacío real, no demo. Conectá WhatsApp a /api/niupackbot/whatsapp.</p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-slate-800/60">
                  {(inboxQ.data?.inbox ?? []).slice(0, 6).map(({ conversation, lead }) => (
                    <li key={conversation.id}>
                      <button
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-800/30"
                        onClick={() => { setSelectedConv(conversation.id); setView('inbox'); }}
                      >
                        <span className="text-xs text-slate-200">{conversation.external_conversation_id.replace('whatsapp:', '')}</span>
                        <span className="flex items-center gap-2">
                          <Badge variant={conversation.control_mode === 'HUMAN' ? 'warning' : 'neutral'} size="sm">{conversation.control_mode}</Badge>
                          {lead?.qualification && <Badge variant="brand" size="sm">{lead.qualification}</Badge>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {view === 'pipeline' && (
        <div className="overflow-x-auto pb-3">
          <div className="grid min-w-[1250px] grid-cols-7 gap-3">
            {STAGES.map((stage) => (
              <section key={stage} className="rounded-lg border border-slate-800 bg-[#0f1319]">
                <header className="flex items-center justify-between border-b border-slate-800 px-3 py-3">
                  <span className="text-[11px] font-semibold text-slate-300">{stage}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">{oppsByStage.get(stage)?.length ?? 0}</span>
                </header>
                <div className="space-y-2 p-2">
                  {(oppsByStage.get(stage) ?? []).length === 0 && <p className="py-6 text-center text-[11px] text-slate-600">Sin oportunidades</p>}
                  {(oppsByStage.get(stage) ?? []).map((o) => (
                    <div key={o.id} className="rounded border border-slate-800 bg-[#141820] p-2.5">
                      <p className="text-xs font-medium text-white">{o.title}</p>
                      <p className="mt-1 text-[11px] tabular-nums text-slate-400">
                        {[o.product_interest, o.estimated_volume ? fmtVolume(o.estimated_volume) : null, o.destination_city].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => { const i = STAGES.indexOf(stage as (typeof STAGES)[number]); if (i > 0) void moveStage(o.id, STAGES[i - 1]); }} disabled={stage === 'NUEVO'}>←</Button>
                        <Button variant="outline" size="sm" onClick={() => { const i = STAGES.indexOf(stage as (typeof STAGES)[number]); if (i < STAGES.length - 1) void moveStage(o.id, STAGES[i + 1]); }} disabled={stage === 'PERDIDO'}>→</Button>
                        {o.lead_id && <Button variant="ghost" size="sm" onClick={() => setSelectedLead360(o.lead_id!)}>360</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {view === 'accounts' && (
        <div className="space-y-5">
          <section className="rounded-lg border border-slate-800 bg-[#141820]">
            <header className="border-b border-slate-800 p-4">
              <h2 className="text-sm font-semibold text-white">Empresas & Leads</h2>
              <p className="mt-1 text-[11px] text-slate-500">Una vista, tres entidades relacionadas. Detalle contextual, sin tabs globales.</p>
            </header>
            <div className="p-4">
              <DataTable
                columns={[
                  { key: 'name', header: 'Empresa' },
                  { key: 'country_code', header: 'País' },
                  { key: 'city', header: 'Ciudad' },
                  { key: 'phone', header: 'Teléfono' },
                ]}
                data={(companiesQ.data?.companies ?? []).map((c) => ({ ...c, country_code: c.country_code ?? '—', city: c.city ?? '—', phone: c.phone ?? '—' }))}
                emptyMessage={companiesQ.loading ? 'Cargando…' : 'Sin empresas — vacío real.'}
              />
            </div>
          </section>
          <section className="rounded-lg border border-slate-800 bg-[#141820]">
            <div className="p-4">
              <DataTable
                columns={[
                  { key: 'product_interest', header: 'Producto' },
                  { key: 'capacity', header: 'Capacidad' },
                  { key: 'estimated_volume', header: 'Volumen', align: 'right', render: (r: { estimated_volume?: number }) => fmtVolume(r.estimated_volume) },
                  { key: 'destination_city', header: 'Destino' },
                  { key: 'intent', header: 'Intent' },
                  { key: 'qualification', header: 'Calif.', render: (r: { qualification?: string }) => <Badge variant={r.qualification === 'HIGH' ? 'success' : r.qualification === 'MEDIUM' ? 'warning' : 'neutral'} size="sm">{r.qualification ?? '—'}</Badge> },
                  { key: 'status', header: 'Estado' },
                ]}
                data={(leadsQ.data?.leads ?? []).map((l) => ({ ...l, product_interest: l.product_interest || '—', capacity: l.capacity || '—', destination_city: l.destination_city || '—', intent: l.intent || '—', status: l.status || '—' }))}
                emptyMessage={leadsQ.loading ? 'Cargando…' : 'Sin leads — vacío real.'}
                actions={(row: { id: string }) => <Button variant="ghost" size="sm" onClick={() => setSelectedLead360(row.id)}>360</Button>}
              />
            </div>
          </section>
        </div>
      )}

      {view === 'inbox' && (
        <div className="grid min-h-[620px] gap-4 lg:grid-cols-[340px_1fr_320px]">
          <section className="rounded-lg border border-slate-800 bg-[#141820]">
            <header className="border-b border-slate-800 p-3">
              <h2 className="text-xs font-semibold text-white">Conversaciones</h2>
            </header>
            {(inboxQ.data?.inbox ?? []).length === 0 ? (
              <div className="grid min-h-[280px] place-items-center p-8 text-center">
                <div className="max-w-md">
                  <Inbox className="mx-auto h-6 w-6 text-brand-400" />
                  <h3 className="mt-3 text-sm font-semibold text-white">Inbox vacío</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">Vacío real. Las conversaciones llegan desde NIUPACKBOT.</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/60">
                {(inboxQ.data?.inbox ?? []).map(({ conversation, lead }) => (
                  <li key={conversation.id}>
                    <button
                      onClick={() => setSelectedConv(conversation.id)}
                      className={`flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-slate-800/30 ${selectedConv === conversation.id ? 'bg-brand-500/10' : ''}`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-200">{conversation.external_conversation_id.replace('whatsapp:', '')}</span>
                        <Badge variant={conversation.control_mode === 'HUMAN' ? 'warning' : 'neutral'} size="sm">{conversation.control_mode}</Badge>
                      </span>
                      <span className="text-[11px] text-slate-500">{lead?.product_interest ?? 'Sin lead'} · {lead?.qualification ?? '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-[#141820]">
            <header className="border-b border-slate-800 p-4">
              <p className="text-sm font-semibold text-white">Conversación {convDetail.data ? `· ${convDetail.data.conversation.control_mode}` : ''}</p>
            </header>
            {!selectedConv ? (
              <div className="grid min-h-[280px] place-items-center p-8 text-center">
                <div className="max-w-md">
                  <MessageSquareText className="mx-auto h-6 w-6 text-brand-400" />
                  <h3 className="mt-3 text-sm font-semibold text-white">Seleccioná una conversación</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">El historial se renderiza acá con datos reales.</p>
                </div>
              </div>
            ) : convDetail.loading ? (
              <p className="p-6 text-center text-[11px] text-slate-500">Cargando…</p>
            ) : (
              <ul className="space-y-2 p-4">
                {(convDetail.data?.messages ?? []).map((m) => (
                  <li key={m.id} className={`max-w-[85%] rounded border p-2.5 ${m.direction === 'INBOUND' ? 'border-slate-800 bg-[#0c0f14]' : 'ml-auto border-brand-900/40 bg-brand-950/20'}`}>
                    <p className="text-[10px] font-mono text-slate-500">{m.author_role} · {new Date(m.occurred_at).toLocaleString()}</p>
                    <p className="mt-1 text-xs text-slate-200">{m.body}</p>
                  </li>
                ))}
                {(convDetail.data?.messages ?? []).length === 0 && <p className="py-8 text-center text-[11px] text-slate-600">Sin mensajes</p>}
              </ul>
            )}
          </section>

          <aside className="rounded-lg border border-slate-800 bg-[#141820] p-4">
            <h2 className="text-xs font-semibold text-white">Lead 360°</h2>
            {!convDetail.data?.lead360 ? (
              <div className="mt-4 space-y-4">
                {['Contacto', 'Empresa', 'Producto', 'Volumen', 'Etapa', 'Owner', 'Next action'].map((label) => (
                  <div key={label} className="border-b border-slate-800/70 pb-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
                    <p className="mt-1 text-xs text-slate-500">—</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-xs">
                <Row label="Contacto" value={convDetail.data.lead360.contact?.full_name ?? '—'} />
                <Row label="Empresa" value={convDetail.data.lead360.company?.name ?? '—'} />
                <Row label="Producto" value={`${convDetail.data.lead360.lead.product_interest ?? '—'} ${convDetail.data.lead360.lead.capacity ?? ''}`} />
                <Row label="Volumen" value={convDetail.data.lead360.lead.estimated_volume ? fmtVolume(convDetail.data.lead360.lead.estimated_volume) : '—'} />
                <Row label="Destino" value={convDetail.data.lead360.lead.destination_city ?? '—'} />
                <Row label="Intent" value={convDetail.data.lead360.lead.intent ?? '—'} />
                <Row label="Calificación" value={convDetail.data.lead360.lead.qualification ?? '—'} />
                <Row label="Pipeline" value={(convDetail.data.lead360.opportunities?.[0]?.stage ?? convDetail.data.lead360.lead.status ?? '—')} />
              </div>
            )}
          </aside>
        </div>
      )}

      {view === 'tasks' && (
        <section className="rounded-lg border border-slate-800 bg-[#141820]">
          <header className="flex items-center justify-between gap-3 border-b border-slate-800 p-4">
            <div className="flex items-center gap-3">
              <ListTodo className="h-5 w-5 text-brand-400" />
              <div>
                <h2 className="text-sm font-semibold text-white">Tareas comerciales</h2>
                <p className="mt-1 text-xs text-slate-500">Owner, vencimiento y estado. Origen humano o NIUPACKBOT.</p>
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={() => setTaskModal(true)}>Nueva tarea</Button>
          </header>
          <div className="p-4">
            <DataTable
              columns={[
                { key: 'title', header: 'Tarea' },
                { key: 'status', header: 'Estado', render: (r: { status: string }) => <Badge variant={r.status === 'DONE' ? 'success' : r.status === 'PENDING' ? 'warning' : 'neutral'} size="sm">{r.status}</Badge> },
                { key: 'priority', header: 'Prioridad' },
                { key: 'due_at', header: 'Vence', render: (r: { due_at?: string }) => (r.due_at ? new Date(r.due_at).toLocaleDateString() : '—') },
              ]}
              data={(tasksQ.data?.tasks ?? []).map((t) => ({ ...t, priority: t.priority ?? '—' }))}
              emptyMessage={tasksQ.loading ? 'Cargando…' : 'Sin tareas — vacío real.'}
              actions={(row: { id: string; status: string }) => (
                row.status !== 'DONE' ? <Button variant="outline" size="sm" onClick={() => void completeTask(row.id)}>Completar</Button> : <span className="text-[11px] text-slate-600">—</span>
              )}
            />
          </div>
        </section>
      )}

      <Modal isOpen={taskModal} onClose={() => setTaskModal(false)} title="Nueva tarea" description="CRUD mínimo V1.">
        <input
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          placeholder="Ej.: Llamar a cliente Curitiba por 500k vasos 12 oz"
          className="w-full rounded border border-slate-700/80 bg-[#0c0f14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setTaskModal(false)}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={() => void createTask()}>Crear</Button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(selectedLead360)} onClose={() => setSelectedLead360(null)} title="Lead 360°" description="Detalle contextual. No es un tab global." maxWidth="2xl">
        {lead360Q.loading ? (
          <p className="text-xs text-slate-500">Cargando…</p>
        ) : !lead360Q.data ? (
          <p className="text-xs text-slate-500">No encontrado.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 text-xs">
              <Row label="Contacto" value={`${lead360Q.data.contact?.full_name ?? '—'} ${lead360Q.data.contact?.whatsapp_phone ? `· ${lead360Q.data.contact.whatsapp_phone}` : ''}`} />
              <Row label="Empresa" value={lead360Q.data.company?.name ?? '—'} />
              <Row label="País" value={lead360Q.data.lead.country_code ?? lead360Q.data.lead.destination_country ?? '—'} />
              <Row label="Producto" value={lead360Q.data.lead.product_interest ?? '—'} />
              <Row label="Capacidad" value={lead360Q.data.lead.capacity ?? '—'} />
              <Row label="Material" value={lead360Q.data.lead.material ?? '—'} />
              <Row label="Impresión" value={lead360Q.data.lead.printing ?? '—'} />
              <Row label="Volumen" value={lead360Q.data.lead.estimated_volume ? `${fmtVolume(lead360Q.data.lead.estimated_volume)} / ${lead360Q.data.lead.volume_period ?? ''}` : '—'} />
              <Row label="Destino" value={lead360Q.data.lead.destination_city ?? '—'} />
              <Row label="Intent" value={lead360Q.data.lead.intent ?? '—'} />
              <Row label="Calificación" value={lead360Q.data.lead.qualification ?? '—'} />
              <Row label="Next action" value={lead360Q.data.lead.next_action ?? '—'} />
            </div>
            <div className="space-y-3 text-xs">
              <h4 className="font-semibold text-white">Oportunidades</h4>
              {(lead360Q.data.opportunities ?? []).length === 0 && <p className="text-slate-500">Sin oportunidades.</p>}
              {(lead360Q.data.opportunities ?? []).map((o) => (
                <p key={o.id} className="text-slate-300">{o.title} · <span className="font-mono text-slate-500">{o.stage}</span></p>
              ))}
              <h4 className="pt-2 font-semibold text-white">Timeline</h4>
              {(lead360Q.data.activities ?? []).slice(0, 12).map((a) => (
                <p key={a.id} className="text-slate-400"><span className="font-mono text-[10px] text-slate-500">{a.type}</span> · {a.title ?? ''}</p>
              ))}
              {(lead360Q.data.activities ?? []).length === 0 && <p className="text-slate-500">Sin actividad.</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-800/70 pb-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 text-xs text-slate-200">{value}</p>
    </div>
  );
}
