'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { defaultIntro, formatAmount, lineTotal } from '@/lib/sales-quotes/domain';
import { api, buttonClass, ghostButtonClass, inputClass } from '@/components/print-rfq/format';

interface SkuOption { id: string; sku: string; name: string; description: string }
interface CompanyOption { id: string; name: string }
interface DraftLine { key: number; item_no: string; sku: string; product_attribute_id: string | null; description: string; quantity: string; unit_price: string }
let counter = 0;
const blank = (itemNo: number, from?: Partial<DraftLine>): DraftLine => ({ key: ++counter, item_no: String(itemNo), sku: '', product_attribute_id: null, description: '', quantity: '', unit_price: '', ...from });
const today = () => new Date().toISOString().slice(0, 10);

interface InitialQuote {
  id?: string;
  header?: Record<string, string | null>;
  lines?: Array<{ item_no: number; sku: string | null; product_attribute_id: string | null; description: string; quantity: number | null; unit_price: number }>;
}

/** Crear o editar un presupuesto: el SKU se importa del catálogo y cada ítem admite varias escalas de cantidad. */
export function QuoteEditor({ initial }: { initial?: InitialQuote }) {
  const router = useRouter();
  const h = initial?.header ?? {};
  const [form, setForm] = useState({
    client_name: h.client_name ?? '', company_id: h.company_id ?? '', attention: h.attention ?? '', subject: h.subject ?? '', intro: h.intro ?? '',
    quote_date: h.quote_date ?? today(), valid_until: h.valid_until ?? '', currency: h.currency ?? 'PYG', payment_terms: h.payment_terms ?? 'A convenir',
    delivery_terms: h.delivery_terms ?? 'A convenir', notes: h.notes ?? '', signer_name: h.signer_name ?? '', signer_title: h.signer_title ?? '', signer_company: h.signer_company ?? '',
  });
  const [lines, setLines] = useState<DraftLine[]>(() => initial?.lines?.length
    ? initial.lines.map((l) => blank(l.item_no, { sku: l.sku ?? '', product_attribute_id: l.product_attribute_id, description: l.description, quantity: l.quantity == null ? '' : String(l.quantity), unit_price: String(l.unit_price) }))
    : [blank(1)]);
  const [skus, setSkus] = useState<SkuOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ skus: SkuOption[] }>('/api/sales-quotes/lookup?kind=skus&q=').then((r) => setSkus(r.skus)).catch(() => undefined);
    api<{ companies: CompanyOption[] }>('/api/sales-quotes/lookup?kind=companies&q=').then((r) => setCompanies(r.companies)).catch(() => undefined);
    if (!initial?.id) {
      api<{ defaults: Record<string, string> }>('/api/sales-quotes/lookup?kind=defaults').then(({ defaults }) =>
        setForm((f) => ({ ...f, signer_name: f.signer_name || defaults.signer_name, signer_title: f.signer_title || defaults.signer_title, signer_company: f.signer_company || defaults.signer_company,
          payment_terms: defaults.payment_terms || f.payment_terms, delivery_terms: defaults.delivery_terms || f.delivery_terms }))).catch(() => undefined);
    }
  }, [initial?.id]);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const pickCompany = (name: string) => {
    const match = companies.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    setForm((f) => ({ ...f, client_name: name, company_id: match?.id ?? '' }));
  };
  const update = (key: number, patch: Partial<DraftLine>) => setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickSku = (key: number, sku: string) => {
    const match = skus.find((s) => s.sku.toLowerCase() === sku.trim().toLowerCase());
    setLines((list) => list.map((l) => (l.key !== key ? l : match ? { ...l, sku: match.sku, product_attribute_id: match.id, description: l.description || match.description } : { ...l, sku, product_attribute_id: null })));
  };
  const nextItemNo = Math.max(0, ...lines.map((l) => Number(l.item_no) || 0)) + 1;
  const total = useMemo(() => lines.reduce((sum, l) => sum + (lineTotal(l.quantity === '' ? null : Number(l.quantity), Number(l.unit_price) || 0) ?? 0), 0), [lines]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const body = {
        header: { ...form, company_id: form.company_id || null, valid_until: form.valid_until || '' },
        lines: lines.map((l) => ({ item_no: Number(l.item_no), sku: l.sku, product_attribute_id: l.product_attribute_id, description: l.description, quantity: l.quantity === '' ? null : Number(l.quantity), unit_price: Number(l.unit_price) })),
      };
      const saved = await api<{ id: string }>(initial?.id ? `/api/sales-quotes/${initial.id}` : '/api/sales-quotes', { method: initial?.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      router.push(`/presupuestos/${saved.id}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <datalist id="quote-skus">{skus.map((s) => <option key={s.id} value={s.sku}>{s.name}</option>)}</datalist>
      <datalist id="quote-companies">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}

      <section className="grid gap-3 rounded border border-slate-800 bg-[#141820] p-4 md:grid-cols-3">
        <label className="text-[11px] text-slate-400">Cliente * (del CRM o escrito)<input required list="quote-companies" value={form.client_name} onChange={(e) => pickCompany(e.target.value)} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">A la atención de<input value={form.attention} onChange={(e) => set('attention', e.target.value)} placeholder="Nombre de la persona" className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Para qué es el presupuesto<input value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="potes de polipapel" className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Fecha<input type="date" required value={form.quote_date} onChange={(e) => set('quote_date', e.target.value)} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Válido hasta (opcional)<input type="date" value={form.valid_until} min={form.quote_date} onChange={(e) => set('valid_until', e.target.value)} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Moneda<select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputClass}><option value="PYG">Guaraníes (Gs.)</option><option value="USD">Dólares (USD)</option></select></label>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Ítems <span className="text-[11px] font-normal text-slate-400">· precios con IVA incluido</span></h2>
          <button type="button" onClick={() => setLines((l) => [...l, blank(nextItemNo)])} className={ghostButtonClass}><Plus className="h-3 w-3" />Agregar ítem</button>
        </div>
        <div className="hidden grid-cols-12 gap-2 text-[11px] text-slate-500 md:grid">
          <span>Ítem</span><span className="col-span-2">SKU</span><span className="col-span-4">Descripción</span><span className="col-span-1">Cantidad</span><span className="col-span-2">Precio unit. c/ IVA</span><span>Total</span><span />
        </div>
        {lines.map((l) => {
          const qty = l.quantity === '' ? null : Number(l.quantity);
          return (
            <div key={l.key} className="grid grid-cols-2 items-start gap-2 rounded border border-slate-800 bg-[#141820] p-2 md:grid-cols-12" data-testid="quote-line">
              <input aria-label="Número de ítem" type="number" min={1} required value={l.item_no} onChange={(e) => update(l.key, { item_no: e.target.value })} className={inputClass} />
              <input aria-label="SKU" list="quote-skus" value={l.sku} onChange={(e) => pickSku(l.key, e.target.value)} placeholder="SKU" className={`${inputClass} md:col-span-2`} />
              <textarea aria-label="Descripción" required rows={2} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className={`${inputClass} col-span-2 md:col-span-4`} />
              <input aria-label="Cantidad" type="number" min="0.0001" step="any" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} placeholder="-" className={`${inputClass} md:col-span-1`} />
              <input aria-label="Precio unitario con IVA" type="number" min="0" step="any" required value={l.unit_price} onChange={(e) => update(l.key, { unit_price: e.target.value })} className={`${inputClass} md:col-span-2`} />
              <span className="self-center text-xs text-slate-300">{qty == null ? '-' : formatAmount(lineTotal(qty, Number(l.unit_price) || 0), form.currency)}</span>
              <span className="flex items-center gap-2 self-center">
                <button type="button" title="Otra escala de cantidad para este ítem" aria-label="Agregar escala" onClick={() => setLines((list) => { const i = list.findIndex((x) => x.key === l.key); const copy = blank(Number(l.item_no), { sku: l.sku, product_attribute_id: l.product_attribute_id, description: l.description }); return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)]; })} className="text-slate-400 hover:text-white"><Copy className="h-3.5 w-3.5" /></button>
                {lines.length > 1 && <button type="button" aria-label="Quitar línea" onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))} className="text-slate-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>}
              </span>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-500">Para ofrecer varias escalas del mismo ítem usá el ícono de copiar: repite el ítem con otra cantidad y otro precio. Sin cantidad, la línea informa solo el precio (por ejemplo, una tapa opcional). Suma de líneas con cantidad: <strong className="text-slate-300">{formatAmount(total, form.currency)}</strong> (referencia; las escalas son alternativas).</p>
      </section>

      <section className="grid gap-3 rounded border border-slate-800 bg-[#141820] p-4 md:grid-cols-2">
        <label className="text-[11px] text-slate-400 md:col-span-2">Texto de presentación (si lo dejás vacío se usa el estándar)<textarea rows={2} value={form.intro} onChange={(e) => set('intro', e.target.value)} placeholder={defaultIntro(form.subject)} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Condición de pago<input value={form.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Plazo de entrega<input value={form.delivery_terms} onChange={(e) => set('delivery_terms', e.target.value)} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400 md:col-span-2">Aclaraciones (opcional)<textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Firma: nombre<input value={form.signer_name} onChange={(e) => set('signer_name', e.target.value)} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Firma: cargo<input value={form.signer_title} onChange={(e) => set('signer_title', e.target.value)} className={inputClass} /></label>
        <label className="text-[11px] text-slate-400">Firma: empresa<input value={form.signer_company} onChange={(e) => set('signer_company', e.target.value)} className={inputClass} /></label>
      </section>

      <button disabled={busy} className={buttonClass}>{busy ? 'Guardando…' : initial?.id ? 'Guardar cambios' : 'Guardar borrador'}</button>
    </form>
  );
}
