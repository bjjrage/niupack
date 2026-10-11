'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  proposeAllocations, validateAllocation, type AllocationLine, type ComparativeLine, type OrderPreview, type RfqAllocation, type RfqItem,
} from '@/lib/print-rfq/domain';
import { buttonClass, ghostButtonClass, inputClass, money, postJson, formatDateTime } from './format';

/**
 * Asignación humana. El sistema propone escenarios; guardar, autorizar y confirmar son decisiones separadas.
 * Autorizar y confirmar la compra es solo de administradores.
 */
export function AllocationPanel({ rfqId, items, offers, allocations, isAdmin, onChange }: {
  rfqId: string; items: RfqItem[]; offers: ComparativeLine[]; allocations: RfqAllocation[]; isAdmin: boolean; onChange: () => void;
}) {
  const latest = allocations[0];
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries((latest?.lines ?? []).map((l) => [String(l.quote_version_item_id), String(l.quantity)])));
  const [justification, setJustification] = useState(latest?.justification ?? '');
  const [weights, setWeights] = useState({ price: 0.5, lead: 0.3, availability: 0.2 });
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [authorizeTick, setAuthorizeTick] = useState(false);
  const [orderTick, setOrderTick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const proposals = useMemo(() => {
    try { return { list: proposeAllocations(items, offers, { weights }), error: null }; }
    catch (e) { return { list: [], error: (e as Error).message }; }
  }, [items, offers, weights]);

  const lines: AllocationLine[] = Object.entries(quantities).filter(([, q]) => q.trim() !== '' && Number(q) !== 0).map(([id, q]) => ({ quote_version_item_id: id, quantity: Number(q) }));
  let remaining: ReturnType<typeof validateAllocation> | null = null;
  let validation = '';
  try { if (lines.length) remaining = validateAllocation(lines, items, offers); } catch (e) { validation = (e as Error).message; }

  async function run(task: () => Promise<void>, success: string) {
    setBusy(true); setMessage(null);
    try { await task(); setMessage({ ok: true, text: success }); onChange(); }
    catch (e) { setMessage({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }
  const resetDecisions = () => { setPreview(null); setAuthorizeTick(false); setOrderTick(false); };

  return (
    <section className="space-y-4" aria-label="Asignación y orden de compra">
      <div>
        <h2 className="text-sm font-semibold text-white">Asignación y orden de compra</h2>
        <p className="text-[11px] text-slate-400">El sistema propone; una persona asigna, un administrador autoriza y confirma. Solo se pueden asignar presupuestos con revisión humana y con el arte vigente.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {(['price', 'lead', 'availability'] as const).map((key) => (
          <label key={key} className="text-[11px] text-slate-400">Peso {{ price: 'precio', lead: 'plazo', availability: 'disponibilidad' }[key]}
            <input type="number" min="0" max="1" step="0.1" value={weights[key]} className={`${inputClass} w-24`}
              onChange={(e) => { const v = Number(e.target.value); setWeights((w) => ({ ...w, [key]: Number.isFinite(v) && v >= 0 ? v : 0 })); }} />
          </label>
        ))}
      </div>
      {proposals.error && <p role="alert" className="text-xs text-red-400">{proposals.error}</p>}
      {proposals.list.length === 0 && !proposals.error && <p className="text-xs text-amber-400">Todavía no hay presupuestos elegibles: falta la revisión humana, o están vencidos, revocados o con el arte desactualizado.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {proposals.list.map((p, index) => (
          <div key={index} className="rounded border border-slate-800 bg-[#141820] p-3">
            <p className="text-xs font-medium text-white">{p.label} — {p.currency}</p>
            <p className="mt-1 text-[11px] text-slate-400">{p.warnings.join(' · ')}</p>
            <button disabled={busy} className={`${ghostButtonClass} mt-2`} onClick={() => { setQuantities(Object.fromEntries(p.lines.map((l) => [l.quote_version_item_id, String(l.quantity)]))); resetDecisions(); }}>Usar como base editable</button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-200">Cantidad a comprar por imprenta (podés dividir o dejar cantidades sin asignar)</p>
        {offers.map((o) => {
          const item = items.find((i) => i.id === o.rfq_item_id);
          return (
            <label key={o.id} className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span className="min-w-72 flex-1">{item?.sku ? `${item.sku} · ` : ''}{item?.description} — {o.provider_name} ({o.currency} {o.unit_price ?? 'sin precio'})</span>
              <input type="number" min="0" step="0.0001" aria-label={`Asignar ${o.provider_name} ${item?.sku ?? item?.description}`} value={quantities[o.id] ?? ''} disabled={!!latest?.confirmed_at}
                onChange={(e) => { setQuantities((q) => ({ ...q, [o.id]: e.target.value })); resetDecisions(); }} className={`${inputClass} w-32`} />
              <span className="text-[11px] text-slate-500">máx. {o.available_quantity.toLocaleString('es-PY')}</span>
            </label>
          );
        })}
        {remaining?.filter((r) => r.unallocated > 0).map((r) => <p key={r.itemId} className="text-[11px] text-amber-400">Sin asignar: {items.find((i) => i.id === r.itemId)?.description} — {r.unallocated.toLocaleString('es-PY')}</p>)}
        {validation && <p role="alert" className="text-xs text-red-400">{validation}</p>}
      </div>

      <label className="block text-[11px] text-slate-400">Justificación de la asignación (mínimo 10 caracteres)
        <textarea rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} className={inputClass} disabled={!!latest?.confirmed_at} />
      </label>
      <button className={buttonClass} disabled={busy || !!validation || !lines.length || justification.trim().length < 10 || !!latest?.confirmed_at}
        onClick={() => void run(async () => { await postJson(`/api/print-rfq/rfqs/${rfqId}/allocations`, { lines, justification, revision: latest?.revision ?? 0 }); resetDecisions(); }, 'Asignación guardada; todavía no autorizada')}>
        Guardar revisión de la asignación
      </button>

      {latest && !latest.confirmed_at && (
        <div className="space-y-3 rounded border border-slate-800 bg-[#141820] p-4">
          <p className="text-xs text-slate-300">Revisión {latest.revision} guardada. Las acciones siguientes operan sobre esa revisión.</p>
          {!isAdmin && <p className="text-[11px] text-amber-400">Autorizar y confirmar la compra lo hace un administrador.</p>}
          {isAdmin && !latest.authorized_at && (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={authorizeTick} onChange={(e) => setAuthorizeTick(e.target.checked)} />Autorizo esta asignación y su justificación</label>
              <button disabled={busy || !authorizeTick} className={buttonClass} onClick={() => void run(async () => { await postJson(`/api/print-rfq/allocations/${latest.id}/authorize`, { confirm: true }); }, 'Asignación autorizada; todavía no hay órdenes')}>Autorizar asignación</button>
            </>
          )}
          {isAdmin && latest.authorized_at && (
            <>
              <p className="text-[11px] text-slate-400">Autorizada el {formatDateTime(latest.authorized_at)}.</p>
              <button disabled={busy} className={buttonClass} onClick={() => void run(async () => { setPreview(await postJson<OrderPreview>(`/api/print-rfq/allocations/${latest.id}/preview`, {})); setOrderTick(false); }, 'Preview listo; ninguna orden creada todavía')}>Generar preview de órdenes</button>
            </>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-3 rounded border border-brand-800/70 bg-[#141820] p-4">
          <h3 className="text-sm font-semibold text-white">Preview exacto — {preview.orders.length} orden(es)</h3>
          {preview.orders.map((o) => (
            <div key={`${o.provider_id}:${o.currency}`} className="rounded border border-slate-800 p-3">
              <p className="text-xs font-medium text-white">{o.provider_name} — {o.currency}</p>
              <table className="mt-2 w-full text-[11px] text-slate-300">
                <thead><tr className="text-left text-slate-500"><th>SKU / producto</th><th>Cantidad</th><th>Precio</th><th>Impuesto</th><th>Total</th><th>Entrega</th></tr></thead>
                <tbody>{o.items.map((i) => (
                  <tr key={i.quote_version_item_id} className="border-t border-slate-800"><td>{i.sku ? `${i.sku} · ` : ''}{i.product}</td><td>{i.quantity.toLocaleString('es-PY')} {i.unit}</td><td>{money(i.unit_price, o.currency)}</td><td>{i.tax_rate}%</td><td>{money(i.total, o.currency)}</td><td>{i.lead_time_days} d · {i.expected_delivery_date}</td></tr>
                ))}</tbody>
              </table>
              <p className="mt-2 text-[11px] text-slate-400">Flete {money(o.freight, o.currency)} · Impuesto {money(o.tax_total, o.currency)} · <strong className="text-white">Total {money(o.total, o.currency)}</strong> · Pago: {o.payment_terms}</p>
            </div>
          ))}
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={orderTick} onChange={(e) => setOrderTick(e.target.checked)} />Confirmo estas órdenes exactas, con sus cantidades, precios, arte y condiciones</label>
          <button disabled={busy || !orderTick} className={buttonClass} onClick={() => void run(async () => { await postJson(`/api/print-rfq/allocations/${preview.allocation_id}/confirm`, { hash: preview.hash, confirm: true }); setPreview(null); }, 'Órdenes de compra emitidas')}>Confirmar y emitir órdenes de compra</button>
        </div>
      )}

      {latest?.confirmed_at && <p className="text-xs text-emerald-400">Órdenes emitidas el {formatDateTime(latest.confirmed_at)}. <Link href="/compras/ordenes" className="underline">Ver órdenes de compra</Link></p>}
      {message && <p role={message.ok ? 'status' : 'alert'} className={`text-xs ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>}
    </section>
  );
}
