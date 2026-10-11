'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { api, formatDate, money } from '@/components/print-rfq/format';

interface OrderRow { id: string; code: string; provider_name: string; currency: string; total: number; status: string; created_at: string; print_rfqs: { code: string; title: string } | null }

export default function OrdenesImprentasPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ orders: OrderRow[] }>('/api/print-rfq/orders').then((r) => setOrders(r.orders)).catch((e) => setError(e.message)); }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"><ClipboardList className="h-5 w-5 text-brand-500" />Órdenes de compra a imprentas</h1>
        <p className="mt-0.5 text-xs text-slate-400">Órdenes emitidas desde una solicitud, con la autorización y confirmación de un administrador.</p>
      </div>
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
      {!orders && !error && <p className="text-xs text-slate-400">Cargando…</p>}
      {orders?.length === 0 && <p className="py-10 text-center text-xs text-slate-400">Todavía no se emitió ninguna orden de compra.</p>}
      <ul className="space-y-2" data-testid="order-list">
        {orders?.map((o) => (
          <li key={o.id}>
            <Link href={`/imprentas/ordenes/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-[#141820] p-3 hover:border-slate-600">
              <div>
                <p className="text-sm font-medium text-white">{o.code} · {o.provider_name}</p>
                <p className="text-[11px] text-slate-400">{o.print_rfqs?.code} · {o.print_rfqs?.title} · emitida {formatDate(o.created_at)}</p>
              </div>
              <div className="flex items-center gap-3"><span className="text-sm text-white">{money(Number(o.total), o.currency)}</span><Badge variant={o.status === 'EMITIDA' ? 'success' : 'neutral'}>{o.status === 'EMITIDA' ? 'Emitida' : 'Anulada'}</Badge></div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
