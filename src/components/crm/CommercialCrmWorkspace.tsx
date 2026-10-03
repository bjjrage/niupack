'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Columns3,
  Inbox,
  ListTodo,
  MessageSquareText,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Funnel, MarketDonut, StageBars, WonLost } from './charts';
import { Avatar, fmtDateLabel, fmtMoney, isOverdue, ownerName, timeAgo, type OwnerRef } from './commercial-ui';
import { Account360, type AccountInfo } from './Account360';
import { Opportunity360, type Opp360 } from './Opportunity360';

type View = 'dashboard' | 'pipeline' | 'accounts' | 'inbox' | 'tasks';

const views: Array<{ key: View; label: string; icon: typeof Users; hint?: string }> = [
  { key: 'dashboard', label: 'Dashboard', icon: Sparkles },
  { key: 'pipeline', label: 'Pipeline', icon: Columns3 },
  { key: 'accounts', label: 'Clientes & Prospectos', icon: Building2 },
  { key: 'inbox', label: 'Conversaciones', icon: Inbox, hint: 'WhatsApp · NIUPACKBOT' },
  { key: 'tasks', label: 'Tareas', icon: ListTodo },
];

const ACTIVE = ['NUEVO', 'CONTACTADO', 'CALIFICADO', 'COTIZACIÓN', 'NEGOCIACIÓN'] as const;
const TASK_TYPES = ['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'QUOTE', 'OTHER'] as const;

interface Opp extends Opp360 {
  owner_profile_id?: string | null;
  updated_at?: string;
  currency?: string | null;
}
interface LeadRow {
  id: string;
  company_id?: string | null;
  contact_id?: string | null;
  product_interest?: string | null;
  capacity?: string | null;
  estimated_volume?: number | null;
  volume_period?: string | null;
  destination_city?: string | null;
  destination_country?: string | null;
  intent?: string | null;
  qualification?: string | null;
  status?: string | null;
  owner_profile_id?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  updated_at?: string;
}
interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  task_type?: string | null;
  due_at?: string | null;
  lead_id?: string | null;
  opportunity_id?: string | null;
  company_id?: string | null;
  assigned_to?: string | null;
}
interface ConvRow {
  id: string;
  external_conversation_id: string;
  control_mode: string;
  status: string;
  lead_id?: string | null;
  opportunity_id?: string | null;
  contact_id?: string | null;
  last_message_at?: string | null;
}
interface CompanyRow extends AccountInfo {
  updated_at?: string;
}
interface ContactRow {
  id: string;
  full_name: string;
  whatsapp_phone?: string | null;
  email?: string | null;
  company_id?: string | null;
}
interface SalesDash {
  pipeline_open_count: number;
  pipeline_open_value: number;
  quotes_count: number;
  quotes_value: number;
  negotiation_count: number;
  negotiation_value: number;
  won_month_count: number;
  won_month_value: number;
  weighted_forecast: number;
  won_count: number;
  lost_count: number;
  leads_total: number;
  market_breakdown: Array<{ market: string; count: number; value: number }>;
  stage_breakdown: Array<{ stage: string; count: number; value: number }>;
  activity_recent: Array<{ id: string; type: string; title?: string | null; occurred_at: string }>;
  attention_items: Array<{ kind: string; label: string; detail?: string | null; ref_id?: string | null }>;
}

function useCrmFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      setData((await res.json()) as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loading, error, reload };
}

export function CommercialCrmWorkspace() {
  const [view, setView] = useState<View>('dashboard');
  const [opp360Id, setOpp360Id] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const dash = useCrmFetch<SalesDash>('/api/crm/dashboard');
  const oppsQ = useCrmFetch<{ opportunities: Opp[] }>('/api/crm/opportunities');
  const leadsQ = useCrmFetch<{ leads: LeadRow[] }>('/api/crm/leads');
  const tasksQ = useCrmFetch<{ tasks: TaskRow[] }>('/api/crm/tasks');
  const inboxQ = useCrmFetch<{ inbox: Array<{ conversation: ConvRow; lead?: { product_interest?: string; qualification?: string } | null }> }>('/api/crm/inbox');
  const companiesQ = useCrmFetch<{ companies: CompanyRow[]; contacts: ContactRow[] }>('/api/crm/companies');
  const ownersQ = useCrmFetch<{ owners: OwnerRef[] }>('/api/crm/owners');

  const owners = ownersQ.data?.owners ?? [];
  const opps = oppsQ.data?.opportunities ?? [];
  const leads = leadsQ.data?.leads ?? [];
  const tasks = tasksQ.data?.tasks ?? [];
  const companies = companiesQ.data?.companies ?? [];
  const contacts = companiesQ.data?.contacts ?? [];

  const reloadAll = useCallback(() => {
    void dash.reload();
    void oppsQ.reload();
    void leadsQ.reload();
    void tasksQ.reload();
    void inboxQ.reload();
    void companiesQ.reload();
    void ownersQ.reload();
  }, [dash, oppsQ, leadsQ, tasksQ, inboxQ, companiesQ, ownersQ]);

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const oppById = useMemo(() => new Map(opps.map((o) => [o.id, o])), [opps]);

  const opp360: Opp | null = opp360Id ? (oppById.get(opp360Id) ?? null) : null;
  const account: CompanyRow | null = accountId ? (companyById.get(accountId) ?? null) : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Ventas</h1>
          <p className="mt-1 text-xs text-slate-400">Pipeline, clientes y conversaciones en un solo lugar.</p>
          {msg && <p className="mt-2 text-[11px] text-amber-400">{msg}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={reloadAll}>Actualizar</Button>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-[#11161d] p-2">
        {views.map(({ key, label, icon: Icon, hint }) => (
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
            {hint && view !== key && <span className="hidden text-[10px] text-slate-600 xl:inline">{hint}</span>}
          </button>
        ))}
      </nav>

      {view === 'dashboard' && (
        <DashboardView dash={dash.data} loading={dash.loading} onGoPipeline={() => setView('pipeline')} />
      )}

      {view === 'pipeline' && (
        <PipelineView
          opps={opps}
          leads={leads}
          owners={owners}
          companyById={companyById}
          contactById={contactById}
          leadById={leadById}
          forecast={dash.data?.weighted_forecast ?? 0}
          onOpenOpp={setOpp360Id}
          onChanged={reloadAll}
          setMsg={setMsg}
        />
      )}

      {view === 'accounts' && (
        <AccountsView
          companies={companies}
          contacts={contacts}
          opps={opps}
          leads={leads}
          tasks={tasks}
          owners={owners}
          loading={companiesQ.loading}
          onOpenAccount={setAccountId}
          onOpenOpp={setOpp360Id}
          onChanged={reloadAll}
          setMsg={setMsg}
        />
      )}

      {view === 'inbox' && (
        <InboxView
          inboxQ={inboxQ}
          owners={owners}
          companyById={companyById}
          contactById={contactById}
          leadById={leadById}
          oppById={oppById}
          onOpenOpp={setOpp360Id}
          onChanged={reloadAll}
          setMsg={setMsg}
        />
      )}

      {view === 'tasks' && (
        <TasksView
          tasks={tasks}
          owners={owners}
          companyById={companyById}
          oppById={oppById}
          loading={tasksQ.loading}
          onChanged={reloadAll}
          setMsg={setMsg}
        />
      )}

      {opp360 && (
        <Opportunity360
          opp={opp360}
          companyName={opp360.company_id ? companyById.get(opp360.company_id)?.name : null}
          contactName={opp360.contact_id ? contactById.get(opp360.contact_id)?.full_name : null}
          owners={owners}
          onClose={() => setOpp360Id(null)}
          onChanged={reloadAll}
        />
      )}

      {account && (
        <Account360
          account={account}
          contacts={contacts.filter((c) => c.company_id === account.id)}
          opportunities={opps.filter((o) => o.company_id === account.id)}
          tasks={tasks.filter((t) => t.company_id === account.id)}
          activities={[]}
          conversations={(inboxQ.data?.inbox ?? []).filter((i) => i.conversation.lead_id && leadById.get(i.conversation.lead_id!)?.company_id === account.id).map((i) => ({ id: i.conversation.id, external_conversation_id: i.conversation.external_conversation_id, control_mode: i.conversation.control_mode }))}
          owners={owners}
          onClose={() => setAccountId(null)}
          onChanged={reloadAll}
          onOpenOpportunity={(id) => {
            setAccountId(null);
            setOpp360Id(id);
          }}
        />
      )}
    </div>
  );
}

/* ================= DASHBOARD ================= */

function Kpi({ label, count, value, sub }: { label: string; count: number; value: number; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#141820] p-4 md:p-5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-bold tabular-nums tracking-tight text-white">{count}</span>
        <span className="text-sm font-semibold tabular-nums text-brand-400">{fmtMoney(value)}</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

function Panel({ title, sub, children, className = '' }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-800 bg-[#141820] p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DashboardView({ dash, loading, onGoPipeline }: { dash: SalesDash | null; loading: boolean; onGoPipeline: () => void }) {
  if (loading && !dash) return <p className="p-8 text-center text-xs text-slate-500">Cargando panel…</p>;
  const d = dash;
  const funnel = d
    ? [
        { label: 'Leads', value: d.leads_total },
        { label: 'Contactados', value: d.stage_breakdown.find((s) => s.stage === 'CONTACTADO')?.count ?? 0 },
        { label: 'Calificados', value: d.stage_breakdown.find((s) => s.stage === 'CALIFICADO')?.count ?? 0 },
        { label: 'Cotizaciones', value: d.quotes_count },
        { label: 'Negociación', value: d.negotiation_count },
        { label: 'Ganadas', value: d.won_count },
      ]
    : [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Pipeline abierto" count={d?.pipeline_open_count ?? 0} value={d?.pipeline_open_value ?? 0} sub={`Pronóstico ponderado: ${fmtMoney(d?.weighted_forecast ?? 0)}`} />
        <Kpi label="Cotizaciones abiertas" count={d?.quotes_count ?? 0} value={d?.quotes_value ?? 0} sub="Etapa COTIZACIÓN" />
        <Kpi label="Negociaciones" count={d?.negotiation_count ?? 0} value={d?.negotiation_value ?? 0} sub="Etapa NEGOCIACIÓN" />
        <Kpi label="Ganadas este mes" count={d?.won_month_count ?? 0} value={d?.won_month_value ?? 0} sub="Cierres del mes actual" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Valor del pipeline por etapa" sub="Cantidad y monto por etapa activa">
          <StageBars data={d?.stage_breakdown ?? []} />
          <button onClick={onGoPipeline} className="mt-3 text-[11px] font-medium text-brand-400 hover:text-brand-300">
            Ver pipeline →
          </button>
        </Panel>
        <Panel title="Embudo comercial" sub="De lead a cierre">
          <Funnel steps={funnel} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Pipeline por mercado" sub="Oportunidades abiertas por destino">
          <MarketDonut data={d?.market_breakdown ?? []} />
        </Panel>
        <Panel title="Ganadas vs perdidas" sub="Período actual">
          <WonLost won={d?.won_count ?? 0} lost={d?.lost_count ?? 0} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Actividad comercial reciente" sub="Últimos movimientos del equipo">
          {(d?.activity_recent ?? []).length === 0 ? (
            <p className="py-4 text-center text-[11px] text-slate-600">Todavía no hay movimientos.</p>
          ) : (
            <ul className="space-y-2">
              {(d?.activity_recent ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-[11px]">
                  <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">{a.type}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300">{a.title || '—'}</span>
                  <span className="shrink-0 text-slate-600">{timeAgo(a.occurred_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Requiere atención" sub="Lo urgente primero">
          {(d?.attention_items ?? []).length === 0 ? (
            <p className="py-4 text-center text-[11px] text-slate-600">Nada pendiente. Buen trabajo.</p>
          ) : (
            <ul className="space-y-2">
              {(d?.attention_items ?? []).map((a, i) => (
                <li key={`${a.kind}-${a.ref_id ?? i}`} className="flex items-center gap-2 rounded border border-amber-900/40 bg-amber-950/10 px-2.5 py-2 text-[11px]">
                  <span className="shrink-0 rounded bg-amber-900/40 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                    {a.kind === 'OVERDUE_TASK' ? 'VENCIDA' : a.kind === 'MISSING_NEXT_ACTION' ? 'SIN ACCIÓN' : a.kind === 'HUMAN_PENDING' ? 'HUMANO' : 'ESTANCADA'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-200">{a.label}</span>
                  {a.detail && <span className="shrink-0 text-slate-500">{a.detail.length > 16 ? fmtDateLabel(a.detail) : a.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ================= PIPELINE ================= */

function OppCard({
  opp,
  company,
  contact,
  qualification,
  owners,
  onOpen,
}: {
  opp: Opp;
  company?: string | null;
  contact?: string | null;
  qualification?: string | null;
  owners: OwnerRef[];
  onOpen: () => void;
}) {
  const overdue = isOverdue(opp.next_action_at) && !!opp.next_action;
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg border border-slate-800 bg-[#141820] p-3 text-left transition hover:border-slate-600"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-white">{company || contact || opp.title}</p>
        {qualification && (
          <Badge variant={qualification === 'HIGH' ? 'success' : qualification === 'MEDIUM' ? 'warning' : 'neutral'} size="sm">
            {qualification}
          </Badge>
        )}
      </div>
      {contact && company && <p className="mt-0.5 truncate text-[11px] text-slate-500">{contact}</p>}
      <p className="mt-1.5 truncate text-[11px] text-slate-400">
        {[opp.product_interest, opp.capacity].filter(Boolean).join(' · ') || '—'}
      </p>
      <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
        {opp.estimated_volume ? `${Number(opp.estimated_volume).toLocaleString('es-PY')}${opp.volume_period ? ` / ${opp.volume_period}` : ''}` : 'Volumen sin definir'}
        {opp.destination_city ? ` · ${opp.destination_city}` : ''}
      </p>
      <p className="mt-1.5 text-sm font-bold tabular-nums text-white">{fmtMoney(opp.estimated_value, opp.currency ?? 'USD')}</p>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800/70 pt-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
          <Avatar name={ownerName(owners, opp.owner_profile_id)} size="sm" />
          <span className="truncate">{ownerName(owners, opp.owner_profile_id)}</span>
        </span>
        <span className={`shrink-0 text-[11px] ${overdue ? 'font-semibold text-amber-400' : 'text-slate-500'}`}>
          {opp.next_action ? `${opp.next_action} · ${fmtDateLabel(opp.next_action_at)}` : 'Sin próxima acción'}
        </span>
      </div>
    </button>
  );
}

function PipelineView({
  opps,
  owners,
  companyById,
  contactById,
  leadById,
  forecast,
  onOpenOpp,
  onChanged,
  setMsg,
}: {
  opps: Opp[];
  leads: LeadRow[];
  owners: OwnerRef[];
  companyById: Map<string, CompanyRow>;
  contactById: Map<string, ContactRow>;
  leadById: Map<string, LeadRow>;
  forecast: number;
  onOpenOpp: (id: string) => void;
  onChanged: () => void;
  setMsg: (m: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const [ownerF, setOwnerF] = useState('');
  const [marketF, setMarketF] = useState('');
  const [productF, setProductF] = useState('');
  const [historic, setHistoric] = useState<'GANADO' | 'PERDIDO' | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newOwner, setNewOwner] = useState('');

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return opps.filter((o) => {
      if (ownerF && (o.owner_profile_id ?? '') !== ownerF) return false;
      if (marketF && (o.destination_country ?? '') !== marketF) return false;
      if (productF && !(o.product_interest ?? '').toLowerCase().includes(productF.toLowerCase())) return false;
      if (!t) return true;
      const hay = `${o.title} ${o.product_interest ?? ''} ${o.destination_city ?? ''} ${companyById.get(o.company_id ?? '')?.name ?? ''}`.toLowerCase();
      return hay.includes(t);
    });
  }, [opps, q, ownerF, marketF, productF, companyById]);

  const active = filtered.filter((o) => (ACTIVE as readonly string[]).includes(o.stage));
  const won = opps.filter((o) => o.stage === 'GANADO');
  const lost = opps.filter((o) => o.stage === 'PERDIDO');
  const openValue = active.reduce((a, o) => a + (o.estimated_value ?? 0), 0);
  const markets = useMemo(() => [...new Set(opps.map((o) => o.destination_country).filter(Boolean))] as string[], [opps]);
  const products = useMemo(() => [...new Set(opps.map((o) => o.product_interest).filter(Boolean))] as string[], [opps]);

  async function createOpp() {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch('/api/crm/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          company_id: newCompany || null,
          estimated_value: newValue.trim() === '' ? null : Number(newValue),
          owner_profile_id: newOwner || null,
        }),
      });
      if (!res.ok) throw new Error('CREATE_FAILED');
      setNewTitle('');
      setNewCompany('');
      setNewValue('');
      setNewOwner('');
      setNewOpen(false);
      onChanged();
    } catch {
      setMsg('No se pudo crear la oportunidad.');
    }
  }

  const list = historic ? filtered.filter((o) => o.stage === historic) : active;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <button
          onClick={() => setHistoric(historic === 'GANADO' ? null : 'GANADO')}
          className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${historic === 'GANADO' ? 'border-emerald-700 bg-emerald-950/20' : 'border-slate-800 bg-[#141820] hover:border-slate-600'}`}
        >
          <Trophy className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="text-xs text-slate-300">Ganadas <strong className="tabular-nums text-white">{won.length}</strong></span>
          <span className="ml-auto text-xs font-semibold tabular-nums text-emerald-400">{fmtMoney(won.reduce((a, o) => a + (o.estimated_value ?? 0), 0))}</span>
        </button>
        <button
          onClick={() => setHistoric(historic === 'PERDIDO' ? null : 'PERDIDO')}
          className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${historic === 'PERDIDO' ? 'border-red-800 bg-red-950/20' : 'border-slate-800 bg-[#141820] hover:border-slate-600'}`}
        >
          <span className="text-xs text-slate-300">Perdidas <strong className="tabular-nums text-white">{lost.length}</strong></span>
          <span className="ml-auto text-xs font-semibold tabular-nums text-slate-400">{fmtMoney(lost.reduce((a, o) => a + (o.estimated_value ?? 0), 0))}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-[#11161d] p-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar oportunidad, cliente, producto…"
            className="w-full rounded border border-slate-700/80 bg-[#0c0f14] py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select value={ownerF} onChange={(e) => setOwnerF(e.target.value)} className="rounded border border-slate-700/80 bg-[#0c0f14] px-2 py-1.5 text-xs text-slate-300 focus:border-brand-500 focus:outline-none">
          <option value="">Todos los vendedores</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
        </select>
        <select value={marketF} onChange={(e) => setMarketF(e.target.value)} className="rounded border border-slate-700/80 bg-[#0c0f14] px-2 py-1.5 text-xs text-slate-300 focus:border-brand-500 focus:outline-none">
          <option value="">Todos los mercados</option>
          {markets.map((m) => <option key={m} value={m!}>{m}</option>)}
        </select>
        <select value={productF} onChange={(e) => setProductF(e.target.value)} className="rounded border border-slate-700/80 bg-[#0c0f14] px-2 py-1.5 text-xs text-slate-300 focus:border-brand-500 focus:outline-none">
          <option value="">Todos los productos</option>
          {products.map((p) => <option key={p} value={p!}>{p}</option>)}
        </select>
        <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nueva oportunidad
        </Button>
      </div>

      <p className="text-[11px] tabular-nums text-slate-500">
        Pipeline abierto: <span className="font-semibold text-slate-200">{fmtMoney(openValue)}</span>
        {' · '}Pronóstico ponderado: <span className="font-semibold text-brand-400">{fmtMoney(forecast)}</span>
      </p>

      {historic ? (
        <section className="rounded-lg border border-slate-800 bg-[#141820] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">{historic === 'GANADO' ? 'Histórico ganado' : 'Histórico perdido'} ({list.length})</h2>
            <Button variant="outline" size="sm" onClick={() => setHistoric(null)}>Volver al pipeline</Button>
          </div>
          {list.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-slate-600">Sin resultados.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {list.map((o) => (
                <OppCard
                  key={o.id}
                  opp={o}
                  company={o.company_id ? companyById.get(o.company_id)?.name : null}
                  contact={o.contact_id ? contactById.get(o.contact_id)?.full_name : null}
                  qualification={o.lead_id ? leadById.get(o.lead_id)?.qualification : null}
                  owners={owners}
                  onOpen={() => onOpenOpp(o.id)}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {ACTIVE.map((stage) => {
            const items = list.filter((o) => o.stage === stage);
            const val = items.reduce((a, o) => a + (o.estimated_value ?? 0), 0);
            return (
              <section key={stage} className="min-w-0 rounded-lg border border-slate-800 bg-[#0f1319]">
                <header className="border-b border-slate-800 px-2.5 py-2.5">
                  <p className="truncate text-[11px] font-semibold text-slate-200">{stage}</p>
                  <p className="mt-0.5 truncate text-[10px] tabular-nums text-slate-500">
                    {items.length} · {fmtMoney(val)}
                  </p>
                </header>
                <div className="max-h-[62vh] space-y-2 overflow-y-auto p-2">
                  {items.length === 0 && <p className="py-6 text-center text-[11px] text-slate-600">Sin oportunidades</p>}
                  {items.map((o) => (
                    <OppCard
                      key={o.id}
                      opp={o}
                      company={o.company_id ? companyById.get(o.company_id)?.name : null}
                      contact={o.contact_id ? contactById.get(o.contact_id)?.full_name : null}
                      qualification={o.lead_id ? leadById.get(o.lead_id)?.qualification : null}
                      owners={owners}
                      onOpen={() => onOpenOpp(o.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal isOpen={newOpen} onClose={() => setNewOpen(false)} title="Nueva oportunidad" description="Se crea en NUEVO.">
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Título (ej. Vasos 12 oz · Curitiba)" className="w-full rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={newCompany} onChange={(e) => setNewCompany(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none">
            <option value="">Sin cliente</option>
            {[...companyById.values()].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={newValue} onChange={(e) => setNewValue(e.target.value)} inputMode="decimal" placeholder="Valor USD" className="rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs tabular-nums text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
        </div>
        <select value={newOwner} onChange={(e) => setNewOwner(e.target.value)} className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none">
          <option value="">Sin responsable</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setNewOpen(false)}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={() => void createOpp()}>Crear</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ================= ACCOUNTS ================= */

function AccountsView({
  companies,
  contacts,
  opps,
  leads,
  tasks,
  owners,
  loading,
  onOpenAccount,
  onChanged,
  setMsg,
}: {
  companies: CompanyRow[];
  contacts: ContactRow[];
  opps: Opp[];
  leads: LeadRow[];
  tasks: TaskRow[];
  owners: OwnerRef[];
  loading: boolean;
  onOpenAccount: (id: string) => void;
  onOpenOpp: (id: string) => void;
  onChanged: () => void;
  setMsg: (m: string | null) => void;
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('BR');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [owner, setOwner] = useState('');

  const rows = useMemo(
    () =>
      companies.map((c) => {
        const co = opps.filter((o) => o.company_id === c.id);
        const open = co.filter((o) => o.stage !== 'GANADO' && o.stage !== 'PERDIDO');
        const main = contacts.find((x) => x.company_id === c.id) ?? null;
        const lastAct = co.reduce((a, o) => (o.updated_at && o.updated_at > a ? o.updated_at : a), c.updated_at ?? '');
        const next = open.filter((o) => o.next_action).sort((a, b) => (a.next_action_at ?? '').localeCompare(b.next_action_at ?? ''))[0];
        return {
          ...c,
          contactName: main?.full_name ?? '—',
          market: [c.country_code, c.city].filter(Boolean).join(' · ') || '—',
          oppCount: co.length,
          pipeline: open.reduce((a, o) => a + (o.estimated_value ?? 0), 0),
          ownerName: ownerName(owners, c.owner_profile_id),
          lastAct: lastAct || '—',
          nextLabel: next ? `${next.next_action} · ${fmtDateLabel(next.next_action_at)}` : '—',
        };
      }),
    [companies, contacts, opps, owners],
  );

  const orphans = useMemo(() => leads.filter((l) => !l.company_id), [leads]);

  async function createAccount() {
    if (!name.trim()) return;
    try {
      const res = await fetch('/api/crm/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), country_code: country, city: city.trim() || null, phone: phone.trim() || null, owner_profile_id: owner || null, lifecycle_stage: 'PROSPECT' }),
      });
      if (!res.ok) throw new Error('CREATE_FAILED');
      setName('');
      setCity('');
      setPhone('');
      setOwner('');
      setNewOpen(false);
      onChanged();
    } catch {
      setMsg('No se pudo crear el cliente.');
    }
  }

  async function assignLead(leadId: string, companyId: string) {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      });
      if (!res.ok) throw new Error('ASSIGN_FAILED');
      onChanged();
    } catch {
      setMsg('No se pudo asignar la empresa.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500">{rows.length} cuentas · {orphans.length} prospectos de WhatsApp sin empresa</p>
        <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nuevo cliente
        </Button>
      </div>

      <section className="rounded-lg border border-slate-800 bg-[#141820]">
        <div className="p-3">
          <DataTable
            columns={[
              { key: 'name', header: 'Cuenta', render: (r: { name: string }) => <span className="font-medium text-white">{r.name}</span> },
              {
                key: 'lifecycle_stage',
                header: 'Estado',
                render: (r: { lifecycle_stage?: string | null }) => (
                  <Badge variant={r.lifecycle_stage === 'CUSTOMER' ? 'success' : 'brand'} size="sm">{r.lifecycle_stage || 'PROSPECT'}</Badge>
                ),
              },
              { key: 'contactName', header: 'Contacto principal' },
              { key: 'market', header: 'Mercado' },
              { key: 'oppCount', header: 'Oportunidades', align: 'right', render: (r: { oppCount: number }) => <span className="tabular-nums">{r.oppCount}</span> },
              { key: 'pipeline', header: 'Pipeline', align: 'right', render: (r: { pipeline: number }) => <span className="tabular-nums text-white">{fmtMoney(r.pipeline)}</span> },
              { key: 'ownerName', header: 'Responsable', render: (r: { ownerName: string }) => <span className="inline-flex items-center gap-1.5"><Avatar name={r.ownerName} size="sm" />{r.ownerName}</span> },
              { key: 'lastAct', header: 'Última actividad', render: (r: { lastAct: string }) => (r.lastAct.length > 10 ? timeAgo(r.lastAct) : r.lastAct) },
              { key: 'nextLabel', header: 'Próxima acción' },
            ]}
            data={rows}
            emptyMessage={loading ? 'Cargando…' : 'Sin clientes/prospectos'}
            actions={(row: { id: string }) => <Button variant="ghost" size="sm" onClick={() => onOpenAccount(row.id)}>Abrir</Button>}
          />
        </div>
        {rows.length === 0 && !loading && (
          <div className="flex justify-center border-t border-slate-800 p-4">
            <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>+ Nuevo cliente</Button>
          </div>
        )}
      </section>

      {orphans.length > 0 && (
        <section className="rounded-lg border border-slate-800 bg-[#141820]">
          <header className="border-b border-slate-800 p-3">
            <h2 className="text-xs font-semibold text-white">Prospectos de WhatsApp sin empresa ({orphans.length})</h2>
          </header>
          <ul className="divide-y divide-slate-800/60">
            {orphans.slice(0, 20).map((l) => (
              <OrphanRow key={l.id} lead={l} companies={companies} onAssign={assignLead} />
            ))}
          </ul>
        </section>
      )}
      <TasksHiddenHelper tasks={tasks} />

      <Modal isOpen={newOpen} onClose={() => setNewOpen(false)} title="Nuevo cliente / prospecto" description="Cuenta comercial con responsable.">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la cuenta" className="w-full rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none">
            {['BR', 'AR', 'BO', 'PY'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ciudad" className="rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono" className="rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none">
            <option value="">Sin responsable</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setNewOpen(false)}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={() => void createAccount()}>Crear</Button>
        </div>
      </Modal>
    </div>
  );
}

function OrphanRow({ lead, companies, onAssign }: { lead: LeadRow; companies: CompanyRow[]; onAssign: (leadId: string, companyId: string) => void }) {
  const [companyId, setCompanyId] = useState('');
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="min-w-0 flex-1 text-xs text-slate-200">
        {lead.product_interest || 'Prospecto'} · {lead.capacity || ''} · {lead.destination_city || ''}
      </span>
      {lead.qualification && <Badge variant={lead.qualification === 'HIGH' ? 'success' : 'neutral'} size="sm">{lead.qualification}</Badge>}
      <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-slate-300 focus:border-brand-500 focus:outline-none">
        <option value="">Asignar empresa…</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Button variant="outline" size="sm" disabled={!companyId} onClick={() => void onAssign(lead.id, companyId)}>Asignar</Button>
    </li>
  );
}

function TasksHiddenHelper({ tasks: _tasks }: { tasks: TaskRow[] }) {
  void _tasks;
  return null;
}

/* ================= TASKS ================= */

const TASK_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'today', label: 'Hoy' },
  { key: 'overdue', label: 'Vencidas' },
  { key: 'upcoming', label: 'Próximas' },
  { key: 'done', label: 'Completadas' },
] as const;

function TasksView({
  tasks,
  owners,
  companyById,
  oppById,
  loading,
  onChanged,
  setMsg,
}: {
  tasks: TaskRow[];
  owners: OwnerRef[];
  companyById: Map<string, CompanyRow>;
  oppById: Map<string, Opp>;
  loading: boolean;
  onChanged: () => void;
  setMsg: (m: string | null) => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [ownerF, setOwnerF] = useState('');
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('FOLLOW_UP');
  const [owner, setOwner] = useState('');
  const [company, setCompany] = useState('');
  const [opp, setOpp] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [due, setDue] = useState('');
  const [desc, setDesc] = useState('');

  const visible = useMemo(() => {
    const now = Date.now();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = startToday.getTime() + 86400000;
    return tasks.filter((t) => {
      if (ownerF && (t.assigned_to ?? '') !== ownerF) return false;
      const dueTs = t.due_at ? new Date(t.due_at).getTime() : NaN;
      if (filter === 'done') return t.status === 'DONE';
      if (t.status === 'DONE' || t.status === 'CANCELLED') return filter === 'all' ? true : false;
      if (filter === 'today') return dueTs >= startToday.getTime() && dueTs < endToday;
      if (filter === 'overdue') return !Number.isNaN(dueTs) && dueTs < now;
      if (filter === 'upcoming') return !Number.isNaN(dueTs) && dueTs >= now;
      return true;
    });
  }, [tasks, filter, ownerF]);

  async function complete(id: string) {
    try {
      const res = await fetch(`/api/crm/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'DONE' }) });
      if (!res.ok) throw new Error('UPDATE_FAILED');
      onChanged();
    } catch {
      setMsg('No se pudo completar la tarea.');
    }
  }

  async function create() {
    if (!title.trim()) return;
    try {
      const res = await fetch('/api/crm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          task_type: type,
          assigned_to: owner || null,
          company_id: company || null,
          opportunity_id: opp || null,
          priority,
          due_at: due || null,
          description: desc.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('CREATE_FAILED');
      setTitle('');
      setDesc('');
      setDue('');
      setModal(false);
      onChanged();
    } catch {
      setMsg('No se pudo crear la tarea.');
    }
  }

  const oppOptions = useMemo(
    () => (company ? [...oppById.values()].filter((o) => o.company_id === company) : [...oppById.values()].slice(0, 50)),
    [company, oppById],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-[#11161d] p-2">
        {TASK_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${filter === f.key ? 'bg-brand-500/15 text-white ring-1 ring-brand-800/70' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'}`}
          >
            {f.label}
          </button>
        ))}
        <select value={ownerF} onChange={(e) => setOwnerF(e.target.value)} className="ml-auto rounded border border-slate-700/80 bg-[#0c0f14] px-2 py-1.5 text-xs text-slate-300 focus:border-brand-500 focus:outline-none">
          <option value="">Todos los responsables</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
        </select>
        <Button variant="primary" size="sm" onClick={() => setModal(true)}>
          <Plus className="h-3.5 w-3.5" /> Nueva tarea
        </Button>
      </div>

      <section className="rounded-lg border border-slate-800 bg-[#141820]">
        <div className="p-3">
          <DataTable
            columns={[
              { key: 'title', header: 'Tarea', render: (r: TaskRow) => <span className="font-medium text-white">{r.title}</span> },
              { key: 'task_type', header: 'Tipo', render: (r: TaskRow) => <Badge variant="neutral" size="sm">{r.task_type || '—'}</Badge> },
              { key: 'company_id', header: 'Cliente', render: (r: TaskRow) => (r.company_id ? companyById.get(r.company_id)?.name ?? '—' : '—') },
              { key: 'opportunity_id', header: 'Oportunidad', render: (r: TaskRow) => (r.opportunity_id ? oppById.get(r.opportunity_id)?.title ?? '—' : '—') },
              {
                key: 'assigned_to',
                header: 'Responsable',
                render: (r: TaskRow) => {
                  const n = ownerName(owners, r.assigned_to);
                  return <span className="inline-flex items-center gap-1.5"><Avatar name={n} size="sm" />{n}</span>;
                },
              },
              { key: 'priority', header: 'Prioridad', render: (r: TaskRow) => <Badge variant={r.priority === 'HIGH' || r.priority === 'URGENT' ? 'danger' : r.priority === 'MEDIUM' ? 'warning' : 'neutral'} size="sm">{r.priority}</Badge> },
              {
                key: 'due_at',
                header: 'Vence',
                render: (r: TaskRow) => (
                  <span className={isOverdue(r.due_at) && r.status !== 'DONE' ? 'font-semibold text-amber-400' : ''}>{fmtDateLabel(r.due_at)}</span>
                ),
              },
              { key: 'status', header: 'Estado', render: (r: TaskRow) => <Badge variant={r.status === 'DONE' ? 'success' : 'neutral'} size="sm">{r.status}</Badge> },
            ]}
            data={visible}
            emptyMessage={loading ? 'Cargando…' : 'Sin tareas'}
            actions={(row: TaskRow) =>
              row.status !== 'DONE' ? <Button variant="outline" size="sm" onClick={() => void complete(row.id)}>Completar</Button> : <span className="text-[11px] text-slate-600">—</span>
            }
          />
        </div>
        {visible.length === 0 && !loading && (
          <div className="flex justify-center border-t border-slate-800 p-4">
            <Button variant="primary" size="sm" onClick={() => setModal(true)}>+ Nueva tarea</Button>
          </div>
        )}
      </section>

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Nueva tarea" description=" Trabajo con responsable y vencimiento." maxWidth="lg">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ej. Llamar a ACME por cotización)" className="w-full rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none">
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none">
            <option value="">Responsable…</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={company} onChange={(e) => { setCompany(e.target.value); setOpp(''); }} className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none">
            <option value="">Cliente…</option>
            {[...companyById.values()].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={opp} onChange={(e) => setOpp(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none">
            <option value="">Oportunidad…</option>
            {oppOptions.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none">
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-2 text-xs text-white focus:border-brand-500 focus:outline-none" />
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción" rows={2} className="w-full rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={() => void create()}>Crear</Button>
        </div>
      </Modal>
    </div>
  );
}

/* ================= INBOX ================= */

function InboxView({
  inboxQ,
  owners,
  companyById,
  contactById,
  leadById,
  oppById,
  onOpenOpp,
  onChanged,
  setMsg,
}: {
  inboxQ: { data: { inbox: Array<{ conversation: ConvRow; lead?: { product_interest?: string; qualification?: string } | null }> } | null; loading: boolean; reload: () => void };
  owners: OwnerRef[];
  companyById: Map<string, CompanyRow>;
  contactById: Map<string, ContactRow>;
  leadById: Map<string, LeadRow>;
  oppById: Map<string, Opp>;
  onOpenOpp: (id: string) => void;
  onChanged: () => void;
  setMsg: (m: string | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    conversation: ConvRow;
    messages: Array<{ id: string; direction: string; author_role: string; body: string; occurred_at: string }>;
    lead360?: {
      lead: LeadRow;
      company?: { id?: string; name?: string } | null;
      contact?: { full_name?: string; whatsapp_phone?: string } | null;
      opportunities?: Array<{ id: string; title: string; stage: string }>;
    } | null;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [assignOwner, setAssignOwner] = useState('');

  const inbox = inboxQ.data?.inbox ?? [];

  async function openConv(id: string) {
    setSelected(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/crm/inbox/${id}`, { cache: 'no-store' });
      if (res.ok) setDetail(await res.json());
    } catch {
      setMsg('No se pudo abrir la conversación.');
    } finally {
      setLoadingDetail(false);
    }
  }

  async function setControl(id: string, control: 'BOT' | 'HUMAN') {
    try {
      const res = await fetch(`/api/crm/inbox/${id}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ control }),
      });
      if (!res.ok) throw new Error('CONTROL_FAILED');
      await openConv(id);
      onChanged();
    } catch {
      setMsg('No se pudo cambiar el control.');
    }
  }

  async function createOppFromLead(leadId: string) {
    try {
      const res = await fetch('/api/crm/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      });
      if (!res.ok) throw new Error('CREATE_FAILED');
      const body = (await res.json()) as { opportunity: { id: string } };
      onChanged();
      onOpenOpp(body.opportunity.id);
    } catch {
      setMsg('No se pudo crear la oportunidad.');
    }
  }

  async function createTaskFromLead(leadId: string) {
    try {
      const res = await fetch('/api/crm/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, title: 'Seguimiento de conversación WhatsApp', task_type: 'WHATSAPP' }),
      });
      if (!res.ok) throw new Error('CREATE_FAILED');
      setMsg('Tarea creada.');
      onChanged();
    } catch {
      setMsg('No se pudo crear la tarea.');
    }
  }

  async function assign(leadId: string) {
    if (!assignOwner) return;
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_profile_id: assignOwner }),
      });
      if (!res.ok) throw new Error('ASSIGN_FAILED');
      setAssignOwner('');
      await openConv(selected!);
      onChanged();
    } catch {
      setMsg('No se pudo asignar el vendedor.');
    }
  }

  const conv = detail?.conversation ?? null;
  const lead = conv?.lead_id ? (leadById.get(conv.lead_id) ?? detail?.lead360?.lead ?? null) : null;
  const company = lead?.company_id ? companyById.get(lead.company_id)?.name : detail?.lead360?.company?.name;
  const contact = lead?.contact_id ? contactById.get(lead.contact_id)?.full_name : detail?.lead360?.contact?.full_name;
  const opp = conv?.opportunity_id ? oppById.get(conv.opportunity_id) : null;

  return (
    <div>
      <p className="mb-3 text-[11px] text-slate-500">WhatsApp · NIUPACKBOT atiende, califica y deriva. El vendedor toma la conversación cuando hace falta.</p>
      <div className="grid min-h-[620px] gap-3 lg:grid-cols-[1fr_1.8fr_1.2fr]">
        <section className="min-w-0 rounded-lg border border-slate-800 bg-[#141820]">
          <header className="border-b border-slate-800 p-3">
            <h2 className="text-xs font-semibold text-white">Conversaciones ({inbox.length})</h2>
          </header>
          {inbox.length === 0 && !inboxQ.loading ? (
            <p className="p-6 text-center text-[11px] text-slate-600">Todavía no hay conversaciones de WhatsApp.</p>
          ) : (
            <ul className="divide-y divide-slate-800/60">
              {inbox.map(({ conversation: c, lead: l }) => {
                const phone = c.external_conversation_id.replace('whatsapp:', '');
                return (
                  <li key={c.id}>
                    <button onClick={() => void openConv(c.id)} className={`w-full px-3 py-2.5 text-left hover:bg-slate-800/30 ${selected === c.id ? 'bg-brand-500/10' : ''}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-200">
                          <Phone className="h-3 w-3 shrink-0 text-slate-500" />
                          <span className="truncate">{phone}</span>
                        </span>
                        <Badge variant={c.control_mode === 'HUMAN' ? 'warning' : 'success'} size="sm">
                          {c.control_mode === 'HUMAN' ? 'HUMANO' : 'NIUPACKBOT'}
                        </Badge>
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-slate-500">{l?.product_interest || 'Consulta general'}</span>
                      <span className="mt-1 flex items-center justify-between text-[10px] text-slate-600">
                        <span>{c.last_message_at ? timeAgo(c.last_message_at) : ''}</span>
                        {l?.qualification && <span className="font-mono">{l.qualification}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="flex min-w-0 flex-col rounded-lg border border-slate-800 bg-[#141820]">
          {!conv ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <MessageSquareText className="mx-auto h-6 w-6 text-brand-400" />
                <p className="mt-3 text-sm font-semibold text-white">Elegí una conversación</p>
                <p className="mt-1 text-xs text-slate-500">El chat completo aparece acá.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{contact || conv.external_conversation_id.replace('whatsapp:', '')}</p>
                  <p className="truncate text-[11px] text-slate-500">{company || 'Sin empresa'}</p>
                </div>
                <Badge variant={conv.control_mode === 'HUMAN' ? 'warning' : 'success'} size="sm">
                  {conv.control_mode === 'HUMAN' ? 'HUMANO' : 'NIUPACKBOT'}
                </Badge>
                {conv.control_mode === 'BOT' ? (
                  <Button variant="primary" size="sm" onClick={() => void setControl(conv.id, 'HUMAN')}>Tomar conversación</Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => void setControl(conv.id, 'BOT')}>Devolver a NIUPACKBOT</Button>
                )}
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {loadingDetail ? (
                  <p className="py-8 text-center text-[11px] text-slate-500">Cargando…</p>
                ) : (
                  (detail?.messages ?? []).map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-lg border p-2.5 ${
                        m.direction === 'INBOUND'
                          ? 'border-slate-800 bg-[#0c0f14]'
                          : m.author_role === 'HUMAN_AGENT'
                            ? 'ml-auto border-amber-800/50 bg-amber-950/20'
                            : 'ml-auto border-brand-900/40 bg-brand-950/20'
                      }`}
                    >
                      <p className="text-[10px] font-mono text-slate-500">
                        {m.direction === 'INBOUND' ? 'CLIENTE' : m.author_role === 'HUMAN_AGENT' ? 'VENDEDOR' : 'NIUPACKBOT'}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-200">{m.body}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-slate-800 p-3">
                {conv.control_mode === 'HUMAN' ? (
                  <div>
                    <div className="flex gap-2">
                      <input disabled placeholder="Escribí como vendedor…" className="flex-1 rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-slate-500 placeholder-slate-600" />
                      <Button variant="primary" size="sm" disabled>Enviar</Button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-600">Envío directo por WhatsApp no configurado (NOT_CONFIGURED). Respondé desde el teléfono vinculado.</p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">NIUPACKBOT está atendiendo esta conversación.</p>
                )}
              </div>
            </>
          )}
        </section>

        <aside className="min-w-0 rounded-lg border border-slate-800 bg-[#141820] p-3">
          <h2 className="text-xs font-semibold text-white">Ficha comercial</h2>
          {!lead ? (
            <p className="mt-3 text-[11px] text-slate-600">Seleccioná una conversación para ver lo que entendió NIUPACKBOT.</p>
          ) : (
            <div className="mt-3 space-y-3 text-xs">
              <Ficha label="Cliente" value={contact || '—'} />
              <Ficha label="Empresa" value={company || '—'} />
              <Ficha label="Producto" value={lead.product_interest || '—'} />
              <Ficha label="Capacidad" value={lead.capacity || '—'} />
              <Ficha label="Volumen" value={lead.estimated_volume ? `${Number(lead.estimated_volume).toLocaleString('es-PY')}${lead.volume_period ? ` / ${lead.volume_period}` : ''}` : '—'} />
              <Ficha label="Destino" value={lead.destination_city || lead.destination_country || '—'} />
              <Ficha label="Intent" value={lead.intent || '—'} />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-600">Qualification</p>
                <p className="mt-1">{lead.qualification ? <Badge variant={lead.qualification === 'HIGH' ? 'success' : lead.qualification === 'MEDIUM' ? 'warning' : 'neutral'} size="sm">{lead.qualification}</Badge> : '—'}</p>
              </div>
              <Ficha label="Oportunidad" value={opp ? `${opp.title} · ${opp.stage}` : 'Sin crear'} />
              <Ficha label="Responsable" value={ownerName(owners, lead.owner_profile_id)} />
              <Ficha label="Próxima acción" value={lead.next_action ? `${lead.next_action} · ${fmtDateLabel(lead.next_action_at)}` : '—'} />
              <div className="space-y-2 border-t border-slate-800 pt-3">
                {conv && conv.control_mode === 'BOT' && (
                  <Button variant="primary" size="sm" onClick={() => void setControl(conv.id, 'HUMAN')} className="w-full">Tomar conversación</Button>
                )}
                <div className="flex gap-2">
                  <select value={assignOwner} onChange={(e) => setAssignOwner(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-slate-300 focus:border-brand-500 focus:outline-none">
                    <option value="">Asignar vendedor…</option>
                    {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                  </select>
                  <Button variant="outline" size="sm" disabled={!assignOwner || !lead} onClick={() => void assign(lead!.id)}>OK</Button>
                </div>
                {!opp && lead && (
                  <Button variant="outline" size="sm" onClick={() => void createOppFromLead(lead.id)} className="w-full">Crear oportunidad</Button>
                )}
                {lead && (
                  <Button variant="outline" size="sm" onClick={() => void createTaskFromLead(lead.id)} className="w-full">Crear tarea</Button>
                )}
                {opp && (
                  <Button variant="outline" size="sm" onClick={() => onOpenOpp(opp.id)} className="w-full">Abrir oportunidad</Button>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Ficha({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-800/70 pb-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-0.5 text-xs text-slate-200">{value}</p>
    </div>
  );
}
