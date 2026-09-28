'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { LogisticsRfq } from '@/lib/logistics/domain';

export default function PublicLogisticsQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [rfq, setRfq] = useState<LogisticsRfq | null>(null);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/logistics/public/${token}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRfq(data.rfq);
    }).catch((err) => setError(err.message));
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setError('');
    const form = new FormData(event.currentTarget);
    const numeric = (name: string) => form.get(name) === '' ? undefined : Number(form.get(name));
    const payload = {
      quoted_total: numeric('quoted_total'), currency: form.get('currency'), transit_days: numeric('transit_days'),
      valid_from: form.get('valid_from') || undefined, valid_until: form.get('valid_until') || undefined,
      pickup: numeric('pickup'), origin_charges: numeric('origin_charges'), main_freight: numeric('main_freight'),
      border_charges: numeric('border_charges'), destination_delivery: numeric('destination_delivery'), insurance: numeric('insurance'),
      other_charges: numeric('other_charges'), notes: form.get('notes') || undefined,
      contact_name: form.get('contact_name'), contact_email: form.get('contact_email') || undefined,
    };
    const response = await fetch(`/api/logistics/public/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json(); setSending(false);
    if (!response.ok) return setError(data.error || 'No se pudo enviar la cotización');
    setSubmitted(true);
  }

  if (submitted) return <main className="min-h-screen bg-[#0c0f14] text-white grid place-items-center p-6"><div className="max-w-lg border border-emerald-700 bg-[#141820] rounded-lg p-8 text-center"><h1 className="text-2xl font-bold">Cotización recibida</h1><p className="text-slate-300 mt-3">NIUPACK recibió su propuesta correctamente. Este enlace ya no admite otra respuesta.</p></div></main>;
  if (error && !rfq) return <main className="min-h-screen bg-[#0c0f14] text-white grid place-items-center p-6"><div className="border border-red-800 rounded-lg p-6">Enlace no disponible: {error}</div></main>;
  if (!rfq) return <main className="min-h-screen bg-[#0c0f14] text-slate-300 grid place-items-center">Cargando solicitud…</main>;

  const field = 'w-full rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-sm text-white';
  return <main className="min-h-screen bg-[#0c0f14] text-white p-5 md:p-10"><div className="mx-auto max-w-4xl">
    <header className="border-b border-slate-800 pb-5"><p className="text-sm font-bold tracking-[0.22em] text-red-500">NIUPACK</p><h1 className="mt-2 text-2xl font-bold">Solicitud de cotización logística</h1><p className="text-slate-400">{rfq.code}</p></header>
    <section className="my-6 grid gap-3 rounded-lg border border-slate-800 bg-[#141820] p-5 md:grid-cols-3 text-sm">
      <div><span className="text-slate-500 block">Origen</span>{rfq.origin_city}, {rfq.origin_country}</div><div><span className="text-slate-500 block">Destino</span>{rfq.destination_city}, {rfq.destination_country}</div><div><span className="text-slate-500 block">Retiro</span>{rfq.pickup_date}</div>
      <div><span className="text-slate-500 block">Carga</span>{rfq.cargo_description}</div><div><span className="text-slate-500 block">Peso / Volumen</span>{rfq.weight_kg} kg · {rfq.volume_m3} m³</div><div><span className="text-slate-500 block">Pallets / Equipo</span>{rfq.pallet_count} · {rfq.equipment_type}</div>
      <div className="md:col-span-3"><span className="text-slate-500 block">Fecha límite</span>{new Date(rfq.quote_deadline).toLocaleString('es-PY')}</div>
    </section>
    <form onSubmit={submit} className="space-y-5 rounded-lg border border-slate-800 bg-[#141820] p-5">
      <div className="grid gap-4 md:grid-cols-3"><label>Total<input required name="quoted_total" type="number" step="0.01" className={field}/></label><label>Moneda<select name="currency" className={field}><option>USD</option><option>PYG</option><option>BRL</option><option>ARS</option></select></label><label>Días de tránsito<input required name="transit_days" type="number" className={field}/></label></div>
      <div className="grid gap-4 md:grid-cols-2"><label>Válida desde<input name="valid_from" type="date" className={field}/></label><label>Válida hasta<input name="valid_until" type="date" className={field}/></label></div>
      <fieldset><legend className="mb-3 font-semibold">Desglose (dejar vacío significa no informado)</legend><div className="grid gap-3 md:grid-cols-3">{[['pickup','Retiro'],['origin_charges','Cargos origen'],['main_freight','Flete principal'],['border_charges','Cargos frontera'],['destination_delivery','Entrega destino'],['insurance','Seguro'],['other_charges','Otros cargos']].map(([name,label]) => <label key={name}>{label}<input name={name} type="number" step="0.01" className={field}/></label>)}</div></fieldset>
      <div className="grid gap-4 md:grid-cols-2"><label>Nombre del cotizante<input required name="contact_name" className={field}/></label><label>Email<input name="contact_email" type="email" className={field}/></label></div>
      <label className="block">Observaciones<textarea name="notes" rows={4} className={field}/></label>
      {error && <p className="text-sm text-red-400">{error}</p>}<button disabled={sending} className="rounded bg-red-600 px-5 py-3 font-bold hover:bg-red-500 disabled:opacity-50">{sending ? 'ENVIANDO…' : 'ENVIAR COTIZACIÓN'}</button>
    </form>
  </div></main>;
}
