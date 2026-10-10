'use client';

import React, { use, useEffect, useState } from 'react';

interface PublicItem {
  id: string; line_no: number; sku: string; description: string | null; quantity: number; unit: string; alternative_quantities: number[];
  material: string | null; printing_spec: string | null; packaging_spec: string | null; tooling_requirements: string | null; technical_conditions: string | null;
  specs: Record<string, string | number | boolean>;
}
interface PublicView {
  rfq: { code: string; title: string; delivery_destination: string; incoterm: string; payment_terms: string | null; validity_date: string | null; deadline_at: string | null; target_lead_time_days: number | null; technical_conditions: string | null };
  supplier: { name: string };
  items: PublicItem[];
  submissions: Array<{ version: number; status: string; submitted_at: string }>;
  link: { expires_at: string | null; submissions_left: number };
}

const ERRORS: Record<string, string> = {
  RFQ_LINK_INVALID: 'Este enlace no es válido. Verificá que copiaste la dirección completa del correo.',
  RFQ_LINK_EXPIRED: 'Este enlace venció. Pedí uno nuevo a quien te envió la solicitud.',
  RFQ_LINK_REVOKED: 'Este enlace fue revocado. Contactá a quien te envió la solicitud.',
  RFQ_CLOSED: 'Esta solicitud ya no está abierta.',
  RFQ_DEADLINE_PASSED: 'La fecha límite de esta solicitud ya pasó.',
  RFQ_LINK_SUBMISSION_LIMIT: 'Alcanzaste el máximo de envíos permitido para este enlace.',
};

const field = 'w-full rounded border border-slate-600 bg-transparent px-2.5 py-2 text-sm';
const label = 'block text-xs font-medium opacity-80 mb-1';

interface ItemForm { unit_price: string; moq: string; lead_time_days: string; technical_compliance: 'COMPLIES' | 'PARTIAL' | 'NOT_COMPLIES' | 'UNKNOWN'; scale_qty: string; scale_price: string; specs_offered: string }

export default function SupplierResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<PublicView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [header, setHeader] = useState({ submitted_by_label: '', currency: 'USD', incoterm: 'FOB', payment_terms: '', lead_time_days: '', validity_date: '', origin_country: '', manufacturer: '', tooling_cost: '', notes: '' });
  const [items, setItems] = useState<Record<string, ItemForm>>({});

  useEffect(() => {
    (async () => {
      const response = await fetch(`/api/rfq/public/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(ERRORS[data.error] ?? 'No se pudo abrir la solicitud.');
      else {
        setView(data);
        setHeader((h) => ({ ...h, incoterm: data.rfq.incoterm ?? 'FOB' }));
        setItems(Object.fromEntries((data.items as PublicItem[]).map((i) => [i.id, { unit_price: '', moq: '', lead_time_days: '', technical_compliance: 'UNKNOWN', scale_qty: '', scale_price: '', specs_offered: '' } as ItemForm])));
      }
      setLoading(false);
    })();
  }, [token]);

  const num = (value: string) => (value.trim() === '' ? undefined : Number(value.replace(',', '.')));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!view) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      submitted_by_label: header.submitted_by_label, currency: header.currency.toUpperCase(), incoterm: header.incoterm,
      payment_terms: header.payment_terms || undefined, lead_time_days: num(header.lead_time_days), validity_date: header.validity_date || undefined,
      origin_country: header.origin_country || undefined, manufacturer: header.manufacturer || undefined, tooling_cost: num(header.tooling_cost), notes: header.notes || undefined,
      items: view.items.map((i) => {
        const f = items[i.id];
        const scaleQty = num(f.scale_qty); const scalePrice = num(f.scale_price);
        return {
          rfq_item_id: i.id, unit_price: num(f.unit_price), moq: num(f.moq), lead_time_days: num(f.lead_time_days), technical_compliance: f.technical_compliance,
          specs_offered: f.specs_offered || undefined, price_scales: scaleQty && scalePrice ? [{ min_qty: scaleQty, unit_price: scalePrice }] : [],
        };
      }),
    };
    const response = await fetch(`/api/rfq/public/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) {
      setError(ERRORS[data.error] ?? (data.error === 'INVALID_REQUEST' ? 'Revisá los datos: cada ítem necesita un precio unitario mayor que cero y tu nombre.' : 'No se pudo enviar la cotización. Intentá de nuevo.'));
      return;
    }
    setDone(data.version);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-slate-100">
      <p className="text-xs uppercase tracking-wide opacity-60">Solicitud de cotización</p>
      {loading && <p className="mt-6 text-sm">Cargando…</p>}
      {error && !view && <p role="alert" className="mt-6 rounded border border-red-700 bg-red-950/40 p-4 text-sm">{error}</p>}

      {view && (
        <>
          <h1 className="mt-1 text-xl font-semibold">{view.rfq.code} — {view.rfq.title}</h1>
          <p className="mt-1 text-sm opacity-80">Para: {view.supplier.name}</p>

          <section className="mt-5 rounded border border-slate-700 p-4 text-sm space-y-1" aria-label="Condiciones solicitadas">
            <p><strong>Destino:</strong> {view.rfq.delivery_destination} · <strong>Incoterm solicitado:</strong> {view.rfq.incoterm}</p>
            {view.rfq.payment_terms && <p><strong>Pago solicitado:</strong> {view.rfq.payment_terms}</p>}
            {view.rfq.deadline_at && <p><strong>Fecha límite:</strong> {new Date(view.rfq.deadline_at).toLocaleDateString('es-PY')}</p>}
            {view.rfq.technical_conditions && <p><strong>Condiciones técnicas:</strong> {view.rfq.technical_conditions}</p>}
            <p className="opacity-70">Este enlace es personal. Podés enviar hasta {view.link.submissions_left} versión(es) más; cada envío reemplaza al anterior.</p>
          </section>

          {done !== null ? (
            <p role="status" className="mt-6 rounded border border-emerald-700 bg-emerald-950/40 p-4 text-sm">Recibimos tu cotización (versión {done}). Gracias. Si necesitás corregirla, podés enviar una nueva versión desde este mismo enlace.</p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-6">
              {error && <p role="alert" className="rounded border border-red-700 bg-red-950/40 p-3 text-sm">{error}</p>}
              {view.items.map((item) => {
                const f = items[item.id];
                if (!f) return null;
                const set = (patch: Partial<ItemForm>) => setItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], ...patch } }));
                return (
                  <fieldset key={item.id} className="rounded border border-slate-700 p-4 space-y-3">
                    <legend className="px-1 text-sm font-semibold">Ítem {item.line_no}: {item.sku}</legend>
                    <p className="text-sm opacity-80">{item.description ? `${item.description} · ` : ''}{item.quantity.toLocaleString('es-PY')} {item.unit}{item.alternative_quantities.length ? ` (alternativas: ${item.alternative_quantities.map((q) => q.toLocaleString('es-PY')).join(', ')})` : ''}</p>
                    <p className="text-xs opacity-70">{[item.material && `Material: ${item.material}`, item.printing_spec && `Impresión: ${item.printing_spec}`, item.packaging_spec && `Empaque: ${item.packaging_spec}`, item.technical_conditions].filter(Boolean).join(' · ')}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div><label className={label} htmlFor={`p-${item.id}`}>Precio unitario ({header.currency || 'moneda'}) *</label><input id={`p-${item.id}`} required inputMode="decimal" className={field} value={f.unit_price} onChange={(e) => set({ unit_price: e.target.value })} /></div>
                      <div><label className={label} htmlFor={`m-${item.id}`}>Pedido mínimo (MOQ)</label><input id={`m-${item.id}`} inputMode="numeric" className={field} value={f.moq} onChange={(e) => set({ moq: e.target.value })} /></div>
                      <div><label className={label} htmlFor={`l-${item.id}`}>Plazo del ítem (días)</label><input id={`l-${item.id}`} inputMode="numeric" className={field} value={f.lead_time_days} onChange={(e) => set({ lead_time_days: e.target.value })} /></div>
                      <div><label className={label} htmlFor={`sq-${item.id}`}>Escala: desde (cantidad)</label><input id={`sq-${item.id}`} inputMode="numeric" className={field} value={f.scale_qty} onChange={(e) => set({ scale_qty: e.target.value })} /></div>
                      <div><label className={label} htmlFor={`sp-${item.id}`}>Escala: precio unitario</label><input id={`sp-${item.id}`} inputMode="decimal" className={field} value={f.scale_price} onChange={(e) => set({ scale_price: e.target.value })} /></div>
                      <div><label className={label} htmlFor={`c-${item.id}`}>¿Cumple la especificación?</label>
                        <select id={`c-${item.id}`} className={field} value={f.technical_compliance} onChange={(e) => set({ technical_compliance: e.target.value as ItemForm['technical_compliance'] })}>
                          <option value="UNKNOWN">Sin indicar</option><option value="COMPLIES">Sí, cumple</option><option value="PARTIAL">Parcialmente</option><option value="NOT_COMPLIES">No cumple</option>
                        </select></div>
                    </div>
                    <div><label className={label} htmlFor={`s-${item.id}`}>Especificación que ofrece (si difiere)</label><input id={`s-${item.id}`} className={field} value={f.specs_offered} onChange={(e) => set({ specs_offered: e.target.value })} /></div>
                  </fieldset>
                );
              })}

              <fieldset className="rounded border border-slate-700 p-4 space-y-3">
                <legend className="px-1 text-sm font-semibold">Condiciones comerciales</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div><label className={label} htmlFor="cur">Moneda (3 letras) *</label><input id="cur" required maxLength={3} className={field} value={header.currency} onChange={(e) => setHeader({ ...header, currency: e.target.value.toUpperCase() })} /></div>
                  <div><label className={label} htmlFor="inc">Incoterm *</label>
                    <select id="inc" className={field} value={header.incoterm} onChange={(e) => setHeader({ ...header, incoterm: e.target.value })}>{['EXW', 'FOB', 'CIF', 'CIP', 'DDP'].map((i) => <option key={i}>{i}</option>)}</select></div>
                  <div><label className={label} htmlFor="lt">Plazo de entrega (días)</label><input id="lt" inputMode="numeric" className={field} value={header.lead_time_days} onChange={(e) => setHeader({ ...header, lead_time_days: e.target.value })} /></div>
                  <div><label className={label} htmlFor="pt">Condición de pago</label><input id="pt" className={field} value={header.payment_terms} onChange={(e) => setHeader({ ...header, payment_terms: e.target.value })} /></div>
                  <div><label className={label} htmlFor="vd">Validez de la oferta (hasta)</label><input id="vd" type="date" className={field} value={header.validity_date} onChange={(e) => setHeader({ ...header, validity_date: e.target.value })} /></div>
                  <div><label className={label} htmlFor="tc">Herramental / clisés (monto aparte)</label><input id="tc" inputMode="decimal" className={field} value={header.tooling_cost} onChange={(e) => setHeader({ ...header, tooling_cost: e.target.value })} /></div>
                  <div><label className={label} htmlFor="oc">País de origen</label><input id="oc" className={field} value={header.origin_country} onChange={(e) => setHeader({ ...header, origin_country: e.target.value })} /></div>
                  <div><label className={label} htmlFor="mf">Fabricante</label><input id="mf" className={field} value={header.manufacturer} onChange={(e) => setHeader({ ...header, manufacturer: e.target.value })} /></div>
                </div>
                <div><label className={label} htmlFor="nt">Observaciones</label><textarea id="nt" rows={2} className={field} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></div>
                <div><label className={label} htmlFor="by">Tu nombre y cargo *</label><input id="by" required className={field} value={header.submitted_by_label} onChange={(e) => setHeader({ ...header, submitted_by_label: e.target.value })} /></div>
              </fieldset>

              <button type="submit" disabled={submitting || view.link.submissions_left <= 0} className="rounded bg-red-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {submitting ? 'Enviando…' : 'Enviar cotización'}
              </button>
            </form>
          )}

          {view.submissions.length > 0 && done === null && (
            <p className="mt-6 text-xs opacity-70">Ya enviaste {view.submissions.length} versión(es); la última es la vigente.</p>
          )}
        </>
      )}
    </main>
  );
}
