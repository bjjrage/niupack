'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar, Card, daysFromToday, Empty, fmtDateLabel, fmtMoneyShort, ownerName, Pill, Segmented, type Tone } from '../commercial-ui';
import { PurchaseImporter } from '../PurchaseImporter';
import { AccountListImporter } from '../AccountListImporter';
import type { CompanyHealth, CompanyRow, CrmActions, CrmData } from '../types';

type Seg = 'customers' | 'prospects' | 'contact';

export interface AccountStatus {
  tone: Tone;
  text: string;
  /** Menor = más urgente. ≤ 2 significa "hay que contactar". */
  rank: number;
}

/** Un único estado legible por cuenta, ordenado por urgencia comercial. */
export function accountStatus(c: CompanyRow, h: CompanyHealth | undefined, openOpps: number, openTasks: number): AccountStatus {
  const isPotential = c.lifecycle_stage === 'PROSPECT' || !c.lifecycle_stage;
  if (!isPotential) return { tone: 'success', text: 'Cliente actual', rank: 6 };
  if (h?.worst_status === 'OVERDUE') return { tone: 'danger', text: 'Compra esperada vencida', rank: 0 };
  if (h?.worst_status === 'CONTACT_SOON') return { tone: 'warning', text: 'Compra próxima', rank: 1 };
  if (openOpps > 0) return { tone: 'info', text: 'Potencial en negociación', rank: 5 };
  if (openTasks > 0) return { tone: 'info', text: 'Potencial con contacto agendado', rank: 5 };
  return { tone: 'neutral', text: 'Potencial sin seguimiento', rank: 2 };
}

export function AccountsView({ data, actions, onNew }: { data: CrmData; actions: CrmActions; onNew: () => void }) {
  const [seg, setSeg] = useState<Seg>('customers');
  const [q, setQ] = useState('');
  const [purchaseImportOpen, setPurchaseImportOpen] = useState(false);
  const [listImportStage, setListImportStage] = useState<'CUSTOMER' | 'PROSPECT' | null>(null);

  const rows = useMemo(() => {
    const healthById = new Map(data.health.map((h) => [h.company_id, h]));
    return data.companies
      .map((c) => {
        const h = healthById.get(c.id);
        const open = data.opps.filter((o) => o.company_id === c.id && o.stage !== 'GANADO' && o.stage !== 'PERDIDO');
        const tasks = data.tasks.filter((t) => t.company_id === c.id && t.status !== 'DONE' && t.status !== 'CANCELLED');
        const status = accountStatus(c, h, open.length, tasks.length);
        const contact = data.contacts.find((x) => x.company_id === c.id);
        return {
          c,
          h,
          status,
          isCustomer: c.lifecycle_stage === 'CUSTOMER' || c.lifecycle_stage === 'INACTIVE',
          isPotential: c.lifecycle_stage !== 'CUSTOMER' && c.lifecycle_stage !== 'INACTIVE',
          pipeline: open.reduce((a, o) => a + (o.estimated_value ?? 0), 0),
          openCount: open.length,
          nextTask: tasks.sort((a, b) => (a.due_at ?? '9').localeCompare(b.due_at ?? '9'))[0],
          owner: ownerName(data.owners, c.owner_profile_id),
          place: [c.city, c.country_code].filter(Boolean).join(', '),
          phone: c.phone || contact?.whatsapp_phone || null,
          email: c.email || contact?.email || null,
        };
      })
      .sort((a, b) => a.status.rank - b.status.rank || b.pipeline - a.pipeline || a.c.name.localeCompare(b.c.name));
  }, [data.companies, data.contacts, data.health, data.opps, data.owners, data.tasks]);

  const counts = useMemo(
    () => ({
      customers: rows.filter((r) => r.isCustomer).length,
      prospects: rows.filter((r) => r.isPotential).length,
      contact: rows.filter((r) => r.isPotential && r.status.rank <= 2).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (seg === 'customers' && !r.isCustomer) return false;
      if (seg === 'prospects' && !r.isPotential) return false;
      if (seg === 'contact' && (!r.isPotential || r.status.rank > 2)) return false;
      if (!t) return true;
      return `${r.c.name} ${r.c.legal_name ?? ''} ${r.c.tax_id ?? ''} ${r.place} ${r.owner} ${r.email ?? ''} ${r.phone ?? ''}`.toLowerCase().includes(t);
    });
  }, [rows, seg, q]);

  const emptyCopy: Record<Seg, { title: string; hint: string }> = {
    customers: { title: 'No hay clientes actuales', hint: 'Importá o creá las empresas que hoy ya son clientes de NIUPACK.' },
    prospects: { title: 'No hay clientes potenciales', hint: 'Importá las empresas nuevas que querés prospectar.' },
    contact: { title: 'Nadie para contactar', hint: 'Acá aparecen solamente clientes potenciales con compra esperada o sin seguimiento agendado.' },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Seg>
          value={seg}
          onChange={setSeg}
          options={[
            { key: 'customers', label: 'Clientes actuales', count: counts.customers },
            { key: 'prospects', label: 'Clientes potenciales', count: counts.prospects },
            { key: 'contact', label: 'Para contactar', count: counts.contact },
          ]}
        />
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, RUC, email, teléfono…"
            className="w-full rounded-lg border border-slate-800 bg-[#0c0f14] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none"
          />
        </div>
        {seg !== 'contact' && (
          <Button variant="secondary" size="md" onClick={() => setListImportStage(seg === 'customers' ? 'CUSTOMER' : 'PROSPECT')}>
            <Upload className="h-4 w-4" /> {seg === 'customers' ? 'Importar clientes actuales' : 'Importar clientes potenciales'}
          </Button>
        )}
        {seg === 'prospects' && (
          <Button variant="secondary" size="md" onClick={() => setPurchaseImportOpen(true)}>
            <Upload className="h-4 w-4" /> Importar historial de compras
          </Button>
        )}
        <Button variant="primary" size="md" onClick={onNew}>
          <Plus className="h-4 w-4" /> {seg === 'customers' ? 'Cliente actual' : 'Cliente potencial'}
        </Button>
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <Empty
            title={data.loading ? 'Cargando cuentas…' : q ? 'Sin coincidencias' : emptyCopy[seg].title}
            hint={data.loading || q ? undefined : emptyCopy[seg].hint}
            action={
              !data.loading && !q && seg !== 'inactive' ? (
                <Button variant="primary" size="sm" onClick={onNew}>
                  <Plus className="h-3.5 w-3.5" /> {seg === 'customers' ? 'Nuevo cliente actual' : 'Nuevo cliente potencial'}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500">
                  <th className="px-5 py-3 font-medium">Cuenta</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Contacto</th>
                  <th className="px-3 py-3 font-medium">Responsable</th>
                  <th className="px-3 py-3 text-right font-medium">Pipeline</th>
                  <th className="px-3 py-3 font-medium">Última compra</th>
                  <th className="px-3 py-3 font-medium">Próximo</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {visible.map((r) => {
                  const next = r.h?.next_repurchase_at;
                  const nd = daysFromToday(next ?? r.nextTask?.due_at);
                  const needsAction = r.isPotential && r.status.rank <= 2 && !r.nextTask;
                  return (
                    <tr key={r.c.id} onClick={() => actions.openAccount(r.c.id)} className="cursor-pointer hover:bg-slate-800/20">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-100">{r.c.name}</p>
                        <p className="text-xs text-slate-500">{[r.place, r.c.tax_id].filter(Boolean).join(' · ') || '—'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={r.status.tone} dot>{r.status.text}</Pill>
                      </td>
                      <td className="max-w-[220px] px-3 py-3 text-xs">
                        <p className={`truncate ${r.phone ? 'text-slate-300' : 'text-slate-600'}`}>{r.phone || 'Sin teléfono'}</p>
                        <p className={`truncate ${r.email ? 'text-slate-300' : 'text-slate-600'}`}>{r.email || 'Sin email'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2 text-slate-300">
                          <Avatar name={r.owner} size="sm" />
                          <span className="truncate">{r.owner}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.openCount > 0 ? (
                          <>
                            <span className="text-slate-100">{fmtMoneyShort(r.pipeline)}</span>
                            <span className="block text-xs text-slate-500">{r.openCount} oport.</span>
                          </>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-300">{r.h?.last_purchase_date ? fmtDateLabel(r.h.last_purchase_date) : <span className="text-slate-600">—</span>}</td>
                      <td className="max-w-[200px] px-3 py-3">
                        {next || r.nextTask ? (
                          <>
                            <span className={nd !== null && nd < 0 ? 'font-medium text-red-400' : nd !== null && nd <= 7 ? 'text-amber-400' : 'text-slate-300'}>
                              {fmtDateLabel(next ?? r.nextTask?.due_at)}
                            </span>
                            <span className="block truncate text-xs text-slate-500">{next ? `Recompra ${r.h?.next_repurchase_sku ?? ''}` : r.nextTask?.title}</span>
                          </>
                        ) : (
                          <span className="text-slate-600">Nada agendado</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {needsAction && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              actions.newTask({
                                company_id: r.c.id,
                                title: r.h?.last_purchase_date ? `Contactar por compra esperada · ${r.c.name}` : `Primer contacto · ${r.c.name}`,
                                task_type: 'CALL',
                                assigned_to: r.c.owner_profile_id ?? undefined,
                              })
                            }
                          >
                            Agendar
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
      </Card>

      <PurchaseImporter
        open={purchaseImportOpen}
        onClose={() => setPurchaseImportOpen(false)}
        companies={data.companies
          .filter((c) => c.lifecycle_stage === 'PROSPECT' || !c.lifecycle_stage)
          .map((c) => ({ id: c.id, name: c.name }))}
        onImported={() => {
          actions.reload();
          actions.notify('Historial importado. Alertas de clientes potenciales recalculadas.');
        }}
      />

      <AccountListImporter
        open={Boolean(listImportStage)}
        lifecycleStage={listImportStage ?? 'PROSPECT'}
        onClose={() => setListImportStage(null)}
        onImported={() => {
          actions.reload();
          actions.notify(listImportStage === 'CUSTOMER' ? 'Clientes actuales importados.' : 'Clientes potenciales importados.');
        }}
      />
    </div>
  );
}
