'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ComparisonPanel } from '@/components/rfq/ComparisonPanel';
import { HistoryPanel } from '@/components/rfq/HistoryPanel';
import { InvitationsPanel } from '@/components/rfq/InvitationsPanel';
import { QuotesPanel } from '@/components/rfq/QuotesPanel';
import { api, errorText, type RfqDetail } from '@/components/rfq/types';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador', APPROVED: 'Invitaciones preparadas', SENT: 'Enviada', REPLIED: 'Con ofertas', PARSED: 'Ofertas por validar', BENCHMARKED: 'Comparada', DECIDED: 'Con decisión', CANCELLED: 'Cancelada', REVIEW_REQUIRED: 'En revisión',
};
const TABS = [['invitaciones', 'Invitaciones'], ['ofertas', 'Ofertas'], ['comparador', 'Comparador'], ['historial', 'Historial']] as const;

export default function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<RfqDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('invitaciones');

  const load = useCallback(async () => {
    const result = await api<RfqDetail>(`/api/rfq/rfqs/${id}`);
    if (!result.ok) setError(errorText(result));
    else { setError(null); setDetail(result.data); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-4 text-sm text-red-300">No se pudo abrir la RFQ: {error}</p>;
  if (!detail) return <p className="text-xs text-slate-400">Cargando…</p>;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="pb-4 border-b border-slate-800">
        <Link href="/rfq/rfqs" className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" />Todas las RFQ</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-white">{detail.rfq.code} · {detail.rfq.title}</h1>
          <Badge variant={detail.rfq.status === 'DECIDED' ? 'success' : 'brand'}>{STATUS_LABEL[detail.rfq.status] ?? detail.rfq.status}</Badge>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {detail.items.map((i) => `${i.sku} × ${i.quantity.toLocaleString('es-PY')} ${i.unit}`).join(' · ')} · Destino {detail.rfq.delivery_destination} · {detail.rfq.incoterm}
          {detail.rfq.deadline_at ? ` · Límite ${new Date(detail.rfq.deadline_at).toLocaleDateString('es-PY')}` : ''}
        </p>
      </div>

      {notice && (
        <div role="status" className={`p-3 rounded text-xs flex items-center justify-between border ${notice.kind === 'ok' ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-red-950/40 border-red-800/60 text-red-300'}`}>
          <span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Cerrar aviso" className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      <div className="flex gap-4 border-b border-slate-800" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`pb-2 text-xs font-medium border-b-2 ${tab === key ? 'border-brand-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>{label}</button>
        ))}
      </div>

      {tab === 'invitaciones' && <InvitationsPanel detail={detail} onChange={load} onNotice={setNotice} />}
      {tab === 'ofertas' && <QuotesPanel detail={detail} onChange={load} onNotice={setNotice} />}
      {tab === 'comparador' && <ComparisonPanel detail={detail} onChange={load} onNotice={setNotice} />}
      {tab === 'historial' && <HistoryPanel detail={detail} />}
    </div>
  );
}
