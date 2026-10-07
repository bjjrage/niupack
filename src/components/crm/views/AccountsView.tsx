'use client';

import { useMemo, useState } from 'react';
import { MoreHorizontal, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar, Card, daysFromToday, Empty, fmtDateLabel, fmtMoneyShort, ownerName, Pill, Segmented, type Tone } from '../commercial-ui';
import { CommercialDataImporter } from '../CommercialDataImporter';
import { AccountDeletionDialog } from '../AccountDeletionDialog';
import { matchesAccountSource, toggleVisibleAccounts, type AccountSourceFilter } from './accounts-state';
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
  const [importStage, setImportStage] = useState<'CUSTOMER' | 'PROSPECT' | null>(null);
  const [sourceFilter, setSourceFilter] = useState<AccountSourceFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionNotice, setSelectionNotice] = useState('');
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; name?: string } | null>(null);

  function resetSelection() {
    if (selectedIds.size > 0) setSelectionNotice('Se restableció la selección al cambiar la pestaña, el origen o la búsqueda.');
    setSelectedIds(new Set());
  }

  const rows = useMemo(() => {
    const healthById = new Map(data.health.map((h) => [h.company_id, h]));
    return data.companies
      .filter((c) => !deletedIds.has(c.id))
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
  }, [data.companies, data.contacts, data.health, data.opps, data.owners, data.tasks, deletedIds]);

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
      if (!matchesAccountSource(r.c.source, sourceFilter)) return false;
      if (seg === 'customers' && !r.isCustomer) return false;
      if (seg === 'prospects' && !r.isPotential) return false;
      if (seg === 'contact' && (!r.isPotential || r.status.rank > 2)) return false;
      if (!t) return true;
      return `${r.c.name} ${r.c.legal_name ?? ''} ${r.c.tax_id ?? ''} ${r.place} ${r.owner} ${r.email ?? ''} ${r.phone ?? ''}`.toLowerCase().includes(t);
    });
  }, [rows, seg, q, sourceFilter]);

  const visibleIds = visible.map((r) => r.c.id);
  const selectedVisible = visibleIds.filter((id) => selectedIds.has(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

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
          onChange={(value) => { resetSelection(); setSeg(value); }}
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
            onChange={(e) => { resetSelection(); setQ(e.target.value); }}
            aria-label="Buscar cuentas"
            placeholder="Buscar por nombre, RUC, email, teléfono…"
            className="w-full rounded-lg border border-slate-800 bg-[#0c0f14] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Origen
          <select aria-label="Origen de cuentas" value={sourceFilter}
            onChange={(e) => { resetSelection(); setSourceFilter(e.target.value as AccountSourceFilter); }}
            className="rounded-lg border border-slate-800 bg-[#0c0f14] px-3 py-2 text-sm text-white">
            <option value="all">Todos</option><option value="manual">Manual</option><option value="imported">Importados</option>
          </select>
        </label>
        {seg !== 'contact' && (
          <Button variant="secondary" size="md" onClick={() => setImportStage(seg === 'customers' ? 'CUSTOMER' : 'PROSPECT')}>
            <Upload className="h-4 w-4" /> Importar base
          </Button>
        )}
        <Button variant="primary" size="md" onClick={onNew}>
          <Plus className="h-4 w-4" /> {seg === 'customers' ? 'Cliente actual' : 'Cliente potencial'}
        </Button>
      </div>

      {selectionNotice && <p role="status" className="text-xs text-slate-400">{selectionNotice}</p>}
      {visible.length > 500 && <p className="text-xs text-slate-400">Afiná la búsqueda para seleccionar hasta 500 cuentas por operación.</p>}
      {selectedVisible.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3" aria-label="Acciones de cuentas seleccionadas">
        <span className="mr-auto text-sm text-white">{selectedVisible.length} seleccionadas</span>
        <Button variant="secondary" onClick={() => { setSelectedIds(new Set()); setSelectionNotice(''); }}>Deseleccionar</Button>
        <Button variant="danger" onClick={() => setDeleteTarget({ ids: selectedVisible })}><Trash2 className="h-4 w-4" />Eliminar seleccionadas</Button>
      </div>}

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <Empty
            title={data.loading ? 'Cargando cuentas…' : q ? 'Sin coincidencias' : emptyCopy[seg].title}
            hint={data.loading || q ? undefined : emptyCopy[seg].hint}
            action={
              !data.loading && !q ? (
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
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" aria-label="Seleccionar cuentas visibles" checked={allVisibleSelected}
                      ref={(node) => { if (node) node.indeterminate = selectedVisible.length > 0 && !allVisibleSelected; }}
                      disabled={data.loading || visible.length > 500}
                      onChange={() => { setSelectedIds(toggleVisibleAccounts(new Set(selectedVisible), visibleIds)); setSelectionNotice(''); }}
                      className="h-4 w-4 accent-red-600" />
                  </th>
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
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Seleccionar ${r.c.name}`} checked={selectedIds.has(r.c.id)} disabled={data.loading}
                          onChange={() => {
                            const next = new Set(selectedVisible);
                            if (next.has(r.c.id)) next.delete(r.c.id);
                            else if (next.size < 500) next.add(r.c.id);
                            else { setSelectionNotice('Podés seleccionar hasta 500 cuentas por operación.'); return; }
                            setSelectedIds(next); setSelectionNotice('');
                          }} className="h-4 w-4 accent-red-600" />
                      </td>
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
                        <details className="mb-1 text-left">
                          <summary aria-label={`Acciones de ${r.c.name}`} className="ml-auto w-fit cursor-pointer list-none rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><MoreHorizontal className="h-5 w-5" /></summary>
                          <div className="flex flex-col gap-1 rounded-lg border border-slate-700 bg-[#141820] p-2 text-xs">
                            <button className="rounded px-2 py-1 text-left text-slate-200 hover:bg-slate-800" onClick={() => actions.openAccount(r.c.id)}>Ver cuenta</button>
                            <button className="rounded px-2 py-1 text-left text-red-300 hover:bg-red-950" onClick={() => setDeleteTarget({ ids: [r.c.id], name: r.c.name })}>Eliminar cuenta</button>
                          </div>
                        </details>
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

      {deleteTarget && <AccountDeletionDialog ids={deleteTarget.ids} name={deleteTarget.name}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(result) => {
          const removed = new Set([...result.deleted_ids, ...result.not_found_ids]);
          setDeletedIds((previous) => new Set([...previous, ...removed]));
          setSelectedIds((previous) => new Set([...previous].filter((id) => !removed.has(id))));
          actions.reload();
          actions.notify(`${result.deleted} cuentas y ${result.deleted_contacts} contactos eliminados.`, result.failed_accounts.length ? 'error' : 'ok');
        }} />}

      <CommercialDataImporter
        open={Boolean(importStage)}
        targetLifecycle={importStage ?? 'PROSPECT'}
        onClose={() => setImportStage(null)}
        onImported={() => {
          actions.reload();
          actions.notify(importStage === 'CUSTOMER' ? 'Base de clientes actuales importada.' : 'Base de clientes potenciales importada.');
        }}
      />
    </div>
  );
}
