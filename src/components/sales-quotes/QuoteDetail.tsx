'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { QUOTE_STATUS, formatAmount, formatQuantity, isQuoteExpired } from '@/lib/sales-quotes/domain';
import { api, buttonClass, formatDateTime, ghostButtonClass, inputClass, postJson } from '@/components/print-rfq/format';
import { QuoteDocument, type DocLine, type DocQuote } from './QuoteDocument';

type Row = any;
interface Data { quote: Row; lines: Row[]; events: Row[]; work_order: Row | null; viewer_role: string }
const EVENT_LABEL: Record<string, string> = {
  'quote.created': 'Presupuesto creado', 'quote.updated': 'Presupuesto editado', 'quote.send': 'Marcado como enviado', 'quote.reopen': 'Reabierto como borrador (nueva versión)',
  'quote.reject': 'Rechazado por el cliente', 'quote.void': 'Anulado', 'quote.accepted': 'Aceptado: se generó la OT', 'work_order.status': 'Estado de la OT',
};

export function QuoteDetail({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [acceptor, setAcceptor] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try { setData(await api<Data>(`/api/sales-quotes/${id}`)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(task: () => Promise<unknown>, success: string) {
    setBusy(true); setNotice(null);
    try { await task(); setNotice({ ok: true, text: success }); await load(); } catch (e) { setNotice({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  const transition = (action: string, success: string, question?: string, noteText?: string) => {
    if (question && !window.confirm(question)) return;
    void act(() => postJson(`/api/sales-quotes/${id}/transition`, { action, note: noteText }), success);
  };

  if (error) return <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>;
  if (!data) return <p className="text-xs text-slate-400">Cargando…</p>;
  const { quote, lines, work_order: wo } = data;
  const status = QUOTE_STATUS[quote.status];
  const expired = isQuoteExpired(quote);
  const toggle = (line: Row) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(line.id)) next.delete(line.id);
    else { for (const other of lines) if (other.item_no === line.item_no) next.delete(other.id); next.add(line.id); }
    return next;
  });
  const docLines: DocLine[] = lines.map((l) => ({ id: l.id, item_no: l.item_no, description: l.description, quantity: l.quantity == null ? null : Number(l.quantity), unit_price: Number(l.unit_price), line_total: l.line_total == null ? null : Number(l.line_total) }));
  const docQuote: DocQuote = { ...quote };

  return (
    <div className="space-y-5">
      <header className="space-y-2 border-b border-slate-800 pb-4">
        <Link href="/presupuestos" className="text-[11px] text-slate-400 hover:text-white print:hidden">← Presupuestos</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-white">{quote.code} · {quote.client_name}</h1>
          <div className="flex items-center gap-2"><span className="text-[11px] text-slate-400">versión {quote.version}</span>{expired && <Badge variant="danger">Vencido</Badge>}<Badge variant={status.variant}>{status.label}</Badge></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/presupuesto-impreso/${id}`} target="_blank" className={ghostButtonClass}>Abrir para imprimir / guardar PDF</Link>
          {quote.status === 'BORRADOR' && <Link href={`/presupuestos/${id}/editar`} className={ghostButtonClass}>Editar</Link>}
          {quote.status === 'BORRADOR' && <button disabled={busy} className={buttonClass} onClick={() => transition('SEND', 'Marcado como enviado al cliente', '¿Marcar como enviado? Para modificarlo después hay que reabrirlo (nueva versión).')}>Marcar como enviado</button>}
          {quote.status === 'ENVIADO' && <button disabled={busy || expired} className={buttonClass} onClick={() => { setAccepting(true); setPicked(new Set()); setAcceptor(quote.attention ?? ''); }}>El cliente aceptó → generar OT</button>}
          {quote.status === 'ENVIADO' && <button disabled={busy} className={ghostButtonClass} onClick={() => { const reason = window.prompt('Motivo del rechazo (opcional)') ; if (reason !== null) transition('REJECT', 'Presupuesto marcado como rechazado', undefined, reason); }}>Rechazado</button>}
          {['ENVIADO', 'RECHAZADO'].includes(quote.status) && <button disabled={busy} className={ghostButtonClass} onClick={() => transition('REOPEN', 'Reabierto como borrador', '¿Reabrir como borrador? Se genera una versión nueva.')}>Reabrir para editar</button>}
          {['BORRADOR', 'ENVIADO', 'RECHAZADO'].includes(quote.status) && <button disabled={busy} className={ghostButtonClass} onClick={() => transition('VOID', 'Presupuesto anulado', '¿Anular el presupuesto?')}>Anular</button>}
        </div>
        {quote.status === 'RECHAZADO' && quote.rejection_reason && <p className="text-xs text-slate-300">Motivo: {quote.rejection_reason}</p>}
        {quote.status === 'ACEPTADO' && (
          <p className="text-xs text-emerald-400">Aceptado por {quote.accepted_by_name} el {formatDateTime(quote.accepted_at)}.{wo && <> OT generada: <Link href={`/ordenes-trabajo/${wo.id}`} className="underline">{wo.code}</Link></>}</p>
        )}
        {notice && <p role={notice.ok ? 'status' : 'alert'} className={`text-xs ${notice.ok ? 'text-emerald-400' : 'text-red-400'}`}>{notice.text}</p>}
      </header>

      {accepting && (
        <section className="space-y-3 rounded border border-brand-800/70 bg-[#141820] p-4" aria-label="Aceptación del cliente">
          <h2 className="text-sm font-semibold text-white">Aceptación → Orden de Trabajo</h2>
          <p className="text-[11px] text-slate-400">Marcá lo que el cliente aceptó: una escala de cantidad por ítem. La OT se crea con esas líneas.</p>
          <ul className="space-y-1">
            {lines.map((l) => (
              <li key={l.id}>
                <label className={`flex items-start gap-2 text-xs ${l.quantity == null ? 'text-slate-600' : 'text-slate-300'}`}>
                  <input type="checkbox" disabled={l.quantity == null} checked={picked.has(l.id)} onChange={() => toggle(l)} className="mt-0.5" />
                  <span>Ítem {l.item_no} · {l.description} — {l.quantity == null ? 'sin cantidad (no se puede aceptar)' : `${formatQuantity(Number(l.quantity))} × ${formatAmount(Number(l.unit_price), quote.currency)} = ${formatAmount(Number(l.line_total), quote.currency)}`}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[11px] text-slate-400">¿Quién aceptó por el cliente? *<input value={acceptor} onChange={(e) => setAcceptor(e.target.value)} className={inputClass} /></label>
            <label className="text-[11px] text-slate-400">Cómo / observaciones<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Aceptó por WhatsApp el …" className={inputClass} /></label>
          </div>
          <div className="flex gap-2">
            <button disabled={busy || picked.size === 0 || !acceptor.trim()} className={buttonClass}
              onClick={() => void act(async () => { await postJson(`/api/sales-quotes/${id}/accept`, { line_ids: [...picked], acceptor, note: note || undefined }); setAccepting(false); }, 'Aceptación registrada y OT generada')}>Generar Orden de Trabajo</button>
            <button className={ghostButtonClass} onClick={() => setAccepting(false)}>Cancelar</button>
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded border border-slate-800 bg-neutral-200 p-4"><QuoteDocument quote={docQuote} lines={docLines} /></div>

      <details className="rounded border border-slate-800 bg-[#141820] p-3">
        <summary className="cursor-pointer text-xs text-slate-300">Actividad ({data.events.length})</summary>
        <ul className="mt-2 space-y-1 text-[11px] text-slate-400">{data.events.map((e) => <li key={e.id}>{formatDateTime(e.created_at)} · {EVENT_LABEL[e.event] ?? e.event}</li>)}</ul>
      </details>
    </div>
  );
}
