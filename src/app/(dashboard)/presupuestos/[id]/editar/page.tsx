'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { QuoteEditor } from '@/components/sales-quotes/QuoteEditor';
import { api } from '@/components/print-rfq/format';

type Row = any;

export default function EditarPresupuestoPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ quote: Row; lines: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ quote: Row; lines: Row[] }>(`/api/sales-quotes/${id}`).then(setData).catch((e) => setError(e.message)); }, [id]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <Link href={`/presupuestos/${id}`} className="text-[11px] text-slate-400 hover:text-white">← Volver al presupuesto</Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Editar presupuesto {data?.quote.code}</h1>
      </div>
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
      {data && data.quote.status !== 'BORRADOR' && <p role="alert" className="text-xs text-amber-400">Solo se edita un borrador. Volvé al presupuesto y reabrilo.</p>}
      {data && data.quote.status === 'BORRADOR' && (
        <QuoteEditor initial={{ id, header: data.quote, lines: data.lines.map((l) => ({ item_no: l.item_no, sku: l.sku, product_attribute_id: l.product_attribute_id, description: l.description, quantity: l.quantity == null ? null : Number(l.quantity), unit_price: Number(l.unit_price) })) }} />
      )}
    </div>
  );
}
