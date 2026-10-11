'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { QuoteForm, type QuoteItem } from '@/components/print-rfq/QuoteForm';
import { api, formatDate } from '@/components/print-rfq/format';

interface PortalView {
  rfq: { code: string; title: string; specifications: string | null; required_date: string | null; expires_at: string };
  provider_name: string;
  items: QuoteItem[];
}

/** Portal público de la imprenta: se entra solo con el enlace personal. Muestra los productos, la ficha de impresión y el arte. */
export default function CotizarImprentaPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PortalView>(`/api/print-rfq/public/${token}`).then(setView).catch((e) => setError(e.message));
  }, [token]);

  if (error) return <main className="grid min-h-screen place-items-center bg-[#0c0f14] p-6 text-white"><div className="max-w-md rounded-lg border border-red-800 p-6 text-center"><p className="font-semibold">Enlace no disponible</p><p className="mt-2 text-sm text-slate-300">{error}</p></div></main>;
  if (!view) return <main className="grid min-h-screen place-items-center bg-[#0c0f14] text-slate-300">Cargando solicitud…</main>;

  return (
    <main className="min-h-screen bg-[#0c0f14] p-5 text-white md:p-10">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="border-b border-slate-800 pb-5">
          <p className="text-sm font-bold tracking-[0.22em] text-red-500">NIUPACK</p>
          <h1 className="mt-2 text-2xl font-bold">Solicitud de presupuesto de impresión</h1>
          <p className="text-slate-400">{view.rfq.code} · {view.rfq.title}</p>
          <p className="mt-1 text-sm text-slate-300">Para {view.provider_name}. Podés cotizar hasta el {formatDate(view.rfq.expires_at)}{view.rfq.required_date ? ` · necesitamos para ${formatDate(view.rfq.required_date)}` : ''}. Enviar un presupuesto no implica una orden de compra.</p>
          {view.rfq.specifications && <p className="mt-2 text-sm text-slate-300">{view.rfq.specifications}</p>}
        </header>
        <section className="rounded-lg border border-slate-800 bg-[#141820] p-5">
          <QuoteForm items={view.items} artHref={(fileId) => `/api/print-rfq/public/${token}/art/${fileId}`}
            onSubmit={async (form) => { await api(`/api/print-rfq/public/${token}`, { method: 'POST', body: form }); }} />
        </section>
      </div>
    </main>
  );
}
