'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { QUOTE_STATUS, isQuoteExpired } from '@/lib/sales-quotes/domain';
import { api, buttonClass, formatDate, inputClass } from '@/components/print-rfq/format';

interface Row { id: string; code: string; client_name: string; subject: string | null; status: string; quote_date: string; valid_until: string | null; version: number; lines: number; work_order: { id: string; code: string } | null }

export function QuoteList() {
  const [quotes, setQuotes] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    try { setQuotes((await api<{ quotes: Row[] }>(`/api/sales-quotes?${params}`)).quotes); setError(null); } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, [q, status]);
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente, código o asunto" aria-label="Buscar presupuestos" className={`${inputClass} w-72`} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por estado" className={`${inputClass} w-44`}>
            <option value="">Todos los estados</option>
            {Object.entries(QUOTE_STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </select>
        </div>
        <Link href="/presupuestos/nuevo" className={buttonClass}><Plus className="h-3.5 w-3.5" />Nuevo presupuesto</Link>
      </div>
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
      {loading ? <p className="text-xs text-slate-400">Cargando…</p> : quotes.length === 0 && !error ? (
        <p className="py-10 text-center text-xs text-slate-400">{q || status ? 'Ningún presupuesto coincide con los filtros.' : 'Todavía no hay presupuestos. Creá el primero importando los SKU del catálogo.'}</p>
      ) : (
        <ul className="space-y-2" data-testid="quote-list">
          {quotes.map((r) => (
            <li key={r.id}>
              <Link href={`/presupuestos/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-[#141820] p-3 hover:border-slate-600">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{r.code} · {r.client_name}</p>
                  <p className="text-[11px] text-slate-400">{r.subject ? `${r.subject} · ` : ''}{r.lines} línea(s) · {formatDate(r.quote_date)}{r.valid_until ? ` · válido hasta ${formatDate(r.valid_until)}` : ''} · v{r.version}{r.work_order ? ` · ${r.work_order.code}` : ''}</p>
                </div>
                <div className="flex gap-2">{isQuoteExpired(r) && <Badge variant="danger">Vencido</Badge>}<Badge variant={QUOTE_STATUS[r.status]?.variant ?? 'neutral'}>{QUOTE_STATUS[r.status]?.label ?? r.status}</Badge></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
