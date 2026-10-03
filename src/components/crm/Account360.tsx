'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar, fmtDateLabel, fmtMoney, ownerName, timeAgo, type OwnerRef } from './commercial-ui';
import { MonthlyBars, ProductBars } from './charts';

interface SkuStat {
  sku: string;
  product_name: string;
  last_purchase_date: string;
  last_purchase_quantity: number;
  average_order_quantity: number;
  total_quantity_365d: number;
  purchases_365d: number;
  median_days_between_orders: number | null;
  expected_next_purchase_at: string | null;
  days_until_expected_purchase: number | null;
  repurchase_status: string;
}

interface Consumption {
  stats: SkuStat[];
  totals: {
    last_purchase_date: string | null;
    value_365d: number;
    active_skus: number;
    soon_count: number;
    overdue_count: number;
    worst_status: string | null;
    next_repurchase_at: string | null;
    next_repurchase_sku: string | null;
  };
  monthly: Array<{ month: string; quantity: number; value: number }>;
  history: Array<{ id: string; purchase_date: string; document_number?: string | null; product_name: string; sku: string; quantity: number; total_value?: number | null; currency?: string | null }>;
}

export interface AccountInfo {
  id: string;
  name: string;
  legal_name?: string | null;
  tax_id?: string | null;
  country_code?: string | null;
  city?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  lifecycle_stage?: string | null;
  owner_profile_id?: string | null;
}

export function Account360({
  account,
  contacts,
  opportunities,
  tasks,
  activities,
  conversations,
  owners,
  onClose,
  onChanged,
  onOpenOpportunity,
}: {
  account: AccountInfo;
  contacts: Array<{ id: string; full_name: string; whatsapp_phone?: string | null; email?: string | null }>;
  opportunities: Array<{ id: string; title: string; stage: string; estimated_value?: number | null; next_action?: string | null; next_action_at?: string | null }>;
  tasks: Array<{ id: string; title: string; status: string; due_at?: string | null }>;
  activities: Array<{ id: string; type: string; title?: string | null; occurred_at: string }>;
  conversations: Array<{ id: string; external_conversation_id: string; control_mode: string }>;
  owners: OwnerRef[];
  onClose: () => void;
  onChanged: () => void;
  onOpenOpportunity: (id: string) => void;
}) {
  const [tab, setTab] = useState<'contact' | 'opp' | 'task' | 'note' | null>(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pipeline = opportunities.filter((o) => o.stage !== 'GANADO' && o.stage !== 'PERDIDO');
  const pipelineValue = pipeline.reduce((a, o) => a + (o.estimated_value ?? 0), 0);
  const [consumption, setConsumption] = useState<Consumption | null>(null);

  useEffect(() => {
    fetch(`/api/crm/companies/${account.id}/consumption`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b) setConsumption(b);
      })
      .catch(() => undefined);
  }, [account.id]);

  async function post(url: string, body: Record<string, unknown>, ok: string) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('SAVE_FAILED');
      setMsg(ok);
      setName('');
      setTitle('');
      setTab(null);
      onChanged();
    } catch {
      setMsg('No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-slate-700 bg-[#141820]">
        <div className="border-b border-slate-800 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-bold text-white">{account.name}</h2>
                <Badge variant={account.lifecycle_stage === 'CUSTOMER' ? 'success' : 'brand'} size="sm">
                  {account.lifecycle_stage || 'PROSPECT'}
                </Badge>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                <Avatar name={ownerName(owners, account.owner_profile_id)} size="sm" />
                {ownerName(owners, account.owner_profile_id)} · {pipeline.length} oportunidades ·{' '}
                <span className="tabular-nums">{fmtMoney(pipelineValue)}</span>
              </p>
            </div>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setTab(tab === 'contact' ? null : 'contact')}>+ Contacto</Button>
            <Button variant="outline" size="sm" onClick={() => setTab(tab === 'opp' ? null : 'opp')}>+ Oportunidad</Button>
            <Button variant="outline" size="sm" onClick={() => setTab(tab === 'task' ? null : 'task')}>+ Tarea</Button>
            <Button variant="outline" size="sm" onClick={() => setTab(tab === 'note' ? null : 'note')}>+ Nota</Button>
          </div>
          {tab && (
            <div className="mt-3 flex gap-2">
              <input
                value={tab === 'contact' ? name : title}
                onChange={(e) => (tab === 'contact' ? setName(e.target.value) : setTitle(e.target.value))}
                placeholder={tab === 'contact' ? 'Nombre del contacto' : tab === 'opp' ? 'Título (ej. Vasos 12 oz · Curitiba)' : tab === 'task' ? 'Título de la tarea' : 'Nota'}
                className="flex-1 rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={saving}
                onClick={() => {
                  if (tab === 'contact') void post('/api/crm/contacts', { company_id: account.id, full_name: name.trim() }, 'Contacto creado.');
                  else if (tab === 'opp') void post('/api/crm/opportunities', { company_id: account.id, title: title.trim() }, 'Oportunidad creada.');
                  else if (tab === 'task') void post('/api/crm/tasks', { company_id: account.id, title: title.trim() }, 'Tarea creada.');
                  else void post('/api/crm/activities', { company_id: account.id, type: 'NOTE', title: 'Nota', body: title.trim() }, 'Nota agregada.');
                }}
              >
                Guardar
              </Button>
            </div>
          )}
          {msg && <p className="mt-2 text-[11px] text-amber-400">{msg}</p>}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
          <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
            <h3 className="text-xs font-semibold text-white">Información</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-slate-300">
              <p>Razón social: <span className="text-slate-100">{account.legal_name || '—'}</span></p>
              <p>Tax ID: <span className="text-slate-100">{account.tax_id || '—'}</span></p>
              <p>País: <span className="text-slate-100">{account.country_code || '—'}</span></p>
              <p>Ciudad: <span className="text-slate-100">{account.city || '—'}</span></p>
              <p>Web: <span className="text-slate-100">{account.website || '—'}</span></p>
              <p>Teléfono: <span className="text-slate-100">{account.phone || '—'}</span></p>
              <p className="col-span-2">Email: <span className="text-slate-100">{account.email || '—'}</span></p>
            </div>
          </section>

          {consumption && (
            <>
              <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
                <h3 className="text-xs font-semibold text-white">Resumen comercial</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-3">
                  <MiniStat label="Última compra" value={consumption.totals.last_purchase_date ? fmtDateLabel(consumption.totals.last_purchase_date) : '—'} />
                  <MiniStat label="Compras 12m" value={String(consumption.stats.reduce((a, s) => a + s.purchases_365d, 0))} />
                  <MiniStat label="Productos activos" value={String(consumption.totals.active_skus)} />
                  <MiniStat label="Valor 12m" value={fmtMoney(consumption.totals.value_365d)} />
                  <MiniStat label="Por vencer" value={String(consumption.totals.soon_count)} warn={consumption.totals.soon_count > 0} />
                  <MiniStat label="Vencidas" value={String(consumption.totals.overdue_count)} warn={consumption.totals.overdue_count > 0} />
                </div>
              </section>

              <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
                <h3 className="text-xs font-semibold text-white">Productos que consume ({consumption.stats.length})</h3>
                {consumption.stats.length === 0 ? (
                  <p className="mt-2 text-[11px] text-slate-600">Sin compras importadas. Usá “Importar compras” en Clientes & Prospectos.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-500">
                          <th className="py-1.5 pr-2 font-medium">Producto</th>
                          <th className="py-1.5 pr-2 font-medium">Última</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Promedio</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Frec.</th>
                          <th className="py-1.5 pr-2 text-right font-medium">Próxima</th>
                          <th className="py-1.5 text-right font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {consumption.stats.map((s) => (
                          <tr key={s.sku}>
                            <td className="py-1.5 pr-2">
                              <p className="font-medium text-slate-200">{s.product_name}</p>
                              <p className="font-mono text-[10px] text-slate-500">{s.sku} · {s.purchases_365d} compras 12m</p>
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums text-slate-300">
                              {fmtDateLabel(s.last_purchase_date)}
                              <span className="block text-slate-500">{Math.round(s.last_purchase_quantity).toLocaleString('es-PY')} u.</span>
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-slate-300">{Math.round(s.average_order_quantity).toLocaleString('es-PY')} u.</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-slate-300">{s.median_days_between_orders != null ? `${Math.round(s.median_days_between_orders)} d` : '—'}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums text-slate-300">{s.expected_next_purchase_at ? fmtDateLabel(s.expected_next_purchase_at) : '—'}</td>
                            <td className="py-1.5 text-right">
                              <Badge variant={s.repurchase_status === 'OVERDUE' ? 'danger' : s.repurchase_status === 'CONTACT_SOON' ? 'warning' : s.repurchase_status === 'ON_CYCLE' ? 'success' : 'neutral'} size="sm">
                                {s.repurchase_status === 'CONTACT_SOON' ? 'CONTACTAR PRONTO' : s.repurchase_status === 'OVERDUE' ? 'VENCIDA' : s.repurchase_status === 'ON_CYCLE' ? 'EN CICLO' : 'SIN DATOS'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
                <h3 className="text-xs font-semibold text-white">Compras mensuales — últimos 12 meses</h3>
                <div className="mt-2"><MonthlyBars data={consumption.monthly} /></div>
              </section>

              <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
                <h3 className="text-xs font-semibold text-white">Consumo por producto (12m)</h3>
                <div className="mt-2">
                  <ProductBars data={consumption.stats.map((s) => ({ label: `${s.product_name} (${s.sku})`, value: Math.round(s.total_quantity_365d), sub: `${s.purchases_365d} compras` }))} />
                </div>
              </section>

              <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
                <h3 className="text-xs font-semibold text-white">Histórico de compras ({consumption.history.length})</h3>
                {consumption.history.length === 0 ? (
                  <p className="mt-2 text-[11px] text-slate-600">Sin movimientos.</p>
                ) : (
                  <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                    {consumption.history.slice(0, 40).map((h) => (
                      <li key={h.id} className="flex items-center gap-2 text-[11px]">
                        <span className="shrink-0 tabular-nums text-slate-500">{h.purchase_date.slice(8, 10)}/{h.purchase_date.slice(5, 7)}/{h.purchase_date.slice(0, 4)}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-300">{h.product_name} <span className="font-mono text-[10px] text-slate-600">{h.sku}</span></span>
                        <span className="shrink-0 tabular-nums text-slate-200">{Number(h.quantity).toLocaleString('es-PY')} u.</span>
                        {h.total_value != null && <span className="shrink-0 tabular-nums text-slate-500">{fmtMoney(Number(h.total_value), h.currency ?? 'USD')}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
                <h3 className="text-xs font-semibold text-white">Recompra</h3>
                {consumption.stats.filter((s) => s.repurchase_status === 'CONTACT_SOON' || s.repurchase_status === 'OVERDUE').length === 0 ? (
                  <p className="mt-2 text-[11px] text-slate-600">Nada por vencer.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {consumption.stats
                      .filter((s) => s.repurchase_status === 'CONTACT_SOON' || s.repurchase_status === 'OVERDUE')
                      .map((s) => (
                        <li key={s.sku} className={`flex items-center gap-2 rounded border px-2.5 py-2 text-[11px] ${s.repurchase_status === 'OVERDUE' ? 'border-red-900/50 bg-red-950/10' : 'border-amber-900/40 bg-amber-950/10'}`}>
                          <span className="min-w-0 flex-1 truncate text-slate-200">{s.product_name} · próxima {s.expected_next_purchase_at ? fmtDateLabel(s.expected_next_purchase_at) : '—'}</span>
                          <Badge variant={s.repurchase_status === 'OVERDUE' ? 'danger' : 'warning'} size="sm">
                            {s.repurchase_status === 'OVERDUE' ? 'VENCIDA' : 'PRONTO'}
                          </Badge>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            </>
          )}

          <Section title={`Contactos (${contacts.length})`}>            {contacts.length === 0 && <Empty label="Sin contactos." />}
            {contacts.map((c) => (
              <p key={c.id} className="text-slate-300">
                {c.full_name} <span className="text-slate-500">{c.whatsapp_phone || c.email || ''}</span>
              </p>
            ))}
          </Section>

          <Section title={`Oportunidades (${opportunities.length})`}>
            {opportunities.length === 0 && <Empty label="Sin oportunidades." />}
            {opportunities.map((o) => (
              <button key={o.id} onClick={() => onOpenOpportunity(o.id)} className="flex w-full items-center justify-between gap-2 rounded border border-slate-800 bg-[#141820] px-2.5 py-2 text-left hover:border-slate-600">
                <span className="min-w-0 truncate text-slate-200">{o.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-slate-400">{fmtMoney(o.estimated_value)}</span>
                  <Badge variant="neutral" size="sm">{o.stage}</Badge>
                </span>
              </button>
            ))}
          </Section>

          <Section title={`Tareas (${tasks.length})`}>
            {tasks.length === 0 && <Empty label="Sin tareas." />}
            {tasks.map((t) => (
              <p key={t.id} className="text-slate-300">
                {t.title} <span className="text-slate-500">· {t.status} · {fmtDate(t.due_at)}</span>
              </p>
            ))}
          </Section>

          <Section title="Actividad">
            {activities.length === 0 && <Empty label="Sin actividad." />}
            {activities.slice(0, 10).map((a) => (
              <p key={a.id} className="text-slate-400">
                <span className="font-mono text-[10px] text-slate-500">{a.type}</span> · {a.title || ''} · {timeAgo(a.occurred_at)}
              </p>
            ))}
          </Section>

          <Section title={`Conversaciones (${conversations.length})`}>
            {conversations.length === 0 && <Empty label="Sin conversaciones." />}
            {conversations.map((c) => (
              <p key={c.id} className="text-slate-300">
                {c.external_conversation_id.replace('whatsapp:', '')}{' '}
                <Badge variant={c.control_mode === 'HUMAN' ? 'warning' : 'neutral'} size="sm">{c.control_mode}</Badge>
              </p>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded border p-2 ${warn ? 'border-amber-800/60 bg-amber-950/20' : 'border-slate-800 bg-[#141820]'}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
      <p className={`mt-1 text-xs font-semibold tabular-nums ${warn ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {  return (
    <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
      <h3 className="text-xs font-semibold text-white">{title}</h3>
      <div className="mt-2 space-y-1.5">{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-[11px] text-slate-600">{label}</p>;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
}
