'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { QuoteDocument, type DocLine, type DocQuote } from '@/components/sales-quotes/QuoteDocument';
import { api } from '@/components/print-rfq/format';

type Row = any;

/** Vista limpia del presupuesto (A4, sin menús) para imprimir o guardar como PDF desde el navegador. Requiere sesión. */
export default function PresupuestoImpresoPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ quote: Row; lines: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ quote: Row; lines: Row[] }>(`/api/sales-quotes/${id}`).then(setData).catch((e) => setError(e.message)); }, [id]);

  if (error) return <main className="p-8 text-sm text-red-600">No se pudo abrir el presupuesto: {error}</main>;
  if (!data) return <main className="p-8 text-sm text-neutral-500">Cargando…</main>;
  const lines: DocLine[] = data.lines.map((l) => ({ id: l.id, item_no: l.item_no, description: l.description, quantity: l.quantity == null ? null : Number(l.quantity), unit_price: Number(l.unit_price), line_total: l.line_total == null ? null : Number(l.line_total) }));
  return (
    <main className="min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4; margin: 10mm; } @media print { body { background: white !important; } }'}</style>
      <div className="mx-auto mb-4 flex max-w-[820px] justify-end print:hidden">
        <button onClick={() => window.print()} className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">Imprimir / Guardar como PDF</button>
      </div>
      <QuoteDocument quote={data.quote as DocQuote} lines={lines} />
    </main>
  );
}
