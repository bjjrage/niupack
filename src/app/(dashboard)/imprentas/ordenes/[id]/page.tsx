'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, formatDate, formatDateTime, money } from '@/components/print-rfq/format';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default function OrdenImprentaPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ order: Row; items: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ order: Row; items: Row[] }>(`/api/print-rfq/orders/${id}`).then(setData).catch((e) => setError(e.message)); }, [id]);

  if (error) return <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>;
  if (!data) return <p className="text-xs text-slate-400">Cargando…</p>;
  const { order, items } = data;
  const provider = order.print_providers as Row | null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <Link href="/imprentas/ordenes" className="text-[11px] text-slate-400 hover:text-white print:hidden">← Órdenes de compra</Link>
          <h1 className="mt-1 text-xl font-semibold text-white">Orden de compra {order.code}</h1>
          <p className="text-xs text-slate-400">Emitida {formatDateTime(order.created_at)} · Solicitud {order.print_rfqs?.code} · {order.print_rfqs?.title}</p>
        </div>
        <button onClick={() => window.print()} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 print:hidden">Imprimir</button>
      </div>

      <section className="grid gap-3 rounded border border-slate-800 bg-[#141820] p-4 text-xs text-slate-300 md:grid-cols-3">
        <div><span className="block text-slate-500">Imprenta</span>{order.provider_name}{provider?.ruc ? ` · RUC ${provider.ruc}` : ''}</div>
        <div><span className="block text-slate-500">Contacto</span>{[provider?.phone, provider?.email, provider?.city].filter(Boolean).join(' · ') || '—'}</div>
        <div><span className="block text-slate-500">Condiciones de pago</span>{order.payment_terms}</div>
      </section>

      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="w-full text-xs text-slate-300">
          <thead className="bg-[#141820] text-left text-slate-500"><tr>{['SKU', 'Producto', 'Cantidad', 'Precio', 'Impuesto', 'Total', 'Entrega', 'Arte'].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id} className="border-t border-slate-800">
              <td className="p-2">{i.sku}</td><td className="p-2">{i.description}</td><td className="p-2">{Number(i.quantity).toLocaleString('es-PY')} {i.unit}</td>
              <td className="p-2">{money(Number(i.unit_price), order.currency)}</td><td className="p-2">{Number(i.tax_rate)}%</td><td className="p-2">{money(Number(i.total), order.currency)}</td>
              <td className="p-2">{formatDate(i.expected_delivery_date)}</td>
              <td className="p-2">{i.art_file_id ? <a href={`/api/print-rfq/files/${i.art_file_id}`} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline print:hidden">Ver arte</a> : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-right text-xs text-slate-400">Flete {money(Number(order.freight), order.currency)} · Impuesto {money(Number(order.tax_total), order.currency)} · <strong className="text-base text-white">Total {money(Number(order.total), order.currency)}</strong>{order.vat_included ? ' (precios con impuesto incluido)' : ''}</p>
      <p className="text-[11px] text-slate-500">Justificación de la compra: {order.justification}</p>
    </div>
  );
}
