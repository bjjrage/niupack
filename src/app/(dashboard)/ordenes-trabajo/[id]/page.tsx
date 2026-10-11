'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { WORK_ORDER_STATUS, formatAmount, formatQuantity } from '@/lib/sales-quotes/domain';
import { api, formatDate, formatDateTime, ghostButtonClass, postJson } from '@/components/print-rfq/format';

type Row = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const NEXT: Record<string, Array<[string, string]>> = { PENDIENTE: [['EN_CURSO', 'Iniciar'], ['CANCELADA', 'Cancelar']], EN_CURSO: [['COMPLETADA', 'Completar'], ['CANCELADA', 'Cancelar']] };

export default function OrdenTrabajoPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ work_order: Row; items: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ work_order: Row; items: Row[] }>(`/api/sales-quotes/work-orders/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>;
  if (!data) return <p className="text-xs text-slate-400">Cargando…</p>;
  const { work_order: wo, items } = data;
  const quote = wo.sales_quotes as Row;
  const status = WORK_ORDER_STATUS[wo.status];

  async function change(next: string) {
    if (next === 'CANCELADA' && !window.confirm('¿Cancelar la orden de trabajo?')) return;
    setBusy(true);
    try { await postJson(`/api/sales-quotes/work-orders/${id}`, { status: next }); await load(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-2 border-b border-slate-800 pb-4">
        <Link href="/ordenes-trabajo" className="text-[11px] text-slate-400 hover:text-white">← Órdenes de Trabajo</Link>
        <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold text-white">{wo.code} · {wo.client_name}</h1><Badge variant={status.variant}>{status.label}</Badge></div>
        <p className="text-xs text-slate-400">Documento interno · Presupuesto <Link href={`/presupuestos/${quote?.id}`} className="text-brand-400 hover:underline">{quote?.code}</Link> v{wo.quote_version} · aceptado por {quote?.accepted_by_name} el {formatDateTime(quote?.accepted_at)} · creada {formatDate(wo.created_at)}</p>
        {wo.notes && <p className="text-xs text-slate-300">Observaciones: {wo.notes}</p>}
        <div className="flex gap-2">{(NEXT[wo.status] ?? []).map(([next, label]) => <button key={next} disabled={busy} className={ghostButtonClass} onClick={() => void change(next)}>{label}</button>)}</div>
      </div>
      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="w-full text-xs text-slate-300">
          <thead className="bg-[#141820] text-left text-slate-500"><tr>{['Ítem', 'SKU', 'Descripción', 'Cantidad', 'Precio unit. c/ IVA', 'Total c/ IVA'].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id} className="border-t border-slate-800"><td className="p-2">{i.item_no}</td><td className="p-2">{i.sku ?? '—'}</td><td className="p-2">{i.description}</td><td className="p-2">{formatQuantity(Number(i.quantity))}</td><td className="p-2">{formatAmount(Number(i.unit_price), quote?.currency)}</td><td className="p-2">{formatAmount(Number(i.line_total), quote?.currency)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Condición de pago: {quote?.payment_terms} · Plazo de entrega: {quote?.delivery_terms}</p>
    </div>
  );
}
