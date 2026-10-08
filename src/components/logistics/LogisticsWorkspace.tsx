'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, Anchor, History, Plus, Truck } from 'lucide-react';
import type { LogisticsQuote, LogisticsRate, LogisticsRfq } from '@/lib/logistics/domain';
import type { FreightosEstimate } from '@/lib/logistics/freightos-provider';
import type { CargoFiveRateOption, CargoFivePlace } from '@/lib/logistics/cargofive-provider';
import type { IContainersNormalizedRate } from '@/lib/logistics/icontainers-provider';
import type { Supplier } from '@/types';

type View = 'overview' | 'ocean' | 'road' | 'providers' | 'history';

export function LogisticsWorkspace({ view }: { view: View }) {
  const [rfqs, setRfqs] = useState<LogisticsRfq[]>([]); const [quotes, setQuotes] = useState<LogisticsQuote[]>([]);
  const [rates, setRates] = useState<LogisticsRate[]>([]); const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [persistence, setPersistence] = useState(''); const [feedback, setFeedback] = useState('');
  const load = async () => {
    const [rfqRes, quoteRes, rateRes, supplierRes] = await Promise.all([fetch('/api/logistics/rfqs'),fetch('/api/logistics/quotes'),fetch('/api/logistics/rates'),fetch('/api/logistics/providers')]);
    const [r,q,ra,s] = await Promise.all([rfqRes.json(),quoteRes.json(),rateRes.json(),supplierRes.json()]);
    setRfqs(r.rfqs || []); setQuotes(q.quotes || []); setRates(ra.rates || []); setSuppliers(s.providers || []); setPersistence(r.persistence || ra.persistence || (r.error === 'AUTH_NOT_CONFIGURED' || r.error === 'LOGISTICS_PERSISTENCE_NOT_CONFIGURED' ? 'NOT_CONFIGURED' : ''));
  };
  useEffect(() => { load().catch((error) => setFeedback(error.message)); }, []);

  const shell = (content: React.ReactNode) => <div className="space-y-6">
    <div><div className="flex items-center gap-2 text-xs text-slate-400"><Truck className="h-4 w-4 text-red-500"/> LOGISTICS + EXPORT COST</div><h1 className="mt-1 text-2xl font-bold text-white">Logística NIUPACK</h1><p className="text-sm text-slate-400">Tarifas marítimas, RFQs terrestres y costos de exportación trazables.</p></div>
    {persistence === 'MEMORY_FALLBACK' && <div className="flex gap-2 rounded border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-300"><AlertTriangle className="h-4 w-4"/> Persistencia Supabase no configurada: el entorno actual usa memoria y no es refresh-safe entre procesos.</div>}
    {persistence === 'NOT_CONFIGURED' && <div className="flex gap-2 rounded border border-red-800 bg-red-950/30 p-3 text-xs text-red-300"><AlertTriangle className="h-4 w-4"/> Backend logístico no configurado: las operaciones están bloqueadas hasta conectar Supabase.</div>}
    {feedback && <div className="rounded border border-slate-700 bg-[#141820] p-3 text-xs text-slate-300">{feedback}</div>}{content}
  </div>;

  if (view === 'overview') {
    const open = rfqs.filter((item) => ['OPEN','PARTIALLY_RESPONDED'].includes(item.status)).length;
    const pending = Math.max(0, open - quotes.length); const expiring = rates.filter((rate) => rate.valid_until && new Date(rate.valid_until).getTime() > Date.now() && new Date(rate.valid_until).getTime() < Date.now()+7*86400000).length;
    const selected = rates.filter((rate) => rate.status === 'SELECTED').length;
    return shell(<div className="grid gap-4 md:grid-cols-4">{[['RFQs abiertos',open],['Respuestas pendientes',pending],['Tarifas por vencer',expiring],['Tarifas seleccionadas',selected]].map(([label,value]) => <div key={label} className="niu-kpi rounded-lg border border-slate-800 bg-[#141820] p-4"><span className="text-xs text-slate-400">{label}</span><div className="mt-2 text-2xl font-bold text-white">{value || 'Sin datos'}</div></div>)}</div>);
  }

  if (view === 'road') return shell(<RoadPanel rfqs={rfqs} quotes={quotes} suppliers={suppliers} reload={load} setFeedback={setFeedback}/>);
  if (view === 'ocean') return shell(<FreightosOceanPanel rates={rates} reload={load} setFeedback={setFeedback}/>);
  if (view === 'providers') return shell(<ProvidersPanel suppliers={suppliers} reload={load} setFeedback={setFeedback}/>);
  return shell(<HistoryPanel rates={rates}/>);
}

function ProvidersPanel({ suppliers, reload, setFeedback }: { suppliers: Supplier[]; reload:()=>Promise<void>; setFeedback:(v:string)=>void }) {
  const [saving, setSaving] = useState(false);

  async function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get('name') || '').trim();
    const email = String(values.get('email') || '').trim();
    if (!name || !email) {
      setFeedback('Completá el nombre y el email del transportista.');
      return;
    }
    setSaving(true);
    setFeedback('Guardando transportista…');
    try {
      const response = await fetch('/api/logistics/providers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, country_code: values.get('country_code'), city: values.get('city'),
          contact_name: values.get('contact_name'), phone: values.get('phone'),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(data.error || `No se pudo guardar el transportista (${response.status}).`);
        return;
      }
      form.reset();
      setFeedback(`Transportista ${data.provider.name} agregado y habilitado para RFQ.`);
      await reload();
    } catch (error) {
      setFeedback(`No se pudo guardar el transportista: ${error instanceof Error ? error.message : 'error de conexión'}.`);
    } finally {
      setSaving(false);
    }
  }

  const input = 'box-border h-9 w-full rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-white';
  return <div className="space-y-6">
    <form onSubmit={createProvider} className="rounded-lg border border-slate-800 bg-[#141820] p-5">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-white"><Plus className="h-4 w-4"/> Agregar transportista</h2>
      <p className="mb-4 text-xs text-slate-400">Se guarda dentro de la organización NIUPACK y queda disponible para generar magic links.</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-xs text-slate-300"><span>Nombre / empresa *</span><input required name="name" className={input} placeholder="Transportes XYZ"/></label>
        <label className="space-y-1 text-xs text-slate-300"><span>Email *</span><input required type="email" name="email" className={input} placeholder="cotizaciones@empresa.com"/></label>
        <label className="space-y-1 text-xs text-slate-300"><span>País *</span><select required name="country_code" defaultValue="BR" className={input}><option value="BR">Brasil</option><option value="AR">Argentina</option><option value="BO">Bolivia</option><option value="PY">Paraguay</option><option value="OTHER">Otro</option></select></label>
        <label className="space-y-1 text-xs text-slate-300"><span>Ciudad</span><input name="city" className={input} placeholder="São Paulo"/></label>
        <label className="space-y-1 text-xs text-slate-300"><span>Contacto</span><input name="contact_name" className={input} placeholder="Nombre de contacto"/></label>
        <label className="space-y-1 text-xs text-slate-300"><span>Teléfono</span><input name="phone" className={input} placeholder="+55…"/></label>
      </div>
      <button type="submit" disabled={saving} className="mt-5 rounded bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Guardando…' : 'Agregar transportista'}</button>
    </form>
    <div className="rounded-lg border border-slate-800 bg-[#141820] p-5">
      <h2 className="mb-3 font-bold text-white">Transportistas disponibles</h2>
      {suppliers.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay transportistas en NIUPACK.</p> : <div className="space-y-2">{suppliers.map((supplier) => <div key={supplier.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-800 py-3 text-sm"><div><span className="text-white">{supplier.name}</span><span className="ml-2 text-xs text-slate-500">{supplier.country_code}{supplier.city ? ` · ${supplier.city}` : ''}</span></div><span className="text-slate-400">{supplier.email || 'Sin email'}</span></div>)}</div>}
    </div>
  </div>;
}

export function RoadPanel({ rfqs, quotes, suppliers, reload, setFeedback }: { rfqs: LogisticsRfq[]; quotes: LogisticsQuote[]; suppliers: Supplier[]; reload:()=>Promise<void>; setFeedback:(v:string)=>void }) {
  const [selectedRfq,setSelectedRfq]=useState(''); const [selectedSuppliers,setSelectedSuppliers]=useState<string[]>([]); const [creating,setCreating]=useState(false);
  useEffect(() => {
    const originField = document.querySelector<HTMLInputElement>('input[name="origin_country"]');
    const formElement = originField?.closest('form');
    if (!formElement) return;
    const labels: Record<string, string> = {
      destination_country: 'País de destino', destination_city: 'Ciudad de destino',
      pickup_date: 'Fecha de carga', cargo_description: 'Descripción de la carga',
      quote_deadline: 'Fecha límite para cotizar',
    };
    const handleInvalid = (event: Event) => {
      const field = event.target as HTMLInputElement;
      setFeedback(`Completá el campo obligatorio: ${labels[field.name] || 'revisá los campos marcados'}.`);
    };
    formElement.addEventListener('invalid', handleInvalid, true);
    return () => formElement.removeEventListener('invalid', handleInvalid, true);
  }, [setFeedback]);
  useEffect(() => {
    if (rfqs.length > 0 && suppliers.length === 0) {
      setFeedback('No hay transportistas asociados a NIUPACK. Cargá uno en Transportistas antes de generar magic links.');
    }
  }, [rfqs.length, suppliers.length, setFeedback]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const val = (name: string) => String(form.get(name) || '').trim();
    const requiredFields: Array<[string, string]> = [
      ['destination_country', 'País de destino'],
      ['destination_city', 'Ciudad de destino'],
      ['pickup_date', 'Fecha de carga'],
      ['cargo_description', 'Descripción de la carga'],
      ['quote_deadline', 'Fecha límite para cotizar'],
    ];
    const missing = requiredFields.filter(([name]) => !val(name));
    if (missing.length > 0) {
      setFeedback(`Completá los campos obligatorios: ${missing.map(([, label]) => label).join(', ')}.`);
      formElement.querySelector<HTMLElement>(`[name="${missing[0][0]}"]`)?.focus();
      return;
    }

    const deadline = new Date(val('quote_deadline'));
    if (Number.isNaN(deadline.getTime())) {
      setFeedback('La fecha límite para cotizar no es válida.');
      formElement.querySelector<HTMLElement>('[name="quote_deadline"]')?.focus();
      return;
    }
    if (deadline.getTime() <= Date.now()) {
      setFeedback('La fecha límite debe ser futura para poder generar magic links.');
      formElement.querySelector<HTMLElement>('[name="quote_deadline"]')?.focus();
      return;
    }

    const payload = {
      origin_country: val('origin_country'), origin_city: val('origin_city'),
      destination_country: val('destination_country'), destination_city: val('destination_city'),
      pickup_date: val('pickup_date'), delivery_target_date: val('delivery_target_date') || null,
      cargo_description: val('cargo_description'), weight_kg: Number(form.get('weight_kg')),
      volume_m3: Number(form.get('volume_m3')), pallet_count: Number(form.get('pallet_count')),
      equipment_type: val('equipment_type'), commercial_term: val('commercial_term'),
      quote_deadline: deadline.toISOString(), currency_preferences: ['USD'],
    };

    setCreating(true);
    setFeedback('Creando RFQ…');
    try {
      const res = await fetch('/api/logistics/rfqs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(data.error || `No se pudo crear el RFQ (${res.status}).`);
        return;
      }
      setFeedback(`RFQ ${data.rfq.code} creado.`);
      await reload();
    } catch (error) {
      setFeedback(`No se pudo crear el RFQ: ${error instanceof Error ? error.message : 'error de conexión'}.`);
    } finally {
      setCreating(false);
    }
  }
  async function invite(){const res=await fetch(`/api/logistics/rfqs/${selectedRfq}/invite`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({supplierIds:selectedSuppliers})});const data=await res.json();if(!res.ok)return setFeedback(data.error);setFeedback(`${data.invitations.length} invitaciones creadas. ${data.email==='NOT_CONFIGURED'?'Email no configurado; links disponibles para copiar.':''} ${data.invitations.map((i:{magic_link:string})=>i.magic_link).join(' ')}`);await reload();}
  async function select(id:string){const res=await fetch(`/api/logistics/quotes/${id}/select`,{method:'POST'});const data=await res.json();setFeedback(res.ok?`Tarifa ${data.rate.id} seleccionada.`:data.error);await reload();}
  const input='rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-white'; const formInput='box-border h-9 w-full min-w-0 rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs leading-5 text-white'; const label='min-h-4 text-xs font-medium leading-4 text-slate-300';
  return <div className="space-y-6"><form onSubmit={create} className="rounded-lg border border-slate-800 bg-[#141820] p-5"><h2 className="mb-4 flex items-center gap-2 font-bold text-white"><Plus className="h-4 w-4"/> Nuevo RFQ terrestre</h2><div className="grid grid-cols-1 items-end gap-x-6 gap-y-5 md:grid-cols-2 lg:grid-cols-4"><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="origin_country" className={label}>País de origen *</label><input required id="origin_country" name="origin_country" defaultValue="Paraguay" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="origin_city" className={label}>Ciudad de origen *</label><input required id="origin_city" name="origin_city" defaultValue="Asunción" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="destination_country" className={label}>País de destino *</label><input required id="destination_country" name="destination_country" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="destination_city" className={label}>Ciudad de destino *</label><input required id="destination_city" name="destination_city" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="pickup_date" className={label}>Fecha de carga *</label><input required id="pickup_date" name="pickup_date" type="date" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="delivery_target_date" className={label}>Entrega objetivo (opcional)</label><input id="delivery_target_date" name="delivery_target_date" type="date" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="cargo_description" className={label}>Descripción de la carga *</label><input required id="cargo_description" name="cargo_description" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="equipment_type" className={label}>Tipo de equipo *</label><select required id="equipment_type" name="equipment_type" defaultValue="SEMI" className={formInput}><option>FTL</option><option>LTL</option><option>TRUCK</option><option>SEMI</option><option>OTHER</option></select></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="weight_kg" className={label}>Peso (kg)</label><input id="weight_kg" name="weight_kg" type="number" placeholder="0" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="volume_m3" className={label}>Volumen (m³)</label><input id="volume_m3" name="volume_m3" type="number" step="0.01" placeholder="0" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="pallet_count" className={label}>Pallets</label><input id="pallet_count" name="pallet_count" type="number" placeholder="0" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="commercial_term" className={label}>Condición comercial</label><input id="commercial_term" name="commercial_term" defaultValue="CPT" className={formInput}/></div><div className="flex min-w-0 flex-col gap-1.5"><label htmlFor="quote_deadline" className={label}>Fecha límite para cotizar *</label><input required id="quote_deadline" name="quote_deadline" type="datetime-local" className={formInput}/></div></div><button className="mt-5 rounded bg-red-600 px-4 py-2 text-xs font-bold text-white">Crear RFQ</button></form>
    <div className="rounded-lg border border-slate-800 bg-[#141820] p-5"><h2 className="mb-3 font-bold text-white">Invitar transportistas</h2><select value={selectedRfq} onChange={(e)=>setSelectedRfq(e.target.value)} className={input}><option value="">Seleccionar RFQ</option>{rfqs.map((r)=><option value={r.id} key={r.id}>{r.code} · {r.destination_city}</option>)}</select><div className="my-3 grid gap-2 md:grid-cols-2">{suppliers.map((s)=><label key={s.id} className="flex gap-2 text-xs text-slate-300"><input type="checkbox" checked={selectedSuppliers.includes(s.id)} onChange={(e)=>setSelectedSuppliers(e.target.checked?[...selectedSuppliers,s.id]:selectedSuppliers.filter(id=>id!==s.id))}/>{s.name} · {s.email||'Sin email'}</label>)}</div><button disabled={!selectedRfq||!selectedSuppliers.length} onClick={invite} className="rounded bg-slate-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Generar magic links / enviar</button></div>
    <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#141820] p-5"><h2 className="mb-3 font-bold text-white">Comparador terrestre</h2>{quotes.length===0?<p className="text-sm text-slate-500">Sin respuestas.</p>:<table className="w-full text-xs"><thead className="text-left text-slate-400"><tr><th>Proveedor</th><th>Precio</th><th>Normalizado</th><th>Transit</th><th>Vigencia</th><th>Incluye / No incluye</th><th>Estado</th><th></th></tr></thead><tbody>{quotes.map((q)=><tr key={q.id} className="border-t border-slate-800 text-slate-200"><td className="py-3">{q.supplier_name}</td><td>{q.currency} {q.quoted_total}</td><td>{q.normalized_total??'Pendiente FX'}</td><td>{q.transit_days} días</td><td>{q.valid_until||'No informada'}</td><td>{q.main_freight!==undefined?'Flete principal':'Flete no desglosado'}</td><td>{q.status}</td><td><button onClick={()=>select(q.id)} className="rounded bg-red-600 px-2 py-1">Seleccionar</button></td></tr>)}</tbody></table>}</div></div>;
}

function FreightosOceanPanel({ rates, reload, setFeedback }: { rates: LogisticsRate[]; reload: () => Promise<void>; setFeedback: (value: string) => void }) {
  const [provider, setProvider] = useState<'freightos' | 'icontainers'>('freightos');

  // Freightos state
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [equipment, setEquipment] = useState<'20GP' | '40GP' | '40HC'>('40HC');
  const [quantity, setQuantity] = useState(1);
  const [weight, setWeight] = useState('');
  const [estimates, setEstimates] = useState<FreightosEstimate[]>([]);
  const [status, setStatus] = useState('');
  const [searching, setSearching] = useState(false);

  // iContainers state
  const [icOrigin, setIcOrigin] = useState('CNSHA');
  const [icDestination, setIcDestination] = useState('PYASU');
  const [icEquipment, setIcEquipment] = useState<'20GP' | '40GP' | '40HC'>('40HC');
  const [icQuantity, setIcQuantity] = useState(1);
  const [icWeight, setIcWeight] = useState('');
  const [icRates, setIcRates] = useState<IContainersNormalizedRate[]>([]);
  const [icStatus, setIcStatus] = useState('');
  const [icConfigured, setIcConfigured] = useState(true);
  const [icSearching, setIcSearching] = useState(false);

  const input = 'box-border h-9 w-full rounded border border-slate-700 bg-[#0c0f14] px-3 text-xs text-white';

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setEstimates([]);
    setStatus('Consultando estimaciones públicas de Freightos…');
    try {
      const response = await fetch('/api/logistics/ocean/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin, destination, equipment, quantity,
          ...(weight ? { weight_kg: Number(weight) } : {}),
        }),
      });
      const data = await response.json();
      setEstimates(data.estimates ?? []);
      setStatus(data.message ?? (response.ok ? 'Consulta completada.' : 'No fue posible obtener la estimación.'));
    } catch {
      setStatus('No fue posible consultar Freightos en este momento.');
    } finally {
      setSearching(false);
    }
  }

  async function searchIcontainers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIcSearching(true);
    setIcRates([]);
    setIcStatus('Consultando tarifas marítimas en iContainers Brutus API…');
    try {
      const response = await fetch('/api/logistics/ocean/icontainers/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { port_code: icOrigin },
          destination: { port_code: icDestination },
          equipment: icEquipment,
          quantity: icQuantity,
          ...(icWeight ? { weight_kg: Number(icWeight) } : {}),
          validate_paraguay: true,
        }),
      });
      const data = await response.json();
      if (data.status === 'NOT_CONFIGURED' || response.status === 503) {
        setIcConfigured(false);
        setIcStatus('iContainers no configurado — requiere credenciales.');
        return;
      }
      setIcConfigured(true);
      setIcRates(data.rates ?? []);
      setIcStatus(data.message ?? (response.ok ? 'Consulta completada.' : 'No fue posible obtener la cotización.'));
    } catch {
      setIcStatus('No fue posible consultar iContainers en este momento.');
    } finally {
      setIcSearching(false);
    }
  }

  async function manual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/logistics/rates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { country: form.get('origin') }, destination: { country: form.get('destination') },
        mode: 'OCEAN', amount: Number(form.get('amount')), currency: form.get('currency'),
        equipment: form.get('equipment'), valid_until: form.get('valid_until'), status: 'CONFIRMED',
      }),
    });
    const data = await response.json();
    setFeedback(response.ok ? `Tarifa manual ${data.rate.id} guardada.` : data.error);
    await reload();
  }

  const money = (amount: number, currency: string) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount);

  return <div className="space-y-5">
    {/* Selector de proveedor marítimo */}
    <div className="flex gap-2 border-b border-slate-800 pb-3">
      <button
        type="button"
        onClick={() => setProvider('freightos')}
        className={`rounded px-3 py-1.5 text-xs font-semibold transition ${provider === 'freightos' ? 'bg-red-600 text-white' : 'bg-[#141820] text-slate-400 hover:text-white'}`}
      >
        Freightos (Estimador público)
      </button>
      <button
        type="button"
        onClick={() => setProvider('icontainers')}
        className={`rounded px-3 py-1.5 text-xs font-semibold transition ${provider === 'icontainers' ? 'bg-red-600 text-white' : 'bg-[#141820] text-slate-400 hover:text-white'}`}
      >
        iContainers Brutus API (China → Paraguay)
      </button>
    </div>

    {/* Proveedor: Freightos */}
    {provider === 'freightos' && (
      <>
        <section className="rounded-lg border border-slate-800 bg-[#141820] p-4">
          <h2 className="flex items-center gap-2 font-bold text-white"><Anchor className="h-4 w-4"/> Estimador marítimo Freightos</h2>
          <p className="my-2 text-xs text-slate-400">Estimaciones públicas FCL por ruta (hasta 100 consultas por IP cada hora). No son tarifas firmes, reservas ni disponibilidad confirmada; no se guardan en el histórico de tarifas reales.</p>
          <a href="https://ship.freightos.com" target="_blank" rel="noreferrer" className="mb-3 inline-block text-xs text-sky-300 underline">Fuente y más opciones: Freightos ↗</a>
          <form onSubmit={search} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1 text-xs text-slate-300 xl:col-span-2"><span>Puerto de origen *</span><input required minLength={2} maxLength={120} value={origin} onChange={(event) => setOrigin(event.target.value)} className={input} placeholder="UN/LOCODE o puerto, país (ej. CNSHA)"/></label>
            <label className="space-y-1 text-xs text-slate-300 xl:col-span-2"><span>Puerto de destino *</span><input required minLength={2} maxLength={120} value={destination} onChange={(event) => setDestination(event.target.value)} className={input} placeholder="UN/LOCODE o puerto, país (ej. USLGB)"/></label>
            <label className="space-y-1 text-xs text-slate-300"><span>Contenedor *</span><select value={equipment} onChange={(event) => setEquipment(event.target.value as typeof equipment)} className={input}><option value="20GP">20GP</option><option value="40GP">40GP</option><option value="40HC">40HC</option></select></label>
            <label className="space-y-1 text-xs text-slate-300"><span>Cantidad *</span><input required min="1" max="100" type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className={input}/></label>
            <label className="space-y-1 text-xs text-slate-300"><span>Peso bruto por contenedor (kg), opcional</span><input min="1" max="100000" step="1" type="number" value={weight} onChange={(event) => setWeight(event.target.value)} className={input} placeholder="Peso real"/></label>
            <div className="flex items-end"><button type="submit" disabled={searching} className="h-9 rounded bg-red-600 px-4 text-xs font-bold text-white disabled:opacity-50">{searching ? 'Consultando…' : 'Consultar'}</button></div>
          </form>
          {status && <p role="status" className="mt-3 text-xs text-slate-300">{status}</p>}
        </section>

        {estimates.length > 0 && <section className="overflow-x-auto rounded-lg border border-slate-800 bg-[#141820]">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="p-3">Proveedor</th><th className="p-3">Ruta</th><th className="p-3">Equipo</th><th className="p-3">Rango estimado</th><th className="p-3">Tránsito estimado</th><th className="p-3">Fuente</th></tr></thead>
            <tbody>{estimates.map((estimate) => <tr key={estimate.id} className="border-t border-slate-800 align-top text-slate-300">
              <td className="p-3 font-semibold text-white">Freightos</td>
              <td className="p-3">{estimate.origin} → {estimate.destination}</td>
              <td className="p-3">{estimate.quantity} × {estimate.equipment}</td>
              <td className="p-3 font-semibold text-white">{money(estimate.min_amount, estimate.currency)} – {money(estimate.max_amount, estimate.currency)}</td>
              <td className="p-3">{estimate.min_transit_days !== undefined && estimate.max_transit_days !== undefined ? `${estimate.min_transit_days}–${estimate.max_transit_days} días` : 'No informado'}</td>
              <td className="p-3"><a href={estimate.marketplace_url} target="_blank" rel="noreferrer" className="text-sky-300 underline">Freightos ↗</a><span className="mt-1 block text-[10px] text-slate-500">Consulta: {new Date(estimate.retrieved_at).toLocaleString()}</span></td>
            </tr>)}</tbody>
          </table>
        </section>}
      </>
    )}

    {/* Proveedor: iContainers Brutus API */}
    {provider === 'icontainers' && (
      <>
        <section className="rounded-lg border border-slate-800 bg-[#141820] p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold text-white"><Anchor className="h-4 w-4"/> iContainers — Brutus API (FCL)</h2>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">Piloto Read-Only · China → Paraguay</span>
          </div>
          <p className="my-2 text-xs text-slate-400">Consulta directa a iContainers Brutus API. Requiere verificación estricta de destino paraguayo (PYASU) e inclusión de continuación fluvial. No se autoconfírman reservas ni compras.</p>
          
          {!icConfigured && (
            <div className="my-3 rounded border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-300">
              <strong className="block font-semibold">iContainers no configurado — requiere credenciales.</strong>
              <span className="mt-1 block text-slate-400">El proveedor iContainers requiere credenciales de API activas en el entorno del servidor.</span>
            </div>
          )}

          <form onSubmit={searchIcontainers} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1 text-xs text-slate-300 xl:col-span-2">
              <span>Puerto de origen *</span>
              <input required minLength={2} maxLength={10} value={icOrigin} onChange={(event) => setIcOrigin(event.target.value.toUpperCase())} className={input} placeholder="CNSHA, CNNGB, CNSZX"/>
            </label>
            <label className="space-y-1 text-xs text-slate-300 xl:col-span-2">
              <span>Puerto de destino (Paraguay) *</span>
              <input required minLength={2} maxLength={10} value={icDestination} onChange={(event) => setIcDestination(event.target.value.toUpperCase())} className={input} placeholder="PYASU (Asunción)"/>
            </label>
            <label className="space-y-1 text-xs text-slate-300">
              <span>Contenedor *</span>
              <select value={icEquipment} onChange={(event) => setIcEquipment(event.target.value as typeof icEquipment)} className={input}>
                <option value="20GP">20GP (DV20)</option>
                <option value="40GP">40GP (DV40)</option>
                <option value="40HC">40HC (DV40HC)</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-300">
              <span>Cantidad *</span>
              <input required min="1" max="100" type="number" value={icQuantity} onChange={(event) => setIcQuantity(Number(event.target.value))} className={input}/>
            </label>
            <label className="space-y-1 text-xs text-slate-300">
              <span>Peso bruto (kg), opcional</span>
              <input min="1" max="100000" step="1" type="number" value={icWeight} onChange={(event) => setIcWeight(event.target.value)} className={input} placeholder="Opcional"/>
            </label>
            <div className="flex items-end">
              <button type="submit" disabled={icSearching} className="h-9 w-full rounded bg-red-600 px-4 text-xs font-bold text-white disabled:opacity-50">
                {icSearching ? 'Consultando…' : 'Consultar'}
              </button>
            </div>
          </form>
          {icStatus && <p role="status" className="mt-3 text-xs text-slate-300">{icStatus}</p>}
        </section>

        {icRates.length > 0 && (
          <section className="overflow-x-auto rounded-lg border border-slate-800 bg-[#141820]">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">Proveedor</th>
                  <th className="p-3">Ruta</th>
                  <th className="p-3">Equipo</th>
                  <th className="p-3">Flete</th>
                  <th className="p-3">Precio total</th>
                  <th className="p-3">Moneda</th>
                  <th className="p-3">Tránsito</th>
                  <th className="p-3">Vigencia</th>
                  <th className="p-3">Alcance</th>
                  <th className="p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {icRates.map((rate) => (
                  <React.Fragment key={rate.id}>
                    <tr className="border-t border-slate-800 align-top text-slate-300">
                      <td className="p-3 font-semibold text-white">
                        {rate.provider}
                        <span className="block text-[10px] font-normal text-slate-400">{rate.carrier_name || 'Naviera no especificada'}</span>
                      </td>
                      <td className="p-3">{rate.origin_code || rate.origin} → {rate.destination_code || rate.destination}</td>
                      <td className="p-3">{rate.quantity} × {rate.equipment}</td>
                      <td className="p-3">{rate.freight_amount !== undefined && rate.currency ? `${rate.currency} ${rate.freight_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</td>
                      <td className="p-3 font-semibold text-white">{rate.total_amount !== undefined && rate.currency ? `${rate.currency} ${rate.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-amber-300 text-[11px]">Sin total comparable</span>}</td>
                      <td className="p-3">{rate.currency || '—'}</td>
                      <td className="p-3">{rate.transit_days !== undefined ? `${rate.transit_days} días` : 'No informado'}</td>
                      <td className="p-3">{rate.valid_until || 'No informada'}</td>
                      <td className="p-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${rate.scope_complete ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
                          {rate.scope_complete ? 'Completo hasta Paraguay' : 'Incompleto / Fluvial no verificado'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${rate.paraguay_status === 'READY' ? 'bg-emerald-950 text-emerald-300' : rate.paraguay_status === 'SCOPE_INCOMPLETE' ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>
                          {rate.paraguay_status}
                        </span>
                      </td>
                    </tr>
                    <tr className="border-b border-slate-800 bg-[#0c0f14]/40 text-slate-400">
                      <td colSpan={10} className="px-3 pb-3">
                        <details className="text-[11px]">
                          <summary className="cursor-pointer text-sky-400 hover:underline">Ver detalles (cargos, transbordos, inclusiones e identificadores)</summary>
                          <div className="mt-2 grid gap-3 md:grid-cols-2 lg:grid-cols-4 rounded border border-slate-800 bg-[#10141b] p-3">
                            <div>
                              <strong className="block text-slate-300 mb-1">Desglose de cargos ({rate.billing_items.length})</strong>
                              {rate.billing_items.length === 0 ? <span className="text-slate-500">Sin desglose</span> : (
                                <ul className="space-y-0.5">
                                  {rate.billing_items.map((b, i) => (
                                    <li key={i}>{b.name} ({b.service_item}): {b.currency} {b.amount.toLocaleString()}{b.optional ? ' (Opcional)' : ''}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <strong className="block text-slate-300 mb-1">Transbordos</strong>
                              {rate.transshipment_ports.length === 0 ? <span className="text-slate-500">Ruta directa o sin transbordos informados</span> : (
                                <span>{rate.transshipment_ports.join(' → ')}</span>
                              )}
                              <strong className="block text-slate-300 mt-2 mb-1">Inclusiones</strong>
                              <span>{rate.included_services.length > 0 ? rate.included_services.join(', ') : 'No detalladas'}</span>
                            </div>
                            <div>
                              <strong className="block text-slate-300 mb-1">Exclusiones</strong>
                              <span>{rate.excluded_services.length > 0 ? rate.excluded_services.join(', ') : 'Ninguna informada'}</span>
                              {rate.unavailable_reason && (
                                <div className="mt-2 text-amber-400 font-medium">{rate.unavailable_reason}</div>
                              )}
                            </div>
                            <div>
                              <strong className="block text-slate-300 mb-1">Identificadores</strong>
                              <span className="block font-mono text-[10px]">Quote UUID: {rate.quote_uuid || '—'}</span>
                              <span className="block font-mono text-[10px]">Rate UUID: {rate.rate_uuid || '—'}</span>
                              {rate.quote_url && (
                                <a href={rate.quote_url} target="_blank" rel="noreferrer" className="mt-1 block text-sky-300 underline">Ver cotización online ↗</a>
                              )}
                            </div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </>
    )}

    {/* Formulario de tarifa manual / contractual (Preservado) */}
    <form onSubmit={manual} className="rounded-lg border border-slate-800 bg-[#141820] p-4">
      <h2 className="mb-3 font-bold text-white">Tarifa manual / contractual</h2>
      <div className="grid gap-3 md:grid-cols-3"><input required name="origin" placeholder="Origen" className={input}/><input required name="destination" placeholder="Destino" className={input}/><select name="equipment" className={input}><option>20GP</option><option>40GP</option><option>40HC</option><option>LCL</option></select><input required name="amount" type="number" min="0" step="0.01" placeholder="Importe" className={input}/><select name="currency" className={input}><option>USD</option><option>PYG</option></select><input name="valid_until" type="date" className={input}/></div>
      <button className="mt-4 rounded bg-slate-700 px-4 py-2 text-xs font-bold text-white">Guardar tarifa real</button>
    </form>
    <HistoryPanel rates={rates.filter((rate) => rate.mode === 'OCEAN')}/>
  </div>;
}

function PlacePicker({ label, value, onSelect }: { label: string; value: CargoFivePlace | null; onSelect: (place: CargoFivePlace | null) => void }) {
  const [query, setQuery] = useState(value?.display_name ?? '');
  const [places, setPlaces] = useState<CargoFivePlace[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 4 || value?.display_name === term) {
      setPlaces([]);
      setLoading(false);
      setMessage(term.length > 0 && term.length < 4 ? 'Ingresá al menos 4 caracteres.' : '');
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setMessage('');
      try {
        const response = await fetch(`/api/logistics/ocean/places?search=${encodeURIComponent(term)}`, { signal: controller.signal });
        const data = await response.json();
        setPlaces(data.places ?? []);
        setMessage(data.message ?? ((data.places?.length ?? 0) === 0 ? 'No se encontraron puertos o lugares.' : ''));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setPlaces([]);
        setMessage('No fue posible buscar puertos y lugares en este momento.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, value?.display_name]);

  const field = 'box-border h-9 w-full rounded border border-slate-700 bg-[#0c0f14] px-3 text-xs text-white';
  return <label className="relative block space-y-1 text-xs text-slate-300">
    <span>{label} *</span>
    <input value={query} autoComplete="off" onChange={(event) => { setQuery(event.target.value); onSelect(null); }} className={field} placeholder="Buscar puerto o lugar (4+ caracteres)" />
    {loading && <span className="mt-1 block text-slate-500">Buscando en el proveedor…</span>}
    {!loading && message && <span className="mt-1 block text-slate-500">{message}</span>}
    {places.length > 0 && <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded border border-slate-700 bg-[#10141b] shadow-xl">
      {places.map((place) => <button type="button" key={`${place.place_type_id}:${place.id}`} onClick={() => { onSelect(place); setQuery(place.display_name); setPlaces([]); setMessage(''); }} className="block w-full border-b border-slate-800 px-3 py-2 text-left hover:bg-slate-800">
        <span className="block text-xs text-white">{place.display_name}</span>
        <span className="text-[10px] text-slate-500">{place.place_type_id === 1 ? 'Puerto' : 'Lugar'}{place.unlocode ? ` · ${place.unlocode}` : ''}{place.country_name ? ` · ${place.country_name}` : ''}</span>
      </button>)}
    </div>}
  </label>;
}

function OceanPanel({ rates, reload, setFeedback }: { rates: LogisticsRate[]; reload:()=>Promise<void>; setFeedback:(v:string)=>void }) {
  const [origin, setOrigin] = useState<CargoFivePlace | null>(null);
  const [destination, setDestination] = useState<CargoFivePlace | null>(null);
  const [departureDate, setDepartureDate] = useState(new Date().toISOString().slice(0, 10));
  const [equipment, setEquipment] = useState<'20GP' | '40GP' | '40HC'>('40HC');
  const [quantity, setQuantity] = useState(1);
  const [weight, setWeight] = useState('');
  const [quotes, setQuotes] = useState<CargoFiveRateOption[]>([]);
  const [status, setStatus] = useState('');
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState('');
  const input = 'box-border h-9 w-full rounded border border-slate-700 bg-[#0c0f14] px-3 text-xs text-white';

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!origin || !destination) { setStatus('Seleccioná un origen y un destino de la lista del proveedor.'); return; }
    if (!weight || Number(weight) <= 0) { setStatus('Ingresá el peso bruto por contenedor requerido para FCL.'); return; }
    setSearching(true);
    setQuotes([]);
    setStatus('Consultando tarifas marítimas en vivo…');
    try {
      const response = await fetch('/api/logistics/ocean/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { provider_place_id: origin.id, place_type_id: origin.place_type_id, country: origin.country_name || origin.display_name, city: origin.display_name, port: origin.display_name, display_name: origin.display_name, unlocode: origin.unlocode },
          destination: { provider_place_id: destination.id, place_type_id: destination.place_type_id, country: destination.country_name || destination.display_name, city: destination.display_name, port: destination.display_name, display_name: destination.display_name, unlocode: destination.unlocode },
          shipment_date: departureDate, load_type: 'FCL', equipment, quantity, weight_kg: Number(weight), volume_m3: 0,
        }),
      });
      const data = await response.json();
      setQuotes(data.rates ?? []);
      setStatus(data.message ?? ((data.rates?.length ?? 0) > 0 ? `${data.rates.length} tarifas encontradas.` : 'No se encontraron tarifas para la ruta y fecha seleccionadas.'));
    } catch {
      setStatus('No fue posible obtener tarifas marítimas en este momento.');
    } finally {
      setSearching(false);
    }
  }

  async function selectQuote(quote: CargoFiveRateOption) {
    if (!quote.selection_token || selecting) return;
    setSelecting(quote.provider_rate_id);
    try {
      const response = await fetch('/api/logistics/ocean/select', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selection_token: quote.selection_token }),
      });
      const data = await response.json();
      if (!response.ok) { setFeedback(data.error === 'EXPIRED_SELECTION' ? 'La selección venció; volvé a consultar tarifas.' : data.error === 'RATE_EXPIRED' ? 'La tarifa ya no está vigente.' : 'No se pudo guardar la tarifa seleccionada.'); return; }
      setFeedback(`Tarifa de ${quote.carrier_name} guardada en el histórico.`);
      setQuotes((current) => current.filter((item) => item.provider_rate_id !== quote.provider_rate_id));
      await reload();
    } catch {
      setFeedback('No se pudo guardar la tarifa seleccionada.');
    } finally {
      setSelecting('');
    }
  }

  async function manual(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f=new FormData(event.currentTarget);
    const res=await fetch('/api/logistics/rates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:{country:f.get('origin')},destination:{country:f.get('destination')},mode:'OCEAN',amount:Number(f.get('amount')),currency:f.get('currency'),equipment:f.get('equipment'),valid_until:f.get('valid_until'),status:'CONFIRMED'})});
    const data=await res.json();
    setFeedback(res.ok?`Tarifa manual ${data.rate.id} guardada.`:data.error);
    await reload();
  }

  return <div className="space-y-5">
    <section className="rounded-lg border border-slate-800 bg-[#141820] p-4">
      <h2 className="flex items-center gap-2 font-bold text-white"><Anchor className="h-4 w-4"/> Tarifas marítimas en vivo</h2>
      <p className="my-2 text-xs text-slate-400">Buscá puertos o lugares válidos y compará tarifas FCL reales. No se generan tarifas estimadas.</p>
      <form onSubmit={search} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="xl:col-span-2"><PlacePicker label="Origen" value={origin} onSelect={setOrigin}/></div>
        <div className="xl:col-span-2"><PlacePicker label="Destino" value={destination} onSelect={setDestination}/></div>
        <label className="space-y-1 text-xs text-slate-300"><span>Salida *</span><input required type="date" value={departureDate} onChange={(event)=>setDepartureDate(event.target.value)} className={input}/></label>
        <label className="space-y-1 text-xs text-slate-300"><span>Contenedor *</span><select value={equipment} onChange={(event)=>setEquipment(event.target.value as typeof equipment)} className={input}><option value="20GP">20GP</option><option value="40GP">40GP</option><option value="40HC">40HC</option></select></label>
        <label className="space-y-1 text-xs text-slate-300"><span>Cantidad *</span><input required min="1" max="100" type="number" value={quantity} onChange={(event)=>setQuantity(Number(event.target.value))} className={input}/></label>
        <label className="space-y-1 text-xs text-slate-300"><span>Peso bruto / contenedor (kg) *</span><input required min="1" max="100000" step="1" type="number" value={weight} onChange={(event)=>setWeight(event.target.value)} className={input} placeholder="Peso real"/></label>
        <div className="flex items-end"><button type="submit" disabled={searching} className="h-9 rounded bg-red-600 px-4 text-xs font-bold text-white disabled:opacity-50">{searching?'Consultando…':'Buscar tarifas'}</button></div>
      </form>
      {status && <p role="status" className="mt-3 text-xs text-slate-300">{status}</p>}
    </section>

    {quotes.length > 0 && <section className="overflow-x-auto rounded-lg border border-slate-800 bg-[#141820]">
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="p-3">Naviera / Servicio</th><th className="p-3">Ruta</th><th className="p-3">Equipo</th><th className="p-3">Salida</th><th className="p-3">Tránsito</th><th className="p-3">Cargos / total</th><th className="p-3">Fuente</th><th className="p-3"></th></tr></thead>
        <tbody>{quotes.map((quote)=><tr key={quote.provider_rate_id || `${quote.carrier_name}:${quote.origin}`} className="border-t border-slate-800 align-top text-slate-300">
          <td className="p-3"><strong className="text-white">{quote.carrier_name}</strong>{quote.carrier_code&&<span className="ml-1 text-slate-500">{quote.carrier_code}</span>}{quote.service&&<span className="block mt-1 text-slate-500">{quote.service}</span>}</td>
          <td className="p-3">{quote.origin.display_name||quote.origin.port||quote.origin.country}{quote.origin_code?` (${quote.origin_code})`:''}<span className="mx-1 text-slate-600">→</span>{quote.destination.display_name||quote.destination.port||quote.destination.country}{quote.destination_code?` (${quote.destination_code})`:''}</td>
          <td className="p-3">{quote.quantity} × {quote.equipment}</td>
          <td className="p-3">{quote.departure_date}</td>
          <td className="p-3">{quote.transit_days===undefined?'—':`${quote.transit_days} días`}</td>
          <td className="max-w-sm p-3">{quote.amount!==undefined&&quote.currency?<strong className="text-white">{quote.currency} {quote.amount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>:<strong className="text-amber-300">Sin total comparable</strong>}
            {quote.charges.length>0&&<details className="mt-1 text-[10px] text-slate-500"><summary className="cursor-pointer">Ver cargos ({quote.charges.length})</summary><div className="mt-1 space-y-1">{quote.charges.map((charge,index)=><div key={`${charge.name}:${index}`}>{charge.name} · {charge.category}: {charge.amount===undefined?'—':charge.amount.toLocaleString()} {charge.currency}{charge.rate_basis?` · ${charge.rate_basis}`:''}</div>)}</div></details>}
            {quote.unavailable_reason&&<span className="mt-1 block text-[10px] text-amber-300">{quote.unavailable_reason}</span>}
          </td>
          <td className="p-3">CargoFive {quote.source_type?`· ${quote.source_type}`:''}</td>
          <td className="p-3"><button type="button" disabled={!quote.selectable||!quote.selection_token||Boolean(selecting)} onClick={()=>selectQuote(quote)} className="whitespace-nowrap rounded bg-slate-700 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{selecting===quote.provider_rate_id?'Guardando…':'Seleccionar'}</button></td>
        </tr>)}</tbody>
      </table>
    </section>}

    <form onSubmit={manual} className="rounded-lg border border-slate-800 bg-[#141820] p-4">
      <h2 className="mb-3 font-bold text-white">Tarifa manual / contractual</h2>
      <div className="grid gap-3 md:grid-cols-3"><input required name="origin" placeholder="Origen" className={input}/><input required name="destination" placeholder="Destino" className={input}/><select name="equipment" className={input}><option>20GP</option><option>40GP</option><option>40HC</option><option>LCL</option></select><input required name="amount" type="number" min="0" step="0.01" placeholder="Importe" className={input}/><select name="currency" className={input}><option>USD</option><option>PYG</option></select><input name="valid_until" type="date" className={input}/></div>
      <button className="mt-4 rounded bg-slate-700 px-4 py-2 text-xs font-bold text-white">Guardar tarifa real</button>
    </form>
    <HistoryPanel rates={rates.filter(r=>r.mode==='OCEAN')}/>
  </div>;
}

function HistoryPanel({ rates }: { rates: LogisticsRate[] }) {
  const currencies=[...new Set(rates.map((rate)=>rate.currency))].sort();
  const summary=(currency:string)=>{
    const scoped=rates.filter((rate)=>rate.currency===currency);
    const recent=(days:number)=>{const floor=Date.now()-days*86400000;const rows=scoped.filter((rate)=>new Date(rate.created_at).getTime()>=floor);return rows.length?rows.reduce((sum,rate)=>sum+rate.amount,0)/rows.length:undefined;};
    const values=scoped.map((rate)=>rate.amount);
    return {currency,avg30:recent(30),avg90:recent(90),min:values.length?Math.min(...values):undefined,max:values.length?Math.max(...values):undefined};
  };
  const summaries=currencies.map(summary);
  return <div className="rounded-lg border border-slate-800 bg-[#141820] p-4">
    <h2 className="mb-4 flex items-center gap-2 font-bold text-white"><History className="h-4 w-4"/> Histórico de tarifas</h2>
    {summaries.length>0&&<div className="mb-4 space-y-2">{summaries.map((row)=><div key={row.currency} className="grid gap-2 sm:grid-cols-5">
      {[['Moneda',row.currency],['Promedio 30 días',row.avg30],['Promedio 90 días',row.avg90],['Mínimo',row.min],['Máximo',row.max]].map(([label,value])=><div key={String(label)} className="rounded border border-slate-800 p-2 text-[10px] text-slate-500">{label}<strong className="mt-1 block text-xs text-white">{typeof value==='number'?value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):String(value)}</strong></div>)}
    </div>)}</div>}
    {rates.length===0?<p className="text-sm text-slate-500">Sin datos.</p>:<div className="overflow-x-auto"><div className="min-w-[720px] space-y-2">{rates.map((rate)=><div key={rate.id} className="grid grid-cols-7 gap-2 border-t border-slate-800 py-2 text-xs text-slate-400"><span>{rate.origin.display_name||rate.origin.city||rate.origin.port||rate.origin.country} → {rate.destination.display_name||rate.destination.city||rate.destination.port||rate.destination.country}</span><span>{rate.mode}</span><span>{rate.equipment}</span><span>{rate.currency} {rate.amount.toLocaleString()}</span><span>{rate.components.provider_metadata?.carrier_name||rate.source}</span><span>{rate.status}</span><span>{rate.valid_until||'—'}</span></div>)}</div></div>}
  </div>;
}
