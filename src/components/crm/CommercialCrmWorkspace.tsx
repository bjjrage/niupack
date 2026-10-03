'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CalendarCheck, ChevronDown, Columns3, Megaphone, MessagesSquare, Plus, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fmtMoneyShort, isOverdue, daysFromToday, useCrmFetch, type OwnerRef } from './commercial-ui';
import { Account360 } from './Account360';
import { Opportunity360 } from './Opportunity360';
import { NewAccountModal, NewOppModal, TaskModal, TeamModal } from './forms';
import { TodayView } from './views/TodayView';
import { PipelineView } from './views/PipelineView';
import { AccountsView } from './views/AccountsView';
import { InboxView } from './views/InboxView';
import { CampaignsView } from './views/CampaignsView';
import { conversationState } from './views/inbox-state';
import type { Product, ProductAttribute } from '@/types';
import type {
  CatalogSku,
  CompanyHealth,
  CompanyRow,
  ContactRow,
  CrmActions,
  CrmData,
  InboxItem,
  LeadRow,
  Opp,
  RepurchaseAlert,
  SalesDash,
  TaskRow,
} from './types';

type View = 'today' | 'pipeline' | 'accounts' | 'inbox' | 'campaigns';
const VIEW_KEYS: View[] = ['today', 'pipeline', 'accounts', 'inbox', 'campaigns'];

export function CommercialCrmWorkspace() {
  const [view, setViewState] = useState<View>('today');
  const [oppId, setOppId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null);
  const [createMenu, setCreateMenu] = useState(false);
  const [newOpp, setNewOpp] = useState<{ companyId?: string } | null>(null);
  const [newAccount, setNewAccount] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  // Salto a un chat puntual (desde Campañas / Hoy). n cambia en cada pedido para re-disparar el efecto.
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<Partial<TaskRow> | null>(null);

  // La vista activa vive en el hash para que recargar o compartir el link no te devuelva a "Hoy".
  useEffect(() => {
    const h = window.location.hash.replace('#', '') as View;
    if (VIEW_KEYS.includes(h)) setViewState(h);
  }, []);
  const setView = useCallback((v: View) => {
    setViewState(v);
    window.history.replaceState(null, '', `#${v}`);
  }, []);

  const dashQ = useCrmFetch<SalesDash>('/api/crm/dashboard');
  const oppsQ = useCrmFetch<{ opportunities: Opp[] }>('/api/crm/opportunities');
  const leadsQ = useCrmFetch<{ leads: LeadRow[] }>('/api/crm/leads');
  const tasksQ = useCrmFetch<{ tasks: TaskRow[] }>('/api/crm/tasks');
  const inboxQ = useCrmFetch<{ inbox: InboxItem[] }>('/api/crm/inbox');
  const companiesQ = useCrmFetch<{ companies: CompanyRow[]; contacts: ContactRow[] }>('/api/crm/companies');
  const ownersQ = useCrmFetch<{ owners: OwnerRef[] }>('/api/crm/owners');
  const alertsQ = useCrmFetch<{ alerts: RepurchaseAlert[] }>('/api/crm/repurchase/alerts');
  const healthQ = useCrmFetch<{ health: CompanyHealth[] }>('/api/crm/customers/purchase-health');
  // Maestro de productos: los productos del CRM salen de acá, nunca de texto libre.
  const catalogQ = useCrmFetch<{ skus: ProductAttribute[]; products: Product[] }>('/api/cost/skus');

  const queries = [dashQ, oppsQ, leadsQ, tasksQ, inboxQ, companiesQ, ownersQ, alertsQ, healthQ, catalogQ];
  const queriesRef = useRef(queries);
  queriesRef.current = queries;
  const reload = useCallback(() => {
    for (const q of queriesRef.current) void q.reload();
  }, []);

  const data: CrmData = useMemo(() => {
    const opps = oppsQ.data?.opportunities ?? [];
    const leads = leadsQ.data?.leads ?? [];
    const companies = companiesQ.data?.companies ?? [];
    const contacts = companiesQ.data?.contacts ?? [];
    const catalog = buildCatalog(catalogQ.data?.products ?? [], catalogQ.data?.skus ?? []);
    return {
      catalog,
      catalogBySku: new Map(catalog.map((c) => [c.sku, c])),
      owners: ownersQ.data?.owners ?? [],
      opps,
      leads,
      tasks: tasksQ.data?.tasks ?? [],
      companies,
      contacts,
      inbox: inboxQ.data?.inbox ?? [],
      alerts: alertsQ.data?.alerts ?? [],
      health: healthQ.data?.health ?? [],
      dash: dashQ.data,
      companyById: new Map(companies.map((c) => [c.id, c])),
      contactById: new Map(contacts.map((c) => [c.id, c])),
      leadById: new Map(leads.map((l) => [l.id, l])),
      oppById: new Map(opps.map((o) => [o.id, o])),
      loading: oppsQ.loading || tasksQ.loading || companiesQ.loading,
    };
  }, [oppsQ.data, leadsQ.data, companiesQ.data, ownersQ.data, tasksQ.data, inboxQ.data, alertsQ.data, healthQ.data, catalogQ.data, dashQ.data, oppsQ.loading, tasksQ.loading, companiesQ.loading]);

  const notify = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => setToast({ msg, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const actions: CrmActions = useMemo(
    () => ({
      reload,
      notify,
      openOpp: (id) => {
        setAccountId(null);
        setOppId(id);
      },
      openAccount: (id) => {
        setOppId(null);
        setAccountId(id);
      },
      openConversation: (id) => {
        setAccountId(null);
        setOppId(null);
        setView('inbox');
        setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
      },
      newTask: (prefill = {}) => setTaskPrefill(prefill),
    }),
    [reload, notify, setView],
  );

  const failed = queries.some((q) => q.error === 'HTTP_401' || q.error === 'HTTP_403');

  // Contadores de las pestañas: lo que exige acción, no totales decorativos.
  const dueNow = data.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && t.due_at && (daysFromToday(t.due_at) ?? 1) <= 0).length;
  const openOpps = data.opps.filter((o) => o.stage !== 'GANADO' && o.stage !== 'PERDIDO');
  // Solo cuenta lo que espera respuesta de un vendedor (no los chats que ya atendió).
  const humanPending = data.inbox.filter((i) => conversationState(i) === 'WAITING_SELLER').length;
  const overdueCount = data.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && isOverdue(t.due_at)).length;

  const tabs: Array<{ key: View; label: string; icon: typeof Columns3; count?: number; alert?: boolean }> = [
    { key: 'today', label: 'Hoy', icon: CalendarCheck, count: dueNow, alert: overdueCount > 0 },
    { key: 'pipeline', label: 'Pipeline', icon: Columns3, count: openOpps.length },
    { key: 'accounts', label: 'Cuentas', icon: Building2, count: data.companies.length },
    { key: 'inbox', label: 'Conversaciones', icon: MessagesSquare, count: humanPending, alert: humanPending > 0 },
    { key: 'campaigns', label: 'Campañas', icon: Megaphone },
  ];

  const opp = oppId ? data.oppById.get(oppId) ?? null : null;
  const account = accountId ? data.companyById.get(accountId) ?? null : null;
  const anyLoading = queries.some((q) => q.loading);

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Comercial</h1>
          <p className="mt-1 text-sm text-slate-400">
            <span className="tabular-nums text-slate-200">{fmtMoneyShort(data.dash?.pipeline_open_value)}</span> en pipeline ·{' '}
            <span className="tabular-nums text-slate-200">{fmtMoneyShort(data.dash?.won_month_value)}</span> ganado este mes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTeamOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-700 hover:text-white"
          >
            <Users className="h-4 w-4" /> Equipo <span className="tabular-nums text-slate-500">{data.owners.length}</span>
          </button>
          <button
            onClick={reload}
            title="Actualizar datos"
            className="rounded-lg border border-slate-800 p-2 text-slate-400 transition hover:border-slate-700 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${anyLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="relative">
            <Button variant="primary" size="md" onClick={() => setCreateMenu((v) => !v)}>
              <Plus className="h-4 w-4" /> Nuevo <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </Button>
            {createMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setCreateMenu(false)} />
                <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-xl border border-slate-800 bg-[#141820] py-1 shadow-2xl">
                  {[
                    { label: 'Oportunidad', hint: 'Entra al pipeline', run: () => setNewOpp({}) },
                    { label: 'Tarea', hint: 'Llamada, visita, seguimiento', run: () => setTaskPrefill({}) },
                    { label: 'Cuenta', hint: 'Cliente o prospecto', run: () => setNewAccount(true) },
                    { label: 'Vendedor', hint: 'Sumar al equipo comercial', run: () => setTeamOpen(true) },
                  ].map((it) => (
                    <button
                      key={it.label}
                      onClick={() => {
                        setCreateMenu(false);
                        it.run();
                      }}
                      className="block w-full px-4 py-2.5 text-left hover:bg-slate-800/60"
                    >
                      <span className="block text-sm font-medium text-slate-100">{it.label}</span>
                      <span className="block text-xs text-slate-500">{it.hint}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-800">
        {tabs.map(({ key, label: text, icon: Icon, count, alert }) => {
          const active = view === key;
          return (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`relative -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                active ? 'border-brand-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {text}
              {typeof count === 'number' && count > 0 && (
                <span
                  className={`min-w-[20px] rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums ${
                    alert ? 'bg-brand-500 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {failed ? (
        <p className="rounded-xl border border-slate-800 bg-[#141820] p-8 text-center text-sm text-slate-400">Tu sesión expiró. Volvé a iniciar sesión para ver el CRM.</p>
      ) : (
        <>
          {view === 'today' && <TodayView data={data} actions={actions} onGo={setView} />}
          {view === 'pipeline' && <PipelineView data={data} actions={actions} onNew={() => setNewOpp({})} />}
          {view === 'accounts' && <AccountsView data={data} actions={actions} onNew={() => setNewAccount(true)} />}
          {view === 'inbox' && <InboxView data={data} actions={actions} focus={focus} />}
          {view === 'campaigns' && <CampaignsView data={data} actions={actions} />}
        </>
      )}

      {opp && (
        <Opportunity360
          key={opp.id}
          opp={opp}
          data={data}
          actions={actions}
          onClose={() => setOppId(null)}
        />
      )}
      {account && (
        <Account360
          key={account.id}
          account={account}
          data={data}
          actions={actions}
          onClose={() => setAccountId(null)}
          onNewOpp={() => setNewOpp({ companyId: account.id })}
        />
      )}

      <NewOppModal open={Boolean(newOpp)} companyId={newOpp?.companyId} onClose={() => setNewOpp(null)} data={data} actions={actions} />
      <TeamModal open={teamOpen} onClose={() => setTeamOpen(false)} data={data} actions={actions} />
      <NewAccountModal open={newAccount} onClose={() => setNewAccount(false)} data={data} actions={actions} />
      <TaskModal prefill={taskPrefill} onClose={() => setTaskPrefill(null)} data={data} actions={actions} />

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border px-4 py-2.5 text-sm shadow-2xl ${
            toast.tone === 'error' ? 'border-red-900 bg-[#141820] text-red-300' : 'border-slate-700 bg-[#141820] text-slate-100'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = { cups: 'Vasos', lids: 'Tapas', bowls: 'Potes', trays: 'Bandejas', thermoformed: 'Termoformados', custom: 'A medida' };

function buildCatalog(products: Product[], skus: ProductAttribute[]): CatalogSku[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return skus
    .map((s): CatalogSku | null => {
      const p = byId.get(s.product_id);
      if (!p) return null;
      const size = s.size_oz ? `${s.size_oz} oz` : s.size_ml ? `${s.size_ml} ml` : null;
      return {
        sku: s.sku,
        product_id: p.id,
        product_name: p.name,
        product_code: p.code,
        category: CATEGORY_LABEL[p.category] ?? p.category,
        size,
        material: s.material ?? null,
        moq: s.moq ?? null,
        label: [p.name, size, s.sku].filter(Boolean).join(' · '),
      };
    })
    .filter((x): x is CatalogSku => x !== null)
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}
