'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { EyeOff, ExternalLink, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export interface BoardTender {
  id: string; external_id: string; title: string; convening_entity: string | null; status: string | null;
  phase: 'ABIERTA' | 'EN_EVALUACION' | 'ADJUDICADA' | 'CERRADA' | 'DESCONOCIDA';
  published_at: string | null; closing_at: string | null; awarded_at: string | null; source_url: string | null; is_test_data: boolean;
  products: Array<{ line_no: number; description: string; quantity: number | null; unit: string | null; presentation: string | null }>;
  products_total: number;
  bidders: Array<{ name: string; ruc: string | null }>;
  invited: Array<{ name: string; ruc: string | null }>;
  dismissed_at?: string | null;
  awards: Array<{ supplier_name: string; supplier_ruc: string | null; awarded_at: string | null; amount: number | null; currency: string | null;
    items: Array<{ description: string; quantity?: number; unit?: string; unit_amount?: number }> }>;
}

type Filter = 'en_curso' | 'adjudicadas' | 'cerradas' | 'todas';
const FILTERS: Array<[Filter, string]> = [['en_curso', 'En curso'], ['adjudicadas', 'Adjudicadas'], ['cerradas', 'Canceladas / desiertas'], ['todas', 'Todas']];
const PHASE_LABEL = { ABIERTA: 'Abierta', EN_EVALUACION: 'En evaluación', ADJUDICADA: 'Adjudicada', CERRADA: 'Cerrada', DESCONOCIDA: 'Estado no informado' } as const;
const PHASE_VARIANT = { ABIERTA: 'success', EN_EVALUACION: 'warning', ADJUDICADA: 'brand', CERRADA: 'neutral', DESCONOCIDA: 'neutral' } as const;

const date = (value: string | null) => (value ? new Date(value).toLocaleDateString('es-PY', { timeZone: 'America/Asuncion' }) : '—');
const money = (amount: number | null | undefined, currency?: string | null) => (amount == null ? '—' : `${currency === 'PYG' || !currency ? 'Gs.' : currency} ${amount.toLocaleString('es-PY')}`);

function daysLeft(closing: string | null): string | null {
  if (!closing) return null;
  const days = Math.ceil((new Date(closing).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'cerró hace ' + Math.abs(days) + ' d';
  return days === 0 ? 'cierra hoy' : `faltan ${days} d`;
}

export function TenderBoard({ refreshKey }: { refreshKey: number }) {
  const [filter, setFilter] = useState<Filter>('en_curso');
  const [query, setQuery] = useState('');
  const [tenders, setTenders] = useState<BoardTender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entities, setEntities] = useState<string[]>([]);
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const hasFilters = Boolean(query || entity || from || to);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ filter });
    if (query.trim()) params.set('q', query.trim());
    if (entity) params.set('entity', entity);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (showDismissed) params.set('dismissed', '1');
    const response = await fetch(`/api/licitaciones/board?${params}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.message || data.error || `Error ${response.status}`);
    else { setError(null); setTenders(data.tenders); setEntities(data.entities ?? []); setSelected(new Set()); }
    setLoading(false);
  }, [filter, query, entity, from, to, showDismissed]);

  const dismiss = async (ids: string[], dismissed: boolean) => {
    if (!ids.length) return;
    if (dismissed && ids.length > 1 && !window.confirm(`¿Ocultar ${ids.length} licitaciones del tablero? Podés restaurarlas desde “Ocultas”.`)) return;
    setBusy(true);
    const response = await fetch('/api/licitaciones/tenders/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, dismissed }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(data.message || data.error || `Error ${response.status}`); return; }
    await load();
  };
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = tenders.length > 0 && selected.size === tenders.length;
  const clearFilters = () => { setQuery(''); setEntity(''); setFrom(''); setTo(''); };

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query, refreshKey]);

  return (
    <section aria-label="Licitaciones con inyectables" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex gap-4" role="tablist">
          {FILTERS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
              className={`pb-2 text-xs font-medium border-b-2 ${filter === key ? 'border-brand-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>{label}</button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto, entidad o empresa" aria-label="Buscar en las licitaciones"
          className="mb-1 w-64 rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white" />
      </div>

      <div className="flex flex-wrap items-end gap-3 text-[11px] text-slate-400">
        <label className="flex flex-col gap-1">Entidad convocante
          <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Filtrar por entidad" className="w-64 rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white">
            <option value="">Todas</option>
            {entities.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Publicada desde
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="flex flex-col gap-1">hasta
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white" />
        </label>
        {hasFilters && <button onClick={clearFilters} className="pb-1.5 text-brand-400 hover:underline">Limpiar filtros</button>}
        <label className="ml-auto flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} /> Ver ocultas
        </label>
      </div>

      {tenders.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(tenders.map((t) => t.id)))} /> Seleccionar todas ({tenders.length})</label>
          {selected.size > 0 && (
            <button disabled={busy} onClick={() => void dismiss([...selected], !showDismissed)}
              className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-slate-200 hover:bg-slate-800 disabled:opacity-50">
              {showDismissed ? <RotateCcw className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {showDismissed ? 'Restaurar' : 'Ocultar'} {selected.size} seleccionada(s)
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">No se pudieron cargar las licitaciones: {error}</p>}
      {loading && !tenders.length && <p className="text-xs text-slate-400">Cargando…</p>}
      {!loading && !error && tenders.length === 0 && (
        <p className="py-8 text-center text-xs text-slate-400">
          {showDismissed ? 'No hay licitaciones ocultas.' : hasFilters ? 'Ninguna licitación coincide con los filtros.' : filter === 'en_curso' ? 'No hay licitaciones en curso con inyectables en lo ya escaneado.' : 'No hay licitaciones en esta categoría todavía.'}
        </p>
      )}

      <ul className="space-y-3">
        {tenders.map((t) => (
          <li key={t.id} className="rounded border border-slate-800 bg-[#141820] p-4 space-y-3" data-testid="tender-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Seleccionar ${t.title}`} className="mt-1" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{t.title}</p>
                <p className="text-[11px] text-slate-400">{t.convening_entity ?? 'Entidad no informada'} · {t.external_id}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.is_test_data && <Badge size="sm" variant="warning">Dato de prueba</Badge>}
                <Badge variant={PHASE_VARIANT[t.phase]}>{PHASE_LABEL[t.phase]}</Badge>
                <button disabled={busy} onClick={() => void dismiss([t.id], !showDismissed)} title={showDismissed ? 'Restaurar en el tablero' : 'Ocultar del tablero'}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                  {showDismissed ? <><RotateCcw className="h-3 w-3" />Restaurar</> : <><EyeOff className="h-3 w-3" />Ocultar</>}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Publicada {date(t.published_at)}
              {t.closing_at && <> · Cierre de ofertas {date(t.closing_at)}{t.phase === 'ABIERTA' && daysLeft(t.closing_at) ? ` (${daysLeft(t.closing_at)})` : ''}</>}
              {t.awarded_at && <> · Adjudicada {date(t.awarded_at)}</>}
              {t.status && !/^adjudicad/i.test(t.status) && <> · {t.status}</>}
            </p>

            <div>
              <p className="text-[11px] font-semibold text-slate-300 mb-1">Productos inyectables ({t.products_total})</p>
              <ul className="space-y-0.5">
                {t.products.slice(0, 5).map((p) => (
                  <li key={p.line_no} className="text-[11px] text-slate-400">{p.description}{p.quantity ? ` · ${p.quantity.toLocaleString('es-PY')} ${p.unit ?? ''}` : ''}{p.presentation ? ` · ${p.presentation}` : ''}</li>
                ))}
                {t.products_total > 5 && <li className="text-[11px] text-slate-500">y {t.products_total - 5} más…</li>}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-300 mb-1">Participantes</p>
              {t.bidders.length === 0 && t.invited.length === 0 && <p className="text-[11px] text-slate-500">DNCP todavía no publica participantes.</p>}
              {t.bidders.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[11px] text-slate-300">{t.bidders.length} oferente(s) que presentaron oferta</summary>
                  <ul className="mt-1 columns-1 md:columns-2 text-[11px] text-slate-400">{t.bidders.map((b) => <li key={b.name}>{b.name}{b.ruc ? ` · RUC ${b.ruc}` : ''}</li>)}</ul>
                </details>
              )}
              {t.invited.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[11px] text-slate-400">{t.invited.length} empresa(s) invitada(s) (no implica que hayan ofertado)</summary>
                  <ul className="mt-1 columns-1 md:columns-2 text-[11px] text-slate-500">{t.invited.map((b) => <li key={b.name}>{b.name}{b.ruc ? ` · RUC ${b.ruc}` : ''}</li>)}</ul>
                </details>
              )}
              {t.phase === 'ABIERTA' && t.bidders.length === 0 && t.invited.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Los oferentes se conocen recién cuando se abren las ofertas.</p>}
            </div>

            {t.awards.length > 0 && (
              <div className="rounded border border-slate-700 bg-[#0c0f14] p-3 space-y-2">
                <p className="text-[11px] font-semibold text-slate-300">Adjudicación</p>
                {t.awards.map((a, index) => (
                  <div key={`${a.supplier_name}-${index}`} className="text-[11px]">
                    <p className="text-white">{a.supplier_name}{a.supplier_ruc ? <span className="text-slate-500"> · RUC {a.supplier_ruc}</span> : null}
                      <span className="text-slate-400"> · {money(a.amount, a.currency)}{a.awarded_at ? ` · ${date(a.awarded_at)}` : ''}</span></p>
                    {a.items.length > 0 && (
                      <ul className="mt-0.5 text-slate-400">
                        {a.items.slice(0, 6).map((it, i) => <li key={i}>{it.description}{it.quantity ? ` · ${it.quantity.toLocaleString('es-PY')} ${it.unit ?? ''}` : ''}{it.unit_amount ? ` · ${money(it.unit_amount, a.currency)} c/u` : ''}</li>)}
                        {a.items.length > 6 && <li className="text-slate-500">y {a.items.length - 6} productos más…</li>}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}

            {t.source_url && <a href={t.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-brand-400 hover:underline">Fuente: DNCP datos abiertos <ExternalLink className="h-3 w-3" /></a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
