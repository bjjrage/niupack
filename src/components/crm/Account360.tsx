'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Avatar,
  daysFromToday,
  Drawer,
  DrawerClose,
  Field,
  fmtDateLabel,
  fmtMoney,
  fmtMoneyShort,
  fmtQty,
  inputCls,
  ownerName,
  Pill,
  REPURCHASE_LABEL,
  Segmented,
  sendJson,
  STAGE_LABEL,
} from './commercial-ui';
import { MonthlyBars } from './charts';
import { Timeline } from './Opportunity360';
import { accountStatus } from './views/AccountsView';
import { ProductPicker } from './forms';
import { repurchaseKeyPrefix, type CatalogSku, type CompanyRow, type CrmActions, type CrmData } from './types';

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
  totals: { last_purchase_date: string | null; value_365d: number; active_skus: number; soon_count: number; overdue_count: number };
  monthly: Array<{ month: string; quantity: number; value: number }>;
  history: Array<{ id: string; purchase_date: string; document_number?: string | null; product_name: string; sku: string; quantity: number; total_value?: number | null; currency?: string | null }>;
}

type Tab = 'summary' | 'purchases' | 'activity';

const COUNTRIES = [
  { code: 'PY', name: 'Paraguay' },
  { code: 'BR', name: 'Brasil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'BO', name: 'Bolivia' },
];

export function Account360({
  account,
  data,
  actions,
  onClose,
  onNewOpp,
}: {
  account: CompanyRow;
  data: CrmData;
  actions: CrmActions;
  onClose: () => void;
  onNewOpp: () => void;
}) {
  const [tab, setTab] = useState<Tab>('summary');
  const [consumption, setConsumption] = useState<Consumption | null>(null);
  const [activities, setActivities] = useState<Array<{ id: string; type: string; title?: string | null; body?: string | null; occurred_at: string }> | null>(null);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [addingPurchase, setAddingPurchase] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Listas largas: primeros N + 'Ver todos'. La ficha no crece sin fin con 20 contactos.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const cap = <T,>(k: string, arr: T[], n: number): T[] => (expanded[k] ? arr : arr.slice(0, n));
  const More = ({ k, total, n }: { k: string; total: number; n: number }) =>
    total > n ? (
      <button onClick={() => setExpanded((e) => ({ ...e, [k]: !e[k] }))} className="mt-2 text-xs font-medium text-slate-400 hover:text-white">
        {expanded[k] ? 'Ver menos' : `Ver todos (${total})`}
      </button>
    ) : null;

  const loadConsumption = useCallback(() => {
    fetch(`/api/crm/companies/${account.id}/consumption`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => setConsumption(b))
      .catch(() => setConsumption(null));
  }, [account.id]);

  const loadActivity = useCallback(() => {
    fetch(`/api/crm/activities?company_id=${account.id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((b) => setActivities(b.activities ?? []))
      .catch(() => setActivities([]));
  }, [account.id]);

  useEffect(() => {
    loadConsumption();
    loadActivity();
  }, [loadConsumption, loadActivity]);

  const contacts = data.contacts.filter((c) => c.company_id === account.id);
  const opps = data.opps.filter((o) => o.company_id === account.id);
  const openOpps = opps.filter((o) => o.stage !== 'GANADO' && o.stage !== 'PERDIDO');
  const tasks = data.tasks.filter((t) => t.company_id === account.id && t.status !== 'DONE' && t.status !== 'CANCELLED');
  const health = data.health.find((h) => h.company_id === account.id);
  const status = accountStatus(account, health, openOpps.length, tasks.length);
  const owner = ownerName(data.owners, account.owner_profile_id);
  const pipeline = openOpps.reduce((a, o) => a + (o.estimated_value ?? 0), 0);
  const stats = useMemo(() => consumption?.stats ?? [], [consumption]);

  const due = useMemo(() => stats.filter((s) => s.repurchase_status === 'OVERDUE' || s.repurchase_status === 'CONTACT_SOON'), [stats]);
  const openKeys = data.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED').map((t) => t.external_key ?? '');

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      actions.notify(ok);
      actions.reload();
      return true;
    } catch {
      actions.notify('No se pudo guardar. Revisá los datos.', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const place = [account.city, COUNTRIES.find((c) => c.code === account.country_code)?.name ?? account.country_code].filter(Boolean).join(', ');
  const registerPurchase = () => {
    setTab('purchases');
    setAddingPurchase(true);
  };

  return (
    <Drawer onClose={onClose} width="max-w-3xl">
      <header className="border-b border-slate-800 px-6 pb-4 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{account.lifecycle_stage === 'CUSTOMER' ? 'Cliente' : 'Prospecto'}{place ? ` · ${place}` : ''}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="truncate text-xl font-semibold text-white">{account.name}</h2>
              <Pill tone={status.tone} dot>{status.text}</Pill>
            </div>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-400">
              <Avatar name={owner} size="sm" />
              {owner}
            </p>
          </div>
          <DrawerClose onClose={onClose} />
        </div>

        {editing ? (
          <AccountEditor account={account} data={data} busy={busy === 'edit'} onCancel={() => setEditing(false)} onSave={async (body) => {
            const ok = await run('edit', () => sendJson(`/api/crm/companies/${account.id}`, 'PATCH', body), 'Datos actualizados.');
            if (ok) setEditing(false);
          }} />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-slate-800 bg-[#141820] px-4 py-3 text-sm sm:grid-cols-4">
            <Datum k="Teléfono" v={account.phone} href={account.phone ? `tel:${account.phone}` : undefined} />
            <Datum k="Email" v={account.email} href={account.email ? `mailto:${account.email}` : undefined} />
            <Datum k="RUC / Tax ID" v={account.tax_id} />
            <div className="flex items-end justify-between gap-2">
              <Datum k="Web" v={account.website} />
              <button onClick={() => setEditing(true)} title="Editar datos" className="mb-0.5 rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-white">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 sm:grid-cols-4">
          <Kpi k="Compras 12 meses" v={consumption?.totals.value_365d ? fmtMoneyShort(consumption.totals.value_365d) : '—'} sub={stats.length ? `${stats.length} productos` : 'Sin compras cargadas'} />
          <Kpi k="Última compra" v={consumption?.totals.last_purchase_date ? fmtDateLabel(consumption.totals.last_purchase_date) : '—'} />
          <Kpi k="Pipeline abierto" v={openOpps.length ? fmtMoneyShort(pipeline) : '—'} sub={openOpps.length ? `${openOpps.length} oport.` : undefined} />
          <Kpi k="Recompras pendientes" v={String(due.length)} warn={due.length > 0} />
        </dl>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { key: 'summary', label: 'Resumen' },
              { key: 'purchases', label: 'Compras', count: consumption?.history.length },
              { key: 'activity', label: 'Actividad' },
            ]}
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={registerPurchase}>
              <Plus className="h-3.5 w-3.5" /> Compra
            </Button>
            <Button variant="secondary" size="sm" onClick={() => actions.newTask({ company_id: account.id, assigned_to: account.owner_profile_id ?? undefined })}>
              <Plus className="h-3.5 w-3.5" /> Tarea
            </Button>
            <Button variant="primary" size="sm" onClick={onNewOpp}>
              <Plus className="h-3.5 w-3.5" /> Oportunidad
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
        {tab === 'summary' && (
          <>
            <Block
              title="Qué compra"
              count={stats.length}
              action={stats.length > 0 && <button onClick={() => setTab('purchases')} className="text-xs font-medium text-slate-400 hover:text-white">Ver historial</button>}
            >
              {stats.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center">
                  <p className="text-sm text-slate-300">No hay compras cargadas para esta cuenta.</p>
                  <p className="mt-1 text-xs text-slate-500">Registrá una compra o importá el historial (Excel/CSV) desde Cuentas → Importar compras. Con 2+ compras de un producto se calcula cada cuánto recompra.</p>
                  <Button variant="primary" size="sm" className="mt-3" onClick={registerPurchase}>
                    <Plus className="h-3.5 w-3.5" /> Registrar compra
                  </Button>
                </div>
              ) : (
                <><ul className="space-y-1.5">
                  {cap('stats', stats, 6).map((s) => {
                    const scheduled = openKeys.some((k) => k.startsWith(repurchaseKeyPrefix(account.id, s.sku)));
                    const d = s.days_until_expected_purchase;
                    const pending = s.repurchase_status === 'OVERDUE' || s.repurchase_status === 'CONTACT_SOON';
                    return (
                      <li key={s.sku} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-[#141820] px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-100">{s.product_name}</span>
                          <span className="block text-xs text-slate-500">
                            Pedido típico {fmtQty(s.average_order_quantity)} u. ·{' '}
                            {s.median_days_between_orders != null ? `cada ~${Math.round(s.median_days_between_orders)} días` : '1 sola compra, sin frecuencia aún'} · última{' '}
                            {fmtDateLabel(s.last_purchase_date)}
                          </span>
                        </span>
                        {s.expected_next_purchase_at && (
                          <span className={`shrink-0 text-xs tabular-nums ${d !== null && d < 0 ? 'font-medium text-red-400' : d !== null && d <= 7 ? 'text-amber-400' : 'text-slate-400'}`}>
                            Próx. {fmtDateLabel(s.expected_next_purchase_at)}
                          </span>
                        )}
                        {pending && <Pill tone={s.repurchase_status === 'OVERDUE' ? 'danger' : 'warning'}>{REPURCHASE_LABEL[s.repurchase_status]}</Pill>}
                        {pending &&
                          (scheduled ? (
                            <span className="text-xs text-slate-500">Agendada</span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              isLoading={busy === s.sku}
                              onClick={() => {
                                const dueDate = s.expected_next_purchase_at && (daysFromToday(s.expected_next_purchase_at) ?? 0) > 0 ? s.expected_next_purchase_at : new Date().toISOString().slice(0, 10);
                                void run(
                                  s.sku,
                                  () =>
                                    sendJson('/api/crm/tasks', 'POST', {
                                      title: `Recompra esperada · ${s.product_name}`,
                                      task_type: 'CALL',
                                      company_id: account.id,
                                      assigned_to: account.owner_profile_id ?? null,
                                      priority: s.repurchase_status === 'OVERDUE' ? 'HIGH' : 'MEDIUM',
                                      due_at: new Date(`${dueDate}T12:00:00`).toISOString(),
                                      external_key: `${repurchaseKeyPrefix(account.id, s.sku)}${s.expected_next_purchase_at ?? dueDate}`,
                                    }),
                                  'Llamada agendada.',
                                );
                              }}
                            >
                              Agendar
                            </Button>
                          ))}
                      </li>
                    );
                  })}
                </ul>
                <More k="stats" total={stats.length} n={6} /></>
              )}
            </Block>

            <Block title="Oportunidades" count={opps.length}>
              {opps.length === 0 ? (
                <Muted>Sin oportunidades. Creá una cuando haya un pedido o cotización en juego.</Muted>
              ) : (
                <><ul className="space-y-1.5">
                  {cap('opps', opps, 5).map((o) => (
                    <li key={o.id}>
                      <button onClick={() => actions.openOpp(o.id)} className="flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-[#141820] px-4 py-2.5 text-left hover:border-slate-600">
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{o.title}</span>
                        <span className="text-sm tabular-nums text-slate-300">{fmtMoneyShort(o.estimated_value)}</span>
                        <Pill tone={o.stage === 'GANADO' ? 'success' : 'neutral'}>{STAGE_LABEL[o.stage] ?? o.stage}</Pill>
                      </button>
                    </li>
                  ))}
                </ul>
                <More k="opps" total={opps.length} n={5} /></>
              )}
            </Block>

            <Block title="Tareas abiertas" count={tasks.length}>
              {tasks.length === 0 ? (
                <Muted>Nada agendado con esta cuenta.</Muted>
              ) : (
                <><ul className="space-y-1.5">
                  {cap('tasks', tasks, 5).map((t) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-[#141820] px-4 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{t.title}</span>
                      <span className={`text-xs ${(daysFromToday(t.due_at) ?? 0) < 0 ? 'font-medium text-red-400' : 'text-slate-500'}`}>{fmtDateLabel(t.due_at)}</span>
                      <Avatar name={ownerName(data.owners, t.assigned_to)} size="sm" />
                    </li>
                  ))}
                </ul>
                <More k="tasks" total={tasks.length} n={5} /></>
              )}
            </Block>

            <Block
              title="Personas de contacto"
              count={contacts.length}
              action={!addingContact && <button onClick={() => setAddingContact(true)} className="text-xs font-medium text-slate-400 hover:text-white">+ Agregar</button>}
            >
              {addingContact && (
                <ContactForm
                  busy={busy === 'contact'}
                  onCancel={() => setAddingContact(false)}
                  onSave={async (body) => {
                    const ok = await run('contact', () => sendJson('/api/crm/contacts', 'POST', { company_id: account.id, ...body }), 'Contacto agregado.');
                    if (ok) setAddingContact(false);
                  }}
                />
              )}
              {contacts.length === 0 && !addingContact ? (
                <Muted>Sin personas cargadas. Agregá al comprador con su WhatsApp y email.</Muted>
              ) : (
                <><ul className="divide-y divide-slate-800/70">
                  {cap('contacts', contacts, 5).map((c) => (
                    <li key={c.id} className="flex items-center gap-3 py-2.5">
                      <Avatar name={c.full_name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{c.full_name}</span>
                      <span className={`w-40 truncate text-xs ${c.whatsapp_phone ? 'text-slate-300' : 'text-slate-600'}`}>{c.whatsapp_phone || 'Sin teléfono'}</span>
                      <span className={`w-52 truncate text-xs ${c.email ? 'text-slate-300' : 'text-slate-600'}`}>{c.email || 'Sin email'}</span>
                    </li>
                  ))}
                </ul>
                <More k="contacts" total={contacts.length} n={5} /></>
              )}
            </Block>
          </>
        )}

        {tab === 'purchases' && (
          <>
            {addingPurchase ? (
              <PurchaseForm
                catalog={data.catalog}
                known={stats}
                busy={busy === 'purchase'}
                onCancel={() => setAddingPurchase(false)}
                onSave={async (row) => {
                  const ok = await run(
                    'purchase',
                    async () => {
                      const r = (await sendJson('/api/crm/purchases/import/commit', 'POST', { rows: [{ company_id: account.id, source: 'MANUAL', ...row }] })) as {
                        inserted?: number;
                        duplicates?: number;
                        errors?: unknown[];
                      } | null;
                      if (r?.errors?.length) throw new Error('INVALID');
                      if (r?.duplicates) actions.notify('Esa compra ya estaba registrada.', 'error');
                    },
                    'Compra registrada. Recompra recalculada.',
                  );
                  if (ok) {
                    setAddingPurchase(false);
                    loadConsumption();
                  }
                }}
              />
            ) : (
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => setAddingPurchase(true)}>
                  <Plus className="h-3.5 w-3.5" /> Registrar compra
                </Button>
              </div>
            )}
            {!consumption || consumption.history.length === 0 ? (
              !addingPurchase && <Muted>Sin compras registradas todavía.</Muted>
            ) : (
              <>
                <Block title="Compras por mes · últimos 12 meses">
                  <MonthlyBars data={consumption.monthly} money={consumption.monthly.some((m) => m.value > 0)} />
                </Block>
                <Block title="Historial de pedidos" count={consumption.history.length}>
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-xs text-slate-500">
                          <th className="px-4 py-2.5 font-medium">Fecha</th>
                          <th className="px-3 py-2.5 font-medium">Producto</th>
                          <th className="px-3 py-2.5 font-medium">Documento</th>
                          <th className="px-3 py-2.5 text-right font-medium">Cantidad</th>
                          <th className="px-4 py-2.5 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {consumption.history.slice(0, 100).map((h) => (
                          <tr key={h.id}>
                            <td className="px-4 py-2.5 tabular-nums text-slate-400">
                              {new Date(`${h.purchase_date}T12:00:00`).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: '2-digit' })}
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="text-slate-100">{h.product_name}</p>
                              <p className="text-xs text-slate-500">{h.sku}</p>
                            </td>
                            <td className="px-3 py-2.5 text-slate-400">{h.document_number || '—'}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{fmtQty(Number(h.quantity))} u.</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{h.total_value != null ? fmtMoney(Number(h.total_value), h.currency ?? 'USD') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Block>
              </>
            )}
          </>
        )}

        {tab === 'activity' && (
          <Block title="Actividad">
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Registrar una nota, visita o acuerdo…" className={inputCls} />
              <Button
                variant="secondary"
                size="md"
                disabled={!note.trim()}
                isLoading={busy === 'note'}
                onClick={async () => {
                  const ok = await run('note', () => sendJson('/api/crm/activities', 'POST', { company_id: account.id, type: 'NOTE', title: 'Nota', body: note.trim() }), 'Nota registrada.');
                  if (ok) {
                    setNote('');
                    loadActivity();
                  }
                }}
              >
                Agregar
              </Button>
            </div>
            <Timeline items={activities} />
          </Block>
        )}
      </div>
    </Drawer>
  );
}

/* ---------- Formularios ---------- */

function AccountEditor({
  account,
  data,
  busy,
  onCancel,
  onSave,
}: {
  account: CompanyRow;
  data: CrmData;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    name: account.name,
    legal_name: account.legal_name ?? '',
    tax_id: account.tax_id ?? '',
    phone: account.phone ?? '',
    email: account.email ?? '',
    website: account.website ?? '',
    country_code: account.country_code ?? 'PY',
    city: account.city ?? '',
    owner_profile_id: account.owner_profile_id ?? '',
    lifecycle_stage: account.lifecycle_stage ?? 'PROSPECT',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-slate-700 bg-[#141820] p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre comercial"><input value={f.name} onChange={set('name')} className={inputCls} /></Field>
        <Field label="Razón social"><input value={f.legal_name} onChange={set('legal_name')} className={inputCls} /></Field>
        <Field label="Teléfono"><input value={f.phone} onChange={set('phone')} className={inputCls} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} className={inputCls} /></Field>
        <Field label="RUC / Tax ID"><input value={f.tax_id} onChange={set('tax_id')} className={inputCls} /></Field>
        <Field label="Web"><input value={f.website} onChange={set('website')} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Field label="País">
          <select value={f.country_code} onChange={set('country_code')} className={inputCls}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Ciudad"><input value={f.city} onChange={set('city')} className={inputCls} /></Field>
        <Field label="Tipo">
          <select value={f.lifecycle_stage} onChange={set('lifecycle_stage')} className={inputCls}>
            <option value="PROSPECT">Prospecto</option>
            <option value="CUSTOMER">Cliente</option>
            <option value="INACTIVE">Inactivo</option>
          </select>
        </Field>
        <Field label="Responsable">
          <select value={f.owner_profile_id} onChange={set('owner_profile_id')} className={inputCls}>
            {data.owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button
          variant="primary"
          size="sm"
          isLoading={busy}
          onClick={() =>
            onSave({
              name: f.name.trim() || account.name,
              legal_name: f.legal_name.trim() || null,
              tax_id: f.tax_id.trim() || null,
              phone: f.phone.trim() || null,
              email: f.email.trim() || null,
              website: f.website.trim() || null,
              country_code: f.country_code,
              city: f.city.trim() || null,
              lifecycle_stage: f.lifecycle_stage,
              ...(f.owner_profile_id ? { owner_profile_id: f.owner_profile_id } : {}),
            })
          }
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}

function ContactForm({ busy, onCancel, onSave }: { busy: boolean; onCancel: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ full_name: '', job_title: '', whatsapp_phone: '', email: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="mb-3 space-y-3 rounded-xl border border-slate-700 bg-[#141820] p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre y apellido"><input autoFocus value={f.full_name} onChange={set('full_name')} className={inputCls} /></Field>
        <Field label="Cargo"><input value={f.job_title} onChange={set('job_title')} placeholder="Compras" className={inputCls} /></Field>
        <Field label="WhatsApp / teléfono"><input value={f.whatsapp_phone} onChange={set('whatsapp_phone')} className={inputCls} /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} className={inputCls} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button
          variant="primary"
          size="sm"
          isLoading={busy}
          disabled={f.full_name.trim().length < 2}
          onClick={() => onSave({ full_name: f.full_name.trim(), job_title: f.job_title.trim() || null, whatsapp_phone: f.whatsapp_phone.trim() || null, email: f.email.trim() || null })}
        >
          Guardar contacto
        </Button>
      </div>
    </div>
  );
}

function PurchaseForm({
  catalog,
  known,
  busy,
  onCancel,
  onSave,
}: {
  catalog: CatalogSku[];
  known: SkuStat[];
  busy: boolean;
  onCancel: () => void;
  onSave: (row: Record<string, unknown>) => void;
}) {
  // Lo que ya compra esta cuenta va primero en la lista.
  const knownSkus = new Set(known.map((k) => k.sku));
  const sorted = [...catalog.filter((c) => knownSkus.has(c.sku)).map((c) => ({ ...c, category: 'Ya compra' })), ...catalog.filter((c) => !knownSkus.has(c.sku))];
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), sku: '', quantity: '', unitPrice: '', doc: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const item = catalog.find((c) => c.sku === f.sku);
  const qty = Number(f.quantity);
  const price = f.unitPrice.trim() ? Number(f.unitPrice) : null;
  const total = price != null && qty > 0 ? price * qty : null;
  return (
    <div className="space-y-3 rounded-xl border border-slate-700 bg-[#141820] p-4">
      <p className="text-sm font-semibold text-slate-100">Registrar compra</p>
      <Field label="Producto (maestro)">
        <ProductPicker catalog={sorted} value={f.sku} onChange={(p) => setF((s) => ({ ...s, sku: p?.sku ?? '' }))} autoFocus />
      </Field>
      <div className="grid grid-cols-4 gap-3">
        <Field label="Fecha"><input type="date" value={f.date} onChange={set('date')} className={inputCls} /></Field>
        <Field label="Cantidad (u.)"><input value={f.quantity} onChange={set('quantity')} inputMode="numeric" className={`${inputCls} tabular-nums`} /></Field>
        <Field label="Precio unit. (USD)"><input value={f.unitPrice} onChange={set('unitPrice')} inputMode="decimal" className={`${inputCls} tabular-nums`} /></Field>
        <Field label="Factura / remisión"><input value={f.doc} onChange={set('doc')} className={inputCls} /></Field>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{total != null ? `Total: ${fmtMoney(total)}` : 'Con 2 o más compras del mismo SKU se calcula la frecuencia de recompra.'}</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={busy}
            disabled={!item || !(qty > 0) || !f.date}
            onClick={() =>
              item &&
              onSave({
                purchase_date: f.date,
                product_id: item.product_id,
                product_name: [item.product_name, item.size].filter(Boolean).join(' '),
                sku: item.sku,
                quantity: qty,
                unit_price: price,
                total_value: total,
                currency: 'USD',
                document_number: f.doc.trim() || null,
              })
            }
          >
            Guardar compra
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Primitivas locales ---------- */

function Datum({ k, v, href }: { k: string; v?: string | null; href?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-500">{k}</p>
      {v ? (
        href ? (
          <a href={href} className="block truncate text-slate-100 hover:underline">{v}</a>
        ) : (
          <p className="truncate text-slate-100">{v}</p>
        )
      ) : (
        <p className="text-slate-600">Sin cargar</p>
      )}
    </div>
  );
}

function Kpi({ k, v, sub, warn = false }: { k: string; v: string; sub?: string; warn?: boolean }) {
  return (
    <div className="niu-kpi bg-[#141820] px-4 py-3">
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${warn ? 'text-amber-400' : 'text-white'}`}>{v}</dd>
      {sub && <dd className="text-[11px] text-slate-500">{sub}</dd>}
    </div>
  );
}

function Block({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">
          {title}
          {typeof count === 'number' && count > 0 && <span className="ml-2 font-normal tabular-nums text-slate-500">{count}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}
