'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { api, errorText } from '@/components/rfq/types';

interface RfqSummary { id: string; code: string; title: string; status: string; items_count: number; quotes_count: number; invitations_sent: number; invitations: number }

/** Cotizaciones: acceso rápido a las RFQ que ya recibieron ofertas, para comparar y decidir. */
export default function QuotesIndexPage() {
  const [rfqs, setRfqs] = useState<RfqSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const result = await api<{ rfqs: RfqSummary[] }>('/api/rfq/rfqs');
      if (!result.ok) setError(errorText(result));
      else setRfqs(result.data.rfqs);
    })();
  }, []);

  const withQuotes = (rfqs ?? []).filter((r) => r.quotes_count > 0);
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-xl font-semibold text-white">Cotizaciones recibidas</h1>
        <p className="text-xs text-slate-400 mt-0.5">Cada RFQ con ofertas se compara por ítem y proveedor. Abrí la RFQ y usá la pestaña Comparador.</p>
      </div>
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
      {rfqs && withQuotes.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Todavía no se recibieron ofertas. <Link href="/rfq/rfqs" className="text-brand-400 hover:underline">Ir a las RFQ</Link></p>}
      <ul className="space-y-2">
        {withQuotes.map((r) => (
          <li key={r.id}>
            <Link href={`/rfq/rfqs/${r.id}`} className="flex items-center justify-between rounded border border-slate-800 bg-[#141820] p-3 hover:border-slate-600">
              <span className="text-sm text-white">{r.code} · {r.title}</span>
              <span className="flex items-center gap-2 text-[11px] text-slate-400">{r.quotes_count} oferta(s) <Badge size="sm" variant={r.status === 'DECIDED' ? 'success' : 'brand'}>{r.status === 'DECIDED' ? 'Con decisión' : 'Para comparar'}</Badge></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
