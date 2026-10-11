'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { WORK_ORDER_STATUS } from '@/lib/sales-quotes/domain';
import { api, formatDate } from '@/components/print-rfq/format';

type Row = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export default function OrdenesTrabajoPage() {
  const [orders, setOrders] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ work_orders: Row[] }>('/api/sales-quotes/work-orders').then((r) => setOrders(r.work_orders)).catch((e) => setError(e.message)); }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"><Wrench className="h-5 w-5 text-brand-500" />Órdenes de Trabajo</h1>
        <p className="mt-0.5 text-xs text-slate-400">Se generan al aceptar un presupuesto. Son un documento interno: no se envían al cliente.</p>
      </div>
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
      {!orders && !error && <p className="text-xs text-slate-400">Cargando…</p>}
      {orders?.length === 0 && <p className="py-10 text-center text-xs text-slate-400">Todavía no hay órdenes de trabajo. Se crean cuando un presupuesto enviado es aceptado.</p>}
      <ul className="space-y-2" data-testid="work-order-list">
        {orders?.map((o) => (
          <li key={o.id}>
            <Link href={`/ordenes-trabajo/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-[#141820] p-3 hover:border-slate-600">
              <div><p className="text-sm font-medium text-white">{o.code} · {o.client_name}</p><p className="text-[11px] text-slate-400">Presupuesto {o.sales_quotes?.code}{o.sales_quotes?.subject ? ` · ${o.sales_quotes.subject}` : ''} · creada {formatDate(o.created_at)}</p></div>
              <Badge variant={WORK_ORDER_STATUS[o.status].variant}>{WORK_ORDER_STATUS[o.status].label}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
