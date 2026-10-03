'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Compass, MessageCircle, Plus, RotateCcw, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Avatar,
  Capped,
  Card,
  CardHeader,
  daysFromToday,
  Empty,
  fmtDateLabel,
  fmtMoneyShort,
  fmtQty,
  OPEN_STAGES,
  ownerName,
  Pill,
  sendJson,
  STAGE_LABEL,
  TASK_TYPE_LABEL,
  label,
} from '../commercial-ui';
import { ColumnChart, monthLabel } from '../charts';
import { conversationState } from './inbox-state';
import { repurchaseKeyPrefix, type CrmActions, type CrmData, type RepurchaseAlert, type TaskRow } from '../types';


/** Ítems que necesitan un próximo paso: todavía no son tareas, pero alguien tiene que decidir. */
type Loose =
  | { kind: 'repurchase'; key: string; alert: RepurchaseAlert }
  | { kind: 'opp'; key: string; oppId: string }
  | { kind: 'chat'; key: string; convId: string; leadId?: string | null }
  | { kind: 'prospect'; key: string; companyId: string };

export function TodayView({ data, actions, onGo }: { data: CrmData; actions: CrmActions; onGo: (v: 'pipeline' | 'accounts' | 'inbox') => void }) {
  const [owner, setOwner] = useState<string>('');
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const openTasks = useMemo(
    () => data.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && !done.has(t.id) && (!owner || t.assigned_to === owner)),
    [data.tasks, done, owner],
  );

  const groups = useMemo(() => {
    const overdue: TaskRow[] = [];
    const today: TaskRow[] = [];
    const week: TaskRow[] = [];
    const later: TaskRow[] = [];
    for (const t of openTasks) {
      const d = daysFromToday(t.due_at);
      if (d === null) later.push(t);
      else if (d < 0) overdue.push(t);
      else if (d === 0) today.push(t);
      else if (d <= 7) week.push(t);
      else later.push(t);
    }
    return { overdue, today, week, later };
  }, [openTasks]);

  const loose: Loose[] = useMemo(() => {
    const openKeys = data.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED').map((t) => t.external_key ?? '');
    const items: Loose[] = [];
    for (const a of data.alerts) {
      if (a.repurchase_status !== 'OVERDUE' && a.repurchase_status !== 'CONTACT_SOON') continue;
      if (owner && a.owner_profile_id !== owner) continue;
      const prefix = repurchaseKeyPrefix(a.company_id, a.sku);
      if (openKeys.some((k) => k.startsWith(prefix))) continue;
      items.push({ kind: 'repurchase', key: `r-${a.company_id}-${a.sku}`, alert: a });
    }
    for (const c of data.inbox) {
      if (conversationState(c) !== 'WAITING_SELLER') continue;
      items.push({ kind: 'chat', key: `c-${c.conversation.id}`, convId: c.conversation.id, leadId: c.conversation.lead_id });
    }
    for (const o of data.opps) {
      if (!(OPEN_STAGES as readonly string[]).includes(o.stage)) continue;
      if (owner && o.owner_profile_id !== owner) continue;
      const hasTask = openTasks.some((t) => t.opportunity_id === o.id);
      if (!o.next_action && !hasTask) items.push({ kind: 'opp', key: `o-${o.id}`, oppId: o.id });
    }
    const customers = new Set(data.health.filter((h) => h.active_skus > 0).map((h) => h.company_id));
    for (const c of data.companies) {
      if (c.lifecycle_stage === 'CUSTOMER' || customers.has(c.id)) continue;
      if (owner && c.owner_profile_id !== owner) continue;
      const busy = openTasks.some((t) => t.company_id === c.id) || data.opps.some((o) => o.company_id === c.id && (OPEN_STAGES as readonly string[]).includes(o.stage));
      if (!busy) items.push({ kind: 'prospect', key: `p-${c.id}`, companyId: c.id });
    }
    return items;
  }, [data.alerts, data.inbox, data.opps, data.tasks, data.health, data.companies, openTasks, owner]);

  async function complete(t: TaskRow) {
    setDone((s) => new Set(s).add(t.id));
    try {
      await sendJson(`/api/crm/tasks/${t.id}`, 'PATCH', { status: 'DONE' });
      actions.notify(`Hecho: ${t.title}`);
      actions.reload();
    } catch {
      setDone((s) => {
        const n = new Set(s);
        n.delete(t.id);
        return n;
      });
      actions.notify('No se pudo completar la tarea.', 'error');
    }
  }

  async function scheduleRepurchase(a: RepurchaseAlert) {
    setBusy(a.sku + a.company_id);
    try {
      const due = a.expected_next_purchase_at && (daysFromToday(a.expected_next_purchase_at) ?? 0) > 0 ? a.expected_next_purchase_at : new Date().toISOString().slice(0, 10);
      await sendJson('/api/crm/tasks', 'POST', {
        title: `Recompra esperada · ${a.product_name}`,
        description: `Compra cada ~${a.median_days_between_orders ?? '?'} días. Pedido típico: ${fmtQty(a.average_order_quantity)} u.`,
        task_type: 'CALL',
        company_id: a.company_id,
        assigned_to: a.owner_profile_id ?? null,
        priority: a.repurchase_status === 'OVERDUE' ? 'HIGH' : 'MEDIUM',
        due_at: new Date(`${due}T12:00:00`).toISOString(),
        external_key: `${repurchaseKeyPrefix(a.company_id, a.sku)}${a.expected_next_purchase_at ?? due}`,
      });
      actions.notify(`Llamada agendada a ${a.company_name}.`);
      actions.reload();
    } catch {
      actions.notify('No se pudo agendar.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function scheduleAllRepurchases() {
    setBusy('all');
    try {
      const r = (await sendJson('/api/crm/repurchase/generate-tasks', 'POST', {})) as { created?: number } | null;
      actions.notify(`${r?.created ?? 0} llamadas de recompra agendadas.`);
      actions.reload();
    } catch {
      actions.notify('No se pudieron agendar las recompras.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const repurchaseLoose = loose.filter((l) => l.kind === 'repurchase').length;
  const totalToday = groups.overdue.length + groups.today.length;

  return (
    <div className="space-y-6">
      <KpiStrip data={data} openTasks={openTasks} overdue={groups.overdue.length} />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h2 className="text-lg font-semibold text-white">
              {totalToday === 0 ? 'Nada vencido. Buen día para prospectar.' : `${totalToday} ${totalToday === 1 ? 'cosa' : 'cosas'} para hoy`}
            </h2>
            <p className="text-sm text-slate-500">
              {groups.overdue.length > 0 && <span className="text-red-400">{groups.overdue.length} {groups.overdue.length === 1 ? "atrasada" : "atrasadas"} · </span>}
              {groups.week.length} esta semana · {loose.length} sin próximo paso
            </p>
          </div>
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="rounded-lg border border-slate-800 bg-[#0c0f14] px-3 py-2 text-sm text-slate-300 focus:border-brand-500 focus:outline-none"
          >
            <option value="">Todo el equipo</option>
            {data.owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
          <Button variant="secondary" size="md" onClick={() => actions.newTask({})}>
            <Plus className="h-4 w-4" /> Tarea
          </Button>
        </div>

        <Card>
          <TaskGroup title="Atrasadas" tone="danger" tasks={groups.overdue} data={data} actions={actions} onComplete={complete} />
          <TaskGroup title="Hoy" tasks={groups.today} data={data} actions={actions} onComplete={complete} />
          <TaskGroup title="Próximos 7 días" tasks={groups.week} data={data} actions={actions} onComplete={complete} />
          <TaskGroup title="Más adelante" tasks={groups.later} data={data} actions={actions} onComplete={complete} collapsed />
          {openTasks.length === 0 && (
            <Empty
              title={data.loading ? 'Cargando agenda…' : 'Tu agenda está vacía'}
              hint={data.loading ? undefined : 'Agendá llamadas desde las recompras sugeridas o creá una tarea.'}
            />
          )}
        </Card>

        {loose.length > 0 && (
          <Card>
            <CardHeader
              title="Necesitan un próximo paso"
              sub="Recompras por agendar, prospectos sin seguimiento, oportunidades sin acción y chats que esperan a un vendedor."
              action={
                repurchaseLoose > 1 ? (
                  <Button variant="outline" size="sm" isLoading={busy === 'all'} onClick={() => void scheduleAllRepurchases()}>
                    Agendar {repurchaseLoose} recompras
                  </Button>
                ) : undefined
              }
            />
            <Capped items={loose} limit={6}>
              {(visible) => (
                <ul className="divide-y divide-slate-800/70 border-t border-slate-800/70">
                  {visible.map((l) => (
                    <LooseRow key={l.key} item={l} data={data} actions={actions} busy={busy} onSchedule={scheduleRepurchase} onGoInbox={() => onGo('inbox')} />
                  ))}
                </ul>
              )}
            </Capped>
          </Card>
        )}
      </div>

      <aside className="grid content-start gap-6 md:grid-cols-2 xl:grid-cols-1">
        <WonTrendCard data={data} />
        <StagesCard data={data} onGo={() => onGo('pipeline')} />
        <RepurchaseCard data={data} actions={actions} onGo={() => onGo('accounts')} />
      </aside>
    </div>
    </div>
  );
}

/* ---------- Agenda ---------- */

function TaskGroup({
  title,
  tone,
  tasks,
  data,
  actions,
  onComplete,
  collapsed = false,
}: {
  title: string;
  tone?: 'danger';
  tasks: TaskRow[];
  data: CrmData;
  actions: CrmActions;
  onComplete: (t: TaskRow) => void;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  if (tasks.length === 0) return null;
  return (
    <div className="border-b border-slate-800/70 last:border-b-0">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-5 pb-2 pt-4 text-left">
        <span className={`text-xs font-semibold uppercase tracking-wider ${tone === 'danger' ? 'text-red-400' : 'text-slate-500'}`}>{title}</span>
        <span className="text-xs tabular-nums text-slate-600">{tasks.length}</span>
        {collapsed && <span className="ml-auto text-xs text-slate-600">{open ? 'Ocultar' : 'Mostrar'}</span>}
      </button>
      {open && (
        <Capped items={tasks} limit={8}>
          {(visible) => (
            <ul className="pb-2">
              {visible.map((t) => (
                <TaskItem key={t.id} task={t} data={data} actions={actions} onComplete={onComplete} />
              ))}
            </ul>
          )}
        </Capped>
      )}
    </div>
  );
}

function TaskItem({ task: t, data, actions, onComplete }: { task: TaskRow; data: CrmData; actions: CrmActions; onComplete: (t: TaskRow) => void }) {
  const company = t.company_id ? data.companyById.get(t.company_id) : null;
  const opp = t.opportunity_id ? data.oppById.get(t.opportunity_id) : null;
  const d = daysFromToday(t.due_at);
  const overdue = d !== null && d < 0;
  const who = ownerName(data.owners, t.assigned_to);
  const context = [company?.name, opp?.title, label(TASK_TYPE_LABEL, t.task_type)].filter(Boolean).join(' · ');
  const target = opp ? () => actions.openOpp(opp.id) : company ? () => actions.openAccount(company.id) : null;
  return (
    <li className="group flex items-center gap-3 px-5 py-2.5 hover:bg-slate-800/20">
      <button
        onClick={() => onComplete(t)}
        title="Marcar como hecha"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-slate-600 text-transparent transition hover:border-emerald-500 hover:text-emerald-400"
      >
        <Check className="h-3 w-3" />
      </button>
      <button onClick={target ?? undefined} disabled={!target} className="min-w-0 flex-1 text-left disabled:cursor-default">
        <p className="truncate text-sm font-medium text-slate-100">
          {t.title}
          {(t.priority === 'HIGH' || t.priority === 'URGENT') && <span className="ml-2 align-middle"><Pill tone="danger">{t.priority === 'URGENT' ? 'Urgente' : 'Alta'}</Pill></span>}
        </p>
        <p className="truncate text-xs text-slate-500">{context}</p>
      </button>
      <span className={`shrink-0 text-xs tabular-nums ${overdue ? 'font-semibold text-red-400' : 'text-slate-400'}`}>
        {overdue ? `${Math.abs(d!)} d atrasada` : fmtDateLabel(t.due_at)}
      </span>
      <Avatar name={who} size="sm" />
    </li>
  );
}

function LooseRow({
  item,
  data,
  actions,
  busy,
  onSchedule,
  onGoInbox,
}: {
  item: Loose;
  data: CrmData;
  actions: CrmActions;
  busy: string | null;
  onSchedule: (a: RepurchaseAlert) => void;
  onGoInbox: () => void;
}) {
  let icon: ReactNode;
  let title: string;
  let sub: string;
  let cta: ReactNode;
  let open: (() => void) | null = null;

  if (item.kind === 'repurchase') {
    const a = item.alert;
    const d = a.days_until_expected_purchase;
    icon = <RotateCcw className="h-4 w-4 text-amber-400" />;
    title = `${a.company_name} · ${a.product_name}`;
    sub = `Compra cada ~${a.median_days_between_orders ?? '?'} días · ${
      d === null ? 'sin fecha estimada' : d < 0 ? `debió recomprar hace ${Math.abs(d)} días` : d === 0 ? 'debería recomprar hoy' : `recompra en ${d} días`
    }${a.average_order_value ? ` · ~${fmtMoneyShort(a.average_order_value)}` : ''}`;
    open = () => actions.openAccount(a.company_id);
    cta = (
      <Button variant="outline" size="sm" isLoading={busy === a.sku + a.company_id} onClick={() => onSchedule(a)}>
        Agendar llamada
      </Button>
    );
  } else if (item.kind === 'opp') {
    const o = data.oppById.get(item.oppId)!;
    const company = o.company_id ? data.companyById.get(o.company_id)?.name : null;
    icon = <Compass className="h-4 w-4 text-slate-400" />;
    title = company ? `${company} · ${o.title}` : o.title;
    sub = `${STAGE_LABEL[o.stage] ?? o.stage} · ${fmtMoneyShort(o.estimated_value)} · sin próximo paso`;
    open = () => actions.openOpp(o.id);
    cta = (
      <Button variant="outline" size="sm" onClick={open}>
        Definir paso
      </Button>
    );
  } else if (item.kind === 'prospect') {
    const c = data.companyById.get(item.companyId)!;
    icon = <UserPlus className="h-4 w-4 text-blue-400" />;
    title = c.name;
    sub = `Prospecto sin seguimiento${c.city ? ` · ${c.city}` : ''}`;
    open = () => actions.openAccount(c.id);
    cta = (
      <Button
        variant="outline"
        size="sm"
        onClick={() => actions.newTask({ company_id: c.id, title: `Primer contacto · ${c.name}`, task_type: 'CALL', assigned_to: c.owner_profile_id ?? undefined })}
      >
        Agendar contacto
      </Button>
    );
  } else {
    const lead = item.leadId ? data.leadById.get(item.leadId) : null;
    const entry = data.inbox.find((i) => i.conversation.id === item.convId);
    const conv = entry?.conversation;
    icon = <MessageCircle className="h-4 w-4 text-emerald-400" />;
    title = conv?.external_conversation_id.replace('whatsapp:', '') ?? 'Conversación';
    sub = `Espera respuesta de un vendedor${lead?.product_interest ? ` · ${lead.product_interest}` : ''}${entry?.campaign ? ` · Campaña: ${entry.campaign.campaign_name}` : ''}`;
    cta = (
      <Button variant="outline" size="sm" onClick={() => actions.openConversation(item.convId)}>
        Responder
      </Button>
    );
  }

  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-800 bg-[#0c0f14]">{icon}</span>
      <button onClick={open ?? undefined} disabled={!open} className="min-w-0 flex-1 text-left disabled:cursor-default">
        <p className="truncate text-sm font-medium text-slate-100">{title}</p>
        <p className="truncate text-xs text-slate-500">{sub}</p>
      </button>
      {cta}
    </li>
  );
}

/* ---------- KPIs ---------- */

const STAGE_SHADE: Record<string, string> = {
  NUEVO: 'bg-slate-600',
  CONTACTADO: 'bg-slate-500',
  CALIFICADO: 'bg-red-300',
  COTIZACIÓN: 'bg-red-500',
  NEGOCIACIÓN: 'bg-brand-600',
};

function KpiStrip({ data, openTasks, overdue }: { data: CrmData; openTasks: TaskRow[]; overdue: number }) {
  const d = data.dash;
  const open = data.opps.filter((o) => (OPEN_STAGES as readonly string[]).includes(o.stage));
  const openValue = open.reduce((a, o) => a + (o.estimated_value ?? 0), 0);
  const byStage = OPEN_STAGES.map((s) => ({ s, v: open.filter((o) => o.stage === s).reduce((a, o) => a + (o.estimated_value ?? 0), 0) }));
  const forecast = d?.weighted_forecast ?? 0;
  const forecastPct = openValue > 0 ? Math.round((forecast / openValue) * 100) : 0;
  const closed = (d?.won_count ?? 0) + (d?.lost_count ?? 0);
  const winRate = closed > 0 ? Math.round(((d?.won_count ?? 0) / closed) * 100) : null;
  const rep30 = data.alerts.filter((a) => a.days_until_expected_purchase !== null && a.days_until_expected_purchase <= 30);
  const rep30Value = rep30.reduce((a, x) => a + (x.average_order_value ?? 0), 0);
  const repOverdue = data.alerts.filter((a) => a.repurchase_status === 'OVERDUE').length;
  const weeks = [0, 1, 2, 3].map((w) => rep30.filter((a) => {
    const x = a.days_until_expected_purchase ?? 0;
    return w === 0 ? x <= 7 : x > w * 7 && x <= (w + 1) * 7 + (w === 3 ? 2 : 0);
  }).length);
  const maxWeek = Math.max(1, ...weeks);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Pipeline abierto" value={fmtMoneyShort(openValue)} sub={`${open.length} oportunidades`}>
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-800">
          {byStage.map(({ s, v }) => (v > 0 ? <div key={s} className={STAGE_SHADE[s]} style={{ width: `${(v / Math.max(1, openValue)) * 100}%` }} title={`${STAGE_LABEL[s]}: ${fmtMoneyShort(v)}`} /> : null))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">De Nuevo (gris) a Negociación (rojo)</p>
      </Kpi>
      <Kpi label="Pronóstico ponderado" value={fmtMoneyShort(forecast)} sub={`${forecastPct}% del pipeline, según etapa`}>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${forecastPct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">Tasa de cierre histórica: {winRate === null ? '—' : `${winRate}%`}</p>
      </Kpi>
      <Kpi label="Ganado este mes" value={fmtMoneyShort(d?.won_month_value)} sub={`${d?.won_month_count ?? 0} cierres`} accent="success">
        <p className="text-[11px] text-slate-500">{d?.won_count ?? 0} ganadas · {d?.lost_count ?? 0} perdidas en total</p>
      </Kpi>
      <Kpi
        label="Recompras próximos 30 días"
        value={fmtMoneyShort(rep30Value)}
        sub={`${rep30.length} pedidos esperados${repOverdue ? ` · ${repOverdue} vencidas` : ''}`}
        accent={repOverdue ? 'danger' : undefined}
      >
        <div className="flex h-6 items-end gap-1">
          {weeks.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center" title={`Semana ${i + 1}: ${n}`}>
              <div className={`w-full rounded-sm ${i === 0 ? 'bg-amber-400' : 'bg-slate-600'}`} style={{ height: `${n ? Math.max(15, (n / maxWeek) * 100) : 6}%`, minHeight: 2 }} />
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Por semana · {openTasks.length} tareas abiertas{overdue ? `, ${overdue} atrasadas` : ''}</p>
      </Kpi>
    </div>
  );
}

function Kpi({ label: text, value, sub, accent, children }: { label: string; value: string; sub: string; accent?: 'success' | 'danger'; children: ReactNode }) {
  return (
    <Card className="flex flex-col p-4">
      <p className="text-xs font-medium text-slate-400">{text}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${accent === 'success' ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
      <p className={`text-xs ${accent === 'danger' ? 'text-red-400' : 'text-slate-500'}`}>{sub}</p>
      <div className="mt-auto pt-4">{children}</div>
    </Card>
  );
}

/* ---------- Sidebar ---------- */

function WonTrendCard({ data }: { data: CrmData }) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  });
  const won = data.opps.filter((o) => o.stage === 'GANADO');
  const series = months.map((m) => ({
    label: monthLabel(m),
    value: won.filter((o) => (o.won_at ?? o.updated_at ?? '').slice(0, 7) === m).reduce((a, o) => a + (o.estimated_value ?? 0), 0),
  }));
  const total = series.reduce((a, s) => a + s.value, 0);
  return (
    <Card>
      <CardHeader title="Ventas ganadas · 6 meses" sub={total ? `${fmtMoneyShort(total)} en el período` : 'Todavía no hay cierres ganados'} />
      <div className="px-5 pb-5">
        <ColumnChart data={series} format={fmtMoneyShort} height="h-28" highlight="last" />
      </div>
    </Card>
  );
}


function StagesCard({ data, onGo }: { data: CrmData; onGo: () => void }) {
  const rows = OPEN_STAGES.map((s) => {
    const items = data.opps.filter((o) => o.stage === s);
    return { stage: s, count: items.length, value: items.reduce((a, o) => a + (o.estimated_value ?? 0), 0) };
  });
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader
        title="Pipeline por etapa"
        action={
          <button onClick={onGo} className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white">
            Abrir <ArrowRight className="h-3 w-3" />
          </button>
        }
      />
      <ul className="space-y-3 px-5 pb-5">
        {rows.map((r) => (
          <li key={r.stage}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-slate-300">
                {STAGE_LABEL[r.stage]} <span className="tabular-nums text-slate-600">{r.count}</span>
              </span>
              <span className="tabular-nums text-slate-400">{fmtMoneyShort(r.value)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${r.value > 0 ? Math.max(3, (r.value / max) * 100) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RepurchaseCard({ data, actions, onGo }: { data: CrmData; actions: CrmActions; onGo: () => void }) {
  const next30 = data.alerts
    .filter((a) => a.days_until_expected_purchase !== null && a.days_until_expected_purchase <= 30)
    .sort((a, b) => (a.days_until_expected_purchase ?? 0) - (b.days_until_expected_purchase ?? 0));
  const value = next30.reduce((acc, a) => acc + (a.average_order_value ?? 0), 0);
  return (
    <Card>
      <CardHeader
        title="Recompras · próximos 30 días"
        sub={next30.length ? `${next30.length} pedidos esperados · ~${fmtMoneyShort(value)}` : undefined}
        action={
          <button onClick={onGo} className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white">
            Cuentas <ArrowRight className="h-3 w-3" />
          </button>
        }
      />
      {next30.length === 0 ? (
        <p className="px-5 pb-5 text-xs text-slate-500">Sin recompras previstas. Importá el historial de compras desde Cuentas para activar el pronóstico.</p>
      ) : (
        <ul className="px-2 pb-3">
          {next30.slice(0, 6).map((a) => {
            const d = a.days_until_expected_purchase ?? 0;
            return (
              <li key={`${a.company_id}-${a.sku}`}>
                <button onClick={() => actions.openAccount(a.company_id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-800/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-200">{a.company_name}</span>
                    <span className="block truncate text-xs text-slate-500">{a.product_name}</span>
                  </span>
                  <span className={`shrink-0 text-xs tabular-nums ${d < 0 ? 'font-semibold text-red-400' : d <= 7 ? 'text-amber-400' : 'text-slate-400'}`}>
                    {d < 0 ? `+${Math.abs(d)} d` : d === 0 ? 'Hoy' : `en ${d} d`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
