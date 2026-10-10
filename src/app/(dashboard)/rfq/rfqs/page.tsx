'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api, errorText } from '@/components/rfq/types';

interface RfqSummary { id: string; code: string; title: string; status: string; incoterm: string; delivery_destination: string; deadline_at: string | null; items_count: number; invitations: number; invitations_sent: number; quotes_count: number }

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Borrador', APPROVED: 'Invitaciones preparadas', SENT: 'Enviada', REPLIED: 'Con ofertas', PARSED: 'Ofertas por validar', BENCHMARKED: 'Comparada', DECIDED: 'Con decisión', CANCELLED: 'Cancelada', REVIEW_REQUIRED: 'En revisión' };
const input = 'w-full rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white';
const lbl = 'block text-[11px] text-slate-400 mb-1';

// Todo en blanco: ni código, ni SKU, ni cantidades vienen pre-cargados.
const blankItem = () => ({ sku: '', description: '', quantity: '', unit: 'UN', alternatives: '', material: '', technical_conditions: '' });

export default function RfqListPage() {
  const router = useRouter();
  const [rfqs, setRfqs] = useState<RfqSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', delivery_destination: '', incoterm: 'FOB', payment_terms: '', deadline: '', technical_conditions: '', notes: '' });
  const [items, setItems] = useState([blankItem()]);

  const load = useCallback(async () => {
    const result = await api<{ rfqs: RfqSummary[] }>('/api/rfq/rfqs');
    if (!result.ok) setLoadError(errorText(result));
    else { setLoadError(null); setRfqs(result.data.rfqs); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setItem = (index: number, patch: Partial<ReturnType<typeof blankItem>>) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const create = async () => {
    setBusy(true);
    setFormError(null);
    const payload = {
      title: form.title, delivery_destination: form.delivery_destination, incoterm: form.incoterm, payment_terms: form.payment_terms || undefined,
      deadline_at: form.deadline ? new Date(`${form.deadline}T23:59:59`).toISOString() : undefined, technical_conditions: form.technical_conditions || undefined, notes: form.notes || undefined,
      items: items.map((it) => ({
        sku: it.sku, description: it.description || undefined, quantity: Number(it.quantity.replace(/\./g, '').replace(',', '.')), unit: it.unit || 'UN', material: it.material || undefined,
        technical_conditions: it.technical_conditions || undefined,
        alternative_quantities: it.alternatives.split(/[;,\s]+/).filter(Boolean).map((v) => Number(v.replace(/\./g, ''))),
      })),
    };
    const result = await api<{ rfq_id: string }>('/api/rfq/rfqs', { method: 'POST', body: JSON.stringify(payload) });
    setBusy(false);
    if (!result.ok) { setFormError(errorText(result)); return; }
    router.push(`/rfq/rfqs/${result.data.rfq_id}`);
  };

  const ready = form.title.trim().length >= 3 && form.delivery_destination.trim().length >= 2 && items.every((it) => it.sku.trim() && Number(it.quantity.replace(/\./g, '').replace(',', '.')) > 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">RFQ · Solicitudes de cotización</h1>
          <p className="text-xs text-slate-400 mt-0.5">Pedí precios a varios proveedores por ítem, recibí sus ofertas, compará contra tu costo y registrá la decisión.</p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}><Plus className="h-3.5 w-3.5" />Nueva RFQ</Button>
      </div>

      {creating && (
        <section className="rounded border border-slate-800 bg-[#141820] p-4 space-y-4" aria-label="Nueva RFQ">
          {formError && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-2.5 text-xs text-red-300">{formError}</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2"><label className={lbl} htmlFor="f-title">Título *</label><input id="f-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} /></div>
            <div><label className={lbl} htmlFor="f-dest">Destino de entrega *</label><input id="f-dest" value={form.delivery_destination} onChange={(e) => setForm({ ...form, delivery_destination: e.target.value })} className={input} /></div>
            <div><label className={lbl} htmlFor="f-inc">Incoterm *</label><select id="f-inc" value={form.incoterm} onChange={(e) => setForm({ ...form, incoterm: e.target.value })} className={input}>{['EXW', 'FOB', 'CIF', 'CIP', 'DDP'].map((i) => <option key={i}>{i}</option>)}</select></div>
            <div><label className={lbl} htmlFor="f-pay">Condición de pago</label><input id="f-pay" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className={input} /></div>
            <div><label className={lbl} htmlFor="f-dl">Fecha límite de respuesta</label><input id="f-dl" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={input} /></div>
            <div className="md:col-span-3"><label className={lbl} htmlFor="f-tc">Condiciones técnicas generales</label><input id="f-tc" value={form.technical_conditions} onChange={(e) => setForm({ ...form, technical_conditions: e.target.value })} className={input} /></div>
          </div>

          <div className="space-y-3">
            {items.map((it, index) => (
              <fieldset key={index} className="rounded border border-slate-800 p-3">
                <legend className="px-1 text-xs font-semibold text-white">Ítem {index + 1}</legend>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div><label className={lbl} htmlFor={`sku-${index}`}>SKU *</label><input id={`sku-${index}`} value={it.sku} onChange={(e) => setItem(index, { sku: e.target.value })} className={input} /></div>
                  <div className="md:col-span-2"><label className={lbl} htmlFor={`desc-${index}`}>Descripción</label><input id={`desc-${index}`} value={it.description} onChange={(e) => setItem(index, { description: e.target.value })} className={input} /></div>
                  <div><label className={lbl} htmlFor={`qty-${index}`}>Cantidad *</label><input id={`qty-${index}`} inputMode="numeric" value={it.quantity} onChange={(e) => setItem(index, { quantity: e.target.value })} className={input} /></div>
                  <div><label className={lbl} htmlFor={`unit-${index}`}>Unidad</label><input id={`unit-${index}`} value={it.unit} onChange={(e) => setItem(index, { unit: e.target.value })} className={input} /></div>
                  <div><label className={lbl} htmlFor={`alt-${index}`}>Escalas (cantidades)</label><input id={`alt-${index}`} value={it.alternatives} onChange={(e) => setItem(index, { alternatives: e.target.value })} className={input} placeholder="separadas por coma" /></div>
                  <div className="md:col-span-2"><label className={lbl} htmlFor={`mat-${index}`}>Material</label><input id={`mat-${index}`} value={it.material} onChange={(e) => setItem(index, { material: e.target.value })} className={input} /></div>
                  <div className="md:col-span-3"><label className={lbl} htmlFor={`tc-${index}`}>Especificaciones técnicas</label><input id={`tc-${index}`} value={it.technical_conditions} onChange={(e) => setItem(index, { technical_conditions: e.target.value })} className={input} /></div>
                  {items.length > 1 && <div className="flex items-end"><Button size="sm" variant="ghost" aria-label={`Quitar ítem ${index + 1}`} onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}><Trash2 className="h-3.5 w-3.5" /></Button></div>}
                </div>
              </fieldset>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setItems((prev) => [...prev, blankItem()])}><Plus className="h-3.5 w-3.5" />Agregar ítem</Button>
          </div>

          <div className="flex gap-2">
            <Button size="sm" isLoading={busy} disabled={!ready} onClick={create}>Crear RFQ</Button>
            <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancelar</Button>
          </div>
        </section>
      )}

      {loadError && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">No se pudieron cargar las RFQ: {loadError}</p>}
      {loading && <p className="text-xs text-slate-400">Cargando…</p>}
      {!loading && !loadError && rfqs.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Todavía no hay RFQ. Creá la primera con “Nueva RFQ”.</p>}
      <ul className="space-y-2">
        {rfqs.map((r) => (
          <li key={r.id}>
            <Link href={`/rfq/rfqs/${r.id}`} className="block rounded border border-slate-800 bg-[#141820] p-3 hover:border-slate-600" data-testid="rfq-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-white">{r.code} · {r.title}</p>
                <Badge variant={r.status === 'DECIDED' ? 'success' : 'brand'}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{r.items_count} ítem(s) · {r.invitations_sent}/{r.invitations} invitaciones enviadas · {r.quotes_count} oferta(s) · {r.incoterm} · {r.delivery_destination}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
