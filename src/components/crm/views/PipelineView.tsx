'use client';

import { useMemo, useState } from 'react';
import { LayoutGrid, List, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Avatar,
  Card,
  daysFromToday,
  Empty,
  fmtDateLabel,
  fmtMoney,
  fmtMoneyShort,
  OPEN_STAGES,
  ownerName,
  Segmented,
  sendJson,
  STAGE_LABEL,
  timeAgo,
} from '../commercial-ui';
import type { CrmActions, CrmData, Opp } from '../types';

type Mode = 'open' | 'GANADO' | 'PERDIDO';

export function PipelineView({ data, actions, onNew }: { data: CrmData; actions: CrmActions; onNew: () => void }) {
  const [mode, setMode] = useState<Mode>('open');
  const [layout, setLayout] = useState<'board' | 'list'>('board');
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  // Movimiento optimista: vale solo hasta que el servidor devuelva una versión nueva de la oportunidad.
  const [moved, setMoved] = useState<Record<string, { stage: string; since?: string }>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const opps = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.opps
      .map((o) => (moved[o.id] && moved[o.id].since === o.updated_at ? { ...o, stage: moved[o.id].stage } : o))
      .filter((o) => {
        if (owner && o.owner_profile_id !== owner) return false;
        if (!t) return true;
        const company = o.company_id ? data.companyById.get(o.company_id)?.name ?? '' : '';
        return `${o.title} ${company} ${o.product_interest ?? ''} ${o.destination_city ?? ''}`.toLowerCase().includes(t);
      });
  }, [data.opps, data.companyById, moved, q, owner]);

  const won = opps.filter((o) => o.stage === 'GANADO');
  const lost = opps.filter((o) => o.stage === 'PERDIDO');
  const open = opps.filter((o) => (OPEN_STAGES as readonly string[]).includes(o.stage));

  async function moveTo(id: string, stage: string) {
    const server = data.oppById.get(id);
    const current = moved[id]?.since === server?.updated_at ? moved[id]?.stage ?? server?.stage : server?.stage;
    if (!current || current === stage) return;
    setMoved((m) => ({ ...m, [id]: { stage, since: server?.updated_at } }));
    try {
      await sendJson(`/api/crm/opportunities/${id}/stage`, 'POST', { stage });
      actions.notify(`Movida a ${STAGE_LABEL[stage]}.`);
      actions.reload();
    } catch {
      setMoved((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      actions.notify('No se pudo mover la oportunidad.', 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { key: 'open', label: 'Abiertas', count: open.length },
            { key: 'GANADO', label: 'Ganadas', count: won.length },
            { key: 'PERDIDO', label: 'Perdidas', count: lost.length },
          ]}
        />
        {mode === 'open' && (
          <div className="inline-flex rounded-lg border border-slate-800 bg-[#0c0f14] p-0.5">
            {([
              ['board', LayoutGrid, 'Tablero'],
              ['list', List, 'Lista'],
            ] as const).map(([k, Icon, text]) => (
              <button
                key={k}
                onClick={() => setLayout(k)}
                title={text}
                className={`rounded-md p-1.5 transition ${layout === k ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-200'}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cuenta, producto o ciudad"
            className="w-full rounded-lg border border-slate-800 bg-[#0c0f14] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="rounded-lg border border-slate-800 bg-[#0c0f14] px-3 py-2 text-sm text-slate-300 focus:border-brand-500 focus:outline-none"
        >
          <option value="">Todo el equipo</option>
          {data.owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
        </select>
        <Button variant="primary" size="md" onClick={onNew}>
          <Plus className="h-4 w-4" /> Oportunidad
        </Button>
      </div>

      {mode === 'open' && layout === 'board' ? (
        <div className="-mx-1 overflow-x-auto pb-2">
          <div className="grid min-w-[1100px] grid-cols-5 gap-3 px-1">
            {OPEN_STAGES.map((stage) => {
              const items = open.filter((o) => o.stage === stage);
              const value = items.reduce((a, o) => a + (o.estimated_value ?? 0), 0);
              const isOver = overStage === stage && dragId !== null;
              return (
                <section
                  key={stage}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(stage);
                  }}
                  onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain');
                    setOverStage(null);
                    setDragId(null);
                    if (id) void moveTo(id, stage);
                  }}
                  className={`flex h-[calc(100vh-340px)] min-h-[380px] flex-col rounded-xl border transition ${
                    isOver ? 'border-brand-500/70 bg-brand-500/5' : 'border-slate-800 bg-[#0e1218]'
                  }`}
                >
                  <header className="px-3.5 pb-2 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">{STAGE_LABEL[stage]}</h3>
                      <span className="text-xs tabular-nums text-slate-500">{items.length}</span>
                    </div>
                    <p className="mt-0.5 text-xs tabular-nums text-slate-500">{fmtMoneyShort(value)}</p>
                  </header>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                    {items.map((o) => (
                      <OppCard
                        key={o.id}
                        opp={o}
                        data={data}
                        dragging={dragId === o.id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', o.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragId(o.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverStage(null);
                        }}
                        onOpen={() => actions.openOpp(o.id)}
                      />
                    ))}
                    {items.length === 0 && (
                      <p className="rounded-lg border border-dashed border-slate-800 px-3 py-6 text-center text-xs text-slate-600">
                        {dragId ? 'Soltá acá' : 'Vacío'}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-xs text-slate-600">Arrastrá una tarjeta para cambiarla de etapa. Para cerrarla como ganada o perdida, abrila.</p>
        </div>
      ) : (
        <OppTable opps={mode === 'open' ? open : mode === 'GANADO' ? won : lost} data={data} actions={actions} />
      )}
    </div>
  );
}

function OppCard({
  opp: o,
  data,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  opp: Opp;
  data: CrmData;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const company = o.company_id ? data.companyById.get(o.company_id)?.name : null;
  const contact = o.contact_id ? data.contactById.get(o.contact_id)?.full_name : null;
  const who = ownerName(data.owners, o.owner_profile_id);
  const d = daysFromToday(o.next_action_at);
  const product = [o.product_interest, o.capacity].filter(Boolean).join(' · ');

  let step: { text: string; cls: string };
  if (!o.next_action) step = { text: 'Sin próximo paso', cls: 'text-amber-400' };
  else if (d !== null && d < 0) step = { text: `${o.next_action} · atrasado`, cls: 'text-red-400' };
  else step = { text: `${o.next_action}${o.next_action_at ? ` · ${fmtDateLabel(o.next_action_at)}` : ''}`, cls: 'text-slate-400' };

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`cursor-pointer rounded-lg border border-slate-800 bg-[#141820] p-3 transition hover:border-slate-600 ${dragging ? 'opacity-40' : ''}`}
    >
      <p className="truncate text-sm font-semibold text-white">{company || contact || o.title}</p>
      <p className="mt-0.5 truncate text-xs text-slate-400">{product || (company ? o.title : '—')}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-base font-semibold tabular-nums text-slate-100">{o.estimated_value ? fmtMoney(o.estimated_value, o.currency ?? 'USD') : <span className="text-sm font-normal text-slate-600">Sin valor</span>}</span>
        <Avatar name={who} size="sm" />
      </div>
      <p className={`mt-2 truncate border-t border-slate-800 pt-2 text-xs ${step.cls}`}>{step.text}</p>
    </article>
  );
}

type SortKey = 'company' | 'stage' | 'value' | 'owner' | 'next' | 'close';

/** Vista tabla: escala a cientos de oportunidades, ordenable por columna. */
function OppTable({ opps, data, actions }: { opps: Opp[]; data: CrmData; actions: CrmActions }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'value', dir: -1 });
  const rows = useMemo(() => {
    const val = (o: Opp): string | number => {
      switch (sort.key) {
        case 'company':
          return (o.company_id ? data.companyById.get(o.company_id)?.name : o.title) ?? '';
        case 'stage':
          return (OPEN_STAGES as readonly string[]).indexOf(o.stage);
        case 'value':
          return o.estimated_value ?? 0;
        case 'owner':
          return ownerName(data.owners, o.owner_profile_id);
        case 'next':
          return o.next_action_at ?? '9999';
        case 'close':
          return o.expected_close_at ?? o.won_at ?? o.updated_at ?? '9999';
      }
    };
    return [...opps].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [opps, sort, data.companyById, data.owners]);
  const total = opps.reduce((a, o) => a + (o.estimated_value ?? 0), 0);

  const Th = ({ k, children, right = false }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-3 font-medium ${right ? 'text-right' : ''}`}>
      <button
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === 'value' ? -1 : 1 }))}
        className={`inline-flex items-center gap-1 hover:text-slate-200 ${sort.key === k ? 'text-slate-200' : ''}`}
      >
        {children}
        {sort.key === k && <span>{sort.dir === 1 ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  if (opps.length === 0) return <Card><Empty title="Nada por acá todavía" /></Card>;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between px-5 py-3">
        <p className="text-sm text-slate-400">{opps.length} oportunidades</p>
        <p className="text-sm font-semibold tabular-nums text-slate-100">{fmtMoney(total)}</p>
      </div>
      <div className="max-h-[calc(100vh-320px)] overflow-auto border-t border-slate-800">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#141820]">
            <tr className="border-b border-slate-800 text-xs text-slate-500">
              <Th k="company">Cuenta / oportunidad</Th>
              <Th k="stage">Etapa</Th>
              <Th k="value" right>Valor</Th>
              <Th k="owner">Responsable</Th>
              <Th k="next">Próximo paso</Th>
              <Th k="close">Cierre</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {rows.map((o) => {
              const company = o.company_id ? data.companyById.get(o.company_id)?.name : null;
              const who = ownerName(data.owners, o.owner_profile_id);
              const nd = daysFromToday(o.next_action_at);
              return (
                <tr key={o.id} onClick={() => actions.openOpp(o.id)} className="cursor-pointer hover:bg-slate-800/20">
                  <td className="px-3 py-2.5 pl-5">
                    <p className="truncate font-medium text-slate-100">{company || o.title}</p>
                    <p className="truncate text-xs text-slate-500">{company ? o.title : o.product_interest || '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{STAGE_LABEL[o.stage] ?? o.stage}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-100">{o.estimated_value ? fmtMoney(o.estimated_value) : '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2 text-slate-300"><Avatar name={who} size="sm" />{who}</span>
                  </td>
                  <td className={`max-w-[220px] truncate px-3 py-2.5 ${!o.next_action ? 'text-amber-400' : nd !== null && nd < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                    {o.next_action ? `${o.next_action}${o.next_action_at ? ` · ${fmtDateLabel(o.next_action_at)}` : ''}` : 'Sin próximo paso'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{fmtDateLabel(o.expected_close_at ?? o.won_at ?? (o.stage === 'PERDIDO' ? o.updated_at : null))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
