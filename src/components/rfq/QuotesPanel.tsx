'use client';

import React, { useMemo, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api, CHANNEL_LABEL, errorText, QUOTE_STATUS_LABEL, type QuoteRow, type RfqDetail } from './types';

const input = 'w-full rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white';
const lbl = 'block text-[11px] text-slate-400 mb-1';

interface Draft {
  supplier_id: string; currency: string; incoterm: string; payment_terms: string; lead_time_days: string; validity_date: string;
  fx_rate_to_usd: string; fx_rate_source: string; fx_rate_date: string; logistics_cost_per_unit_usd: string; logistics_cost_source: string; document_id?: string;
  items: Record<string, { unit_price: string; moq: string; technical_compliance: string }>;
}

const emptyDraft = (detail: RfqDetail): Draft => ({
  supplier_id: '', currency: '', incoterm: detail.rfq.incoterm, payment_terms: '', lead_time_days: '', validity_date: '', fx_rate_to_usd: '', fx_rate_source: '', fx_rate_date: '',
  logistics_cost_per_unit_usd: '', logistics_cost_source: '', items: Object.fromEntries(detail.items.map((i) => [i.id, { unit_price: '', moq: '', technical_compliance: 'UNKNOWN' }])),
});

const n = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

export function QuotesPanel({ detail, onChange, onNotice }: { detail: RfqDetail; onChange: () => Promise<void>; onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<'manual' | 'pdf' | 'validate'>('manual');
  const [validating, setValidating] = useState<QuoteRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfSupplier, setPdfSupplier] = useState('');
  const [extractionNote, setExtractionNote] = useState<string | null>(null);

  const supplierName = (id: string) => detail.suppliers.find((s) => s.id === id)?.name ?? 'Proveedor';
  const current = useMemo(() => detail.quotes.filter((q) => q.status !== 'SUPERSEDED'), [detail.quotes]);
  const history = useMemo(() => detail.quotes.filter((q) => q.status === 'SUPERSEDED'), [detail.quotes]);
  const needsFx = draft && draft.currency.length === 3 && draft.currency.toUpperCase() !== 'USD';
  const needsLogistics = draft && draft.incoterm !== detail.rfq.incoterm;

  const buildPayload = (d: Draft) => ({
    currency: d.currency.toUpperCase(), incoterm: d.incoterm, payment_terms: d.payment_terms || undefined, lead_time_days: n(d.lead_time_days), validity_date: d.validity_date || undefined,
    fx_rate_to_usd: n(d.fx_rate_to_usd), fx_rate_source: d.fx_rate_source || undefined, fx_rate_date: d.fx_rate_date || undefined,
    logistics_cost_per_unit_usd: n(d.logistics_cost_per_unit_usd), logistics_cost_source: d.logistics_cost_source || undefined,
    items: Object.entries(d.items).filter(([, v]) => v.unit_price.trim() !== '').map(([rfq_item_id, v]) => ({ rfq_item_id, unit_price: n(v.unit_price), moq: n(v.moq), technical_compliance: v.technical_compliance, price_scales: [] })),
  });

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const result = mode === 'validate' && validating
      ? await api(`/api/rfq/quotes/${validating.id}/validate`, { method: 'POST', body: JSON.stringify(buildPayload(draft)) })
      : await api(`/api/rfq/rfqs/${detail.rfq.id}/quotes`, { method: 'POST', body: JSON.stringify({ supplier_id: draft.supplier_id, document_id: draft.document_id, quote: buildPayload(draft) }) });
    setBusy(false);
    if (!result.ok) { onNotice({ kind: 'error', text: `No se guardó la cotización: ${errorText(result)}` }); return; }
    onNotice({ kind: 'ok', text: mode === 'validate' ? 'Cotización validada.' : draft.document_id ? 'Oferta registrada como extraída: falta validarla para que entre al comparador.' : 'Cotización registrada.' });
    setDraft(null); setValidating(null); setExtractionNote(null);
    await onChange();
  };

  const upload = async (file: File | null) => {
    if (!file || !pdfSupplier) return;
    setBusy(true);
    const form = new FormData();
    form.set('supplier_id', pdfSupplier);
    form.set('file', file);
    const result = await api<{ document_id: string; extraction_status: string; extraction_error?: string; duplicate: boolean; extraction: null | {
      currency: { value: string | null }; incoterm: { value: string | null }; payment_terms: { value: string | null }; lead_time_days: { value: number | null }; validity_date: { value: string | null };
      items: Array<{ rfq_item_id: string; match: string; unit_price: { value: number | null }; moq: { value: number | null } }>; missing: string[] } }>(`/api/rfq/rfqs/${detail.rfq.id}/documents`, { method: 'POST', body: form });
    setBusy(false);
    if (!result.ok) { onNotice({ kind: 'error', text: `No se pudo procesar el PDF: ${errorText(result)}` }); return; }
    await onChange();
    const x = result.data.extraction;
    if (!x) { onNotice({ kind: 'error', text: result.data.extraction_error ?? 'El PDF se guardó, pero no se pudo leer. Cargá los datos manualmente.' }); setMode('manual'); setDraft({ ...emptyDraft(detail), supplier_id: pdfSupplier, document_id: result.data.document_id }); return; }
    const d = emptyDraft(detail);
    d.supplier_id = pdfSupplier; d.document_id = result.data.document_id;
    d.currency = x.currency.value ?? ''; d.incoterm = x.incoterm.value ?? detail.rfq.incoterm; d.payment_terms = x.payment_terms.value ?? '';
    d.lead_time_days = x.lead_time_days.value?.toString() ?? ''; d.validity_date = x.validity_date.value ?? '';
    for (const it of x.items) if (it.unit_price.value) d.items[it.rfq_item_id] = { unit_price: String(it.unit_price.value), moq: it.moq.value ? String(it.moq.value) : '', technical_compliance: 'UNKNOWN' };
    setExtractionNote(`Extracción automática${result.data.duplicate ? ' (archivo ya cargado)' : ''}: revisá cada dato contra el PDF. Faltan: ${x.missing.length ? x.missing.join(', ') : 'nada'}. Nada se valida solo.`);
    setMode('pdf');
    setDraft(d);
  };

  const startValidate = (q: QuoteRow) => {
    const d = emptyDraft(detail);
    d.supplier_id = q.supplier_id; d.currency = q.currency; d.incoterm = q.incoterm; d.payment_terms = q.payment_terms ?? ''; d.lead_time_days = q.lead_time_days?.toString() ?? '';
    d.validity_date = q.validity_date ?? ''; d.fx_rate_to_usd = q.fx_rate_to_usd?.toString() ?? ''; d.fx_rate_source = q.fx_rate_source ?? '';
    d.logistics_cost_per_unit_usd = q.logistics_cost_per_unit_usd?.toString() ?? ''; d.logistics_cost_source = q.logistics_cost_source ?? '';
    for (const qi of q.quote_items) if (qi.rfq_item_id) d.items[qi.rfq_item_id] = { unit_price: String(qi.unit_price), moq: qi.moq?.toString() ?? '', technical_compliance: qi.technical_compliance };
    setMode('validate'); setValidating(q); setDraft(d);
  };

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const docFor = (quoteId: string) => detail.documents.find((d) => d.quote_id === quoteId);

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-800 bg-[#141820] p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Registrar una oferta</h3>
        <p className="text-[11px] text-slate-500">Las ofertas por enlace llegan solas. Acá cargás las que el proveedor mandó por correo, teléfono o PDF.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Button size="sm" variant="secondary" onClick={() => { setMode('manual'); setDraft(emptyDraft(detail)); }}>Carga manual</Button>
          <div className="flex items-end gap-2">
            <div><label className={lbl} htmlFor="pdf-supplier">Proveedor del PDF</label>
              <select id="pdf-supplier" value={pdfSupplier} onChange={(e) => setPdfSupplier(e.target.value)} className={input}>
                <option value="">Elegir…</option>{detail.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <label className={`inline-flex items-center gap-1.5 rounded border border-slate-700 px-2.5 py-1.5 text-xs ${pdfSupplier ? 'cursor-pointer text-slate-200 hover:bg-slate-800' : 'opacity-50'}`}>
              <Upload className="h-3.5 w-3.5" />Subir PDF
              <input type="file" accept="application/pdf" className="sr-only" disabled={!pdfSupplier || busy} aria-label="Subir PDF de cotización" onChange={(e) => { void upload(e.target.files?.[0] ?? null); e.target.value = ''; }} />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded border border-slate-800 bg-[#141820] p-4 space-y-3" aria-label="Cotizaciones vigentes">
        <h3 className="text-sm font-semibold text-white">Cotizaciones vigentes ({current.length})</h3>
        {current.length === 0 && <p className="text-xs text-slate-400">Todavía no hay ofertas.</p>}
        <ul className="divide-y divide-slate-800">
          {current.map((q) => (
            <li key={q.id} className="py-3 flex flex-wrap items-center justify-between gap-3" data-testid="quote-row">
              <div className="min-w-0">
                <p className="text-xs text-white">{supplierName(q.supplier_id)} <span className="text-slate-500">· versión {q.version} · {CHANNEL_LABEL[q.source_channel]}</span></p>
                <p className="text-[11px] text-slate-400">{q.currency} · {q.incoterm}{q.lead_time_days ? ` · ${q.lead_time_days} días` : ''}{q.validity_date ? ` · vigente hasta ${q.validity_date}` : ' · sin vigencia'}{q.submitted_by_label ? ` · ${q.submitted_by_label}` : ''}</p>
                <p className="text-[11px] text-slate-500">{q.quote_items.map((i) => `${i.sku}: ${i.unit_price}`).join(' · ')}</p>
                {docFor(q.id) && <a className="text-[11px] text-brand-400 hover:underline inline-flex items-center gap-1" href={`/api/rfq/documents/${docFor(q.id)!.id}`}><FileText className="h-3 w-3" />{docFor(q.id)!.file_name}</a>}
              </div>
              <div className="flex items-center gap-2">
                <Badge size="sm" variant={q.status === 'EXTRACTED' ? 'warning' : q.status === 'REVIEWED' || q.status === 'ACCEPTED' ? 'success' : 'neutral'}>{QUOTE_STATUS_LABEL[q.status]}</Badge>
                {q.status !== 'REVIEWED' && q.status !== 'ACCEPTED' && <Button size="sm" variant="secondary" onClick={() => startValidate(q)}>Revisar y validar</Button>}
                {(q.status === 'REVIEWED' || q.status === 'ACCEPTED') && <Button size="sm" variant="ghost" onClick={() => startValidate(q)}>Editar</Button>}
              </div>
            </li>
          ))}
        </ul>
        {history.length > 0 && (
          <details className="text-[11px] text-slate-500"><summary className="cursor-pointer">Historial de versiones reemplazadas ({history.length})</summary>
            <ul className="mt-2 space-y-1">{history.map((q) => <li key={q.id}>{supplierName(q.supplier_id)} · v{q.version} · {CHANNEL_LABEL[q.source_channel]} · {new Date(q.created_at).toLocaleString('es-PY')} · {q.quote_items.map((i) => `${i.sku} ${i.unit_price}`).join(', ')}</li>)}</ul>
          </details>
        )}
      </section>

      <Modal isOpen={Boolean(draft)} onClose={() => { setDraft(null); setValidating(null); setExtractionNote(null); }} maxWidth="2xl"
        title={mode === 'validate' ? 'Validar cotización' : mode === 'pdf' ? 'Revisar lo extraído del PDF' : 'Registrar cotización'}
        footer={<><Button variant="outline" size="sm" onClick={() => { setDraft(null); setValidating(null); setExtractionNote(null); }}>Cancelar</Button>
          <Button size="sm" isLoading={busy} disabled={!draft || !draft.supplier_id || draft.currency.length !== 3} onClick={save}>{mode === 'validate' ? 'Confirmar que los datos son correctos' : 'Guardar'}</Button></>}>
        {draft && (
          <div className="space-y-4 text-xs">
            {extractionNote && <p role="note" className="rounded border border-amber-800/60 bg-amber-950/30 p-3 text-amber-200">{extractionNote}</p>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2"><label className={lbl} htmlFor="q-sup">Proveedor *</label>
                <select id="q-sup" disabled={mode === 'validate'} value={draft.supplier_id} onChange={(e) => set({ supplier_id: e.target.value })} className={input}><option value="">Elegir…</option>{detail.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className={lbl} htmlFor="q-cur">Moneda *</label><input id="q-cur" maxLength={3} value={draft.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} className={input} placeholder="USD" /></div>
              <div><label className={lbl} htmlFor="q-inc">Incoterm *</label><select id="q-inc" value={draft.incoterm} onChange={(e) => set({ incoterm: e.target.value })} className={input}>{['EXW', 'FOB', 'CIF', 'CIP', 'DDP'].map((i) => <option key={i}>{i}</option>)}</select></div>
              <div><label className={lbl} htmlFor="q-pay">Condición de pago</label><input id="q-pay" value={draft.payment_terms} onChange={(e) => set({ payment_terms: e.target.value })} className={input} /></div>
              <div><label className={lbl} htmlFor="q-lt">Plazo (días)</label><input id="q-lt" inputMode="numeric" value={draft.lead_time_days} onChange={(e) => set({ lead_time_days: e.target.value })} className={input} /></div>
              <div><label className={lbl} htmlFor="q-vd">Vigencia hasta</label><input id="q-vd" type="date" value={draft.validity_date} onChange={(e) => set({ validity_date: e.target.value })} className={input} /></div>
            </div>
            {needsFx && (
              <div className="rounded border border-slate-800 p-3 space-y-2">
                <p className="text-slate-300">Moneda distinta de USD: PYG usa el tipo de cambio de NIUPACK; para otras monedas ingresá el tipo de cambio a USD con su fuente (sin esto la oferta queda NO COMPARABLE).</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className={lbl} htmlFor="q-fx">USD por 1 {draft.currency}</label><input id="q-fx" inputMode="decimal" value={draft.fx_rate_to_usd} onChange={(e) => set({ fx_rate_to_usd: e.target.value })} className={input} /></div>
                  <div><label className={lbl} htmlFor="q-fxs">Fuente</label><input id="q-fxs" value={draft.fx_rate_source} onChange={(e) => set({ fx_rate_source: e.target.value })} className={input} placeholder="Ej.: BCB 10/10/2026" /></div>
                  <div><label className={lbl} htmlFor="q-fxd">Fecha</label><input id="q-fxd" type="date" value={draft.fx_rate_date} onChange={(e) => set({ fx_rate_date: e.target.value })} className={input} /></div>
                </div>
              </div>
            )}
            {needsLogistics && (
              <div className="rounded border border-slate-800 p-3 space-y-2">
                <p className="text-slate-300">El Incoterm ofertado ({draft.incoterm}) difiere del pedido ({detail.rfq.incoterm}). Para compararlo, ingresá el costo logístico por unidad en USD y su fuente.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl} htmlFor="q-lg">Logística USD/unidad</label><input id="q-lg" inputMode="decimal" value={draft.logistics_cost_per_unit_usd} onChange={(e) => set({ logistics_cost_per_unit_usd: e.target.value })} className={input} /></div>
                  <div><label className={lbl} htmlFor="q-lgs">Fuente</label><input id="q-lgs" value={draft.logistics_cost_source} onChange={(e) => set({ logistics_cost_source: e.target.value })} className={input} /></div>
                </div>
              </div>
            )}
            <table className="w-full text-left">
              <thead className="text-[11px] text-slate-400"><tr><th className="py-1">Ítem</th><th>Precio unitario</th><th>MOQ</th><th>Cumple especificación</th></tr></thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.id} className="border-t border-slate-800">
                    <td className="py-2 pr-2 text-white">{i.line_no}. {i.sku}<span className="block text-[11px] text-slate-500">{i.quantity.toLocaleString('es-PY')} {i.unit}</span></td>
                    <td className="pr-2"><input aria-label={`Precio unitario ítem ${i.line_no}`} inputMode="decimal" value={draft.items[i.id]?.unit_price ?? ''} onChange={(e) => set({ items: { ...draft.items, [i.id]: { ...draft.items[i.id], unit_price: e.target.value } } })} className={input} /></td>
                    <td className="pr-2"><input aria-label={`MOQ ítem ${i.line_no}`} inputMode="numeric" value={draft.items[i.id]?.moq ?? ''} onChange={(e) => set({ items: { ...draft.items, [i.id]: { ...draft.items[i.id], moq: e.target.value } } })} className={input} /></td>
                    <td><select aria-label={`Cumplimiento ítem ${i.line_no}`} value={draft.items[i.id]?.technical_compliance ?? 'UNKNOWN'} onChange={(e) => set({ items: { ...draft.items, [i.id]: { ...draft.items[i.id], technical_compliance: e.target.value } } })} className={input}>
                      <option value="UNKNOWN">Sin verificar</option><option value="COMPLIES">Cumple</option><option value="PARTIAL">Parcial</option><option value="NOT_COMPLIES">No cumple</option></select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
