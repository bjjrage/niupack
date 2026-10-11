'use client';

import React, { useState } from 'react';
import { CURRENCIES } from '@/lib/print-rfq/domain';
import { inputClass, buttonClass } from './format';

export interface QuoteItem {
  id: string; sku: string | null; description: string; quantity: number; unit: string; print_spec?: Record<string, string>;
  art?: Array<{ id: string; file_name: string }>;
}

const SPEC_LABEL: Record<string, string> = { process: 'Proceso', substrate: 'Sustrato', colors: 'Colores', dimensions: 'Medidas', finish: 'Acabado', notes: 'Notas' };

/**
 * Formulario de presupuesto. Lo usa la imprenta desde su enlace y una persona interna que carga un presupuesto recibido por otro canal.
 * Cada envío crea una versión nueva; el documento original es obligatorio.
 */
export function QuoteForm({ items, artHref, onSubmit, submitLabel = 'Enviar presupuesto' }: {
  items: QuoteItem[];
  artHref: (fileId: string) => string;
  onSubmit: (form: FormData) => Promise<void>;
  submitLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const number = (name: string) => (text(name) === '' ? NaN : Number(text(name)));
    const day = text('valid_until');
    const validUntil = day ? new Date(`${day}T23:59:59`) : null;
    if (!validUntil || Number.isNaN(validUntil.getTime())) { setError('Indicá hasta cuándo es válido el presupuesto.'); return; }
    const file = data.get('attachment');
    if (!(file instanceof File) || file.size === 0) { setError('Adjuntá el presupuesto original (PDF, foto, Excel o CSV).'); return; }

    const offer = {
      budget_number: text('budget_number'), currency: text('currency'), vat_included: data.get('vat_included') === 'on', invoice_available: data.get('invoice_available') === 'on',
      valid_until: validUntil.toISOString(), freight: number('freight'), payment_terms: text('payment_terms'), delivery_time: text('delivery_time') || null, observations: text('observations') || null,
    };
    const lines = items.map((item) => ({
      rfq_item_id: item.id, unit_price: text(`price_${item.id}`) === '' ? null : number(`price_${item.id}`),
      available_quantity: number(`available_${item.id}`), tax_rate: number(`tax_${item.id}`), lead_time_days: number(`lead_${item.id}`), observations: text(`obs_${item.id}`) || null,
    }));
    if (lines.some((l) => Number.isNaN(l.available_quantity) || Number.isNaN(l.tax_rate) || Number.isNaN(l.lead_time_days))) { setError('Completá disponibilidad, impuesto y plazo en todas las líneas.'); return; }
    if (Number.isNaN(offer.freight)) { setError('Indicá el flete (0 si no hay).'); return; }

    const form = new FormData();
    form.set('offer', JSON.stringify(offer));
    form.set('lines', JSON.stringify(lines));
    form.set('attachment', file);
    setPending(true); setError(null);
    try { await onSubmit(form); setDone(true); }
    catch (e) { setError((e as Error).message); }
    setPending(false);
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <p className="text-xs text-slate-400">Cargá tu precio por producto y adjuntá tu presupuesto original. Para no cotizar una línea, dejá el precio vacío y la disponibilidad en 0. Si te equivocás, enviá una corrección: se guarda como versión nueva.</p>
      {done && <p role="status" className="rounded border border-emerald-800/60 bg-emerald-950/40 p-3 text-xs text-emerald-300">Presupuesto enviado. Si necesitás corregir algo, volvé a enviarlo: queda como versión nueva.</p>}
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="space-y-2 rounded border border-slate-800 bg-[#0c0f14] p-3">
            <div>
              <p className="text-sm font-medium text-white">{item.description}</p>
              <p className="text-[11px] text-slate-400">{item.sku ? `SKU ${item.sku} · ` : ''}{item.quantity.toLocaleString('es-PY')} {item.unit}</p>
              {item.print_spec && Object.keys(item.print_spec).length > 0 && (
                <p className="text-[11px] text-slate-400">{Object.entries(item.print_spec).map(([k, v]) => `${SPEC_LABEL[k] ?? k}: ${v}`).join(' · ')}</p>
              )}
              {item.art?.map((a) => <a key={a.id} href={artHref(a.id)} target="_blank" rel="noreferrer" className="mr-3 text-[11px] text-brand-400 hover:underline">Arte: {a.file_name}</a>)}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <label className="text-[11px] text-slate-400">Precio unitario<input name={`price_${item.id}`} type="number" step="0.0001" min="0.0001" className={inputClass} /></label>
              <label className="text-[11px] text-slate-400">Disponible *<input required name={`available_${item.id}`} type="number" step="0.0001" min="0" className={inputClass} /></label>
              <label className="text-[11px] text-slate-400">Impuesto % *<input required name={`tax_${item.id}`} type="number" step="0.0001" min="0" max="100" defaultValue="10" className={inputClass} /></label>
              <label className="text-[11px] text-slate-400">Plazo (días) *<input required name={`lead_${item.id}`} type="number" step="1" min="0" max="3650" className={inputClass} /></label>
              <label className="text-[11px] text-slate-400">Observación<input name={`obs_${item.id}`} className={inputClass} /></label>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-[11px] text-slate-400">N° de presupuesto *<input required name="budget_number" className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Moneda *
          <select required name="currency" defaultValue="" className={inputClass}><option value="">Elegí</option>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="text-[11px] text-slate-400">Válido hasta *<input required name="valid_until" type="date" className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Flete fijo *<input required name="freight" type="number" min="0" step="0.01" defaultValue="0" className={inputClass} /></label>
      </div>
      <div className="flex flex-wrap gap-5 text-xs text-slate-300">
        <label className="flex items-center gap-2"><input type="checkbox" name="vat_included" /> Los precios ya incluyen el impuesto</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="invoice_available" defaultChecked /> Emite factura</label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-[11px] text-slate-400">Condiciones de pago *<textarea required name="payment_terms" rows={2} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Plazo de entrega general<textarea name="delivery_time" rows={2} className={inputClass} /></label>
      </div>
      <label className="block text-[11px] text-slate-400">Observaciones<textarea name="observations" rows={2} className={inputClass} /></label>
      <label className="block text-[11px] text-slate-400">Presupuesto original * (PDF, foto, Excel o CSV · máx. 4 MB)
        <input required name="attachment" type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv" className={`${inputClass} file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-xs file:text-white`} />
      </label>
      <button disabled={pending} className={buttonClass}>{pending ? 'Enviando…' : submitLabel}</button>
    </form>
  );
}
