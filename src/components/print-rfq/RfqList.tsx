'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { PURPOSE_LABEL, STATUS, api, buttonClass, formatDate, inputClass } from './format';

interface RfqRow { id: string; code: string; purpose: string; title: string; status: string; expires_at: string; created_at: string; items: number; invited: number; responded: number }

export function RfqList() {
  const [rfqs, setRfqs] = useState<RfqRow[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    try { setRfqs((await api<{ rfqs: RfqRow[] }>(`/api/print-rfq/rfqs?${params}`)).rfqs); setError(null); }
    catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, [q, status]);
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código o título" aria-label="Buscar solicitudes" className={`${inputClass} w-64`} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por estado" className={`${inputClass} w-48`}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </select>
        </div>
        <Link href="/imprentas/nueva" className={buttonClass}><Plus className="h-3.5 w-3.5" />Nueva solicitud</Link>
      </div>
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
      {loading ? <p className="text-xs text-slate-400">Cargando…</p> : rfqs.length === 0 && !error ? (
        <p className="py-10 text-center text-xs text-slate-400">{q || status ? 'Ninguna solicitud coincide con los filtros.' : 'Todavía no hay solicitudes a imprentas. Creá la primera con su SKU y su arte.'}</p>
      ) : (
        <ul className="space-y-2" data-testid="rfq-list">
          {rfqs.map((r) => (
            <li key={r.id}>
              <Link href={`/imprentas/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-[#141820] p-3 hover:border-slate-600">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{r.code} · {r.title}</p>
                  <p className="text-[11px] text-slate-400">{PURPOSE_LABEL[r.purpose]} · {r.items} producto(s) · {r.responded} de {r.invited} imprenta(s) respondieron · creada {formatDate(r.created_at)} · vence {formatDate(r.expires_at)}</p>
                </div>
                <Badge variant={STATUS[r.status]?.variant ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
