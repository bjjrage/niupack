'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, Anchor, History, Plus, Truck } from 'lucide-react';
import type { LogisticsQuote, LogisticsRate, LogisticsRfq } from '@/lib/logistics/domain';
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
    return shell(<div className="grid gap-4 md:grid-cols-4">{[['RFQs abiertos',open],['Respuestas pendientes',pending],['Tarifas por vencer',expiring],['Tarifas seleccionadas',selected]].map(([label,value]) => <div key={label} className="rounded-lg border border-slate-800 bg-[#141820] p-4"><span className="text-xs text-slate-400">{label}</span><div className="mt-2 text-2xl font-bold text-white">{value || 'Sin datos'}</div></div>)}</div>);
  }

  if (view === 'road') return shell(<RoadPanel rfqs={rfqs} quotes={quotes} suppliers={suppliers} reload={load} setFeedback={setFeedback}/>);
  if (view === 'ocean') return shell(<OceanPanel rates={rates} reload={load} setFeedback={setFeedback}/>);
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

function OceanPanel({ rates, reload, setFeedback }: { rates: LogisticsRate[]; reload:()=>Promise<void>; setFeedback:(v:string)=>void }) {
  const [apiStatus,setApiStatus]=useState('Sin consultar'); const input='rounded border border-slate-700 bg-[#0c0f14] px-3 py-2 text-xs text-white';
  async function search(){const res=await fetch('/api/logistics/ocean/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:{country:'China',port:'Shanghai'},destination:{country:'Paraguay',port:'Asunción'},shipment_date:new Date().toISOString().slice(0,10),load_type:'FCL',equipment:'40HC',weight_kg:0,volume_m3:0})});const data=await res.json();setApiStatus(`${data.status}: ${data.message||`${data.rates.length} tarifas`}`);}
  async function manual(event:FormEvent<HTMLFormElement>){event.preventDefault();const f=new FormData(event.currentTarget);const res=await fetch('/api/logistics/rates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:{country:f.get('origin')},destination:{country:f.get('destination')},mode:'OCEAN',amount:Number(f.get('amount')),currency:f.get('currency'),equipment:f.get('equipment'),valid_until:f.get('valid_until'),status:'CONFIRMED'})});const data=await res.json();setFeedback(res.ok?`Tarifa manual ${data.rate.id} guardada.`:data.error);await reload();}
  return <div className="space-y-6"><div className="rounded-lg border border-slate-800 bg-[#141820] p-5"><h2 className="flex items-center gap-2 font-bold text-white"><Anchor className="h-4 w-4"/> SeaRates API-first</h2><p className="my-3 text-xs text-slate-400">No se muestran tarifas ficticias. Sin credencial, el adaptador responde NOT_CONFIGURED.</p><button onClick={search} className="rounded bg-red-600 px-4 py-2 text-xs font-bold">Consultar SeaRates</button><span className="ml-3 text-xs text-amber-300">{apiStatus}</span></div><form onSubmit={manual} className="rounded-lg border border-slate-800 bg-[#141820] p-5"><h2 className="mb-3 font-bold text-white">Tarifa manual / contractual</h2><div className="grid gap-3 md:grid-cols-3"><input required name="origin" placeholder="Origen" className={input}/><input required name="destination" placeholder="Destino" className={input}/><select name="equipment" className={input}><option>20GP</option><option>40GP</option><option>40HC</option><option>LCL</option></select><input required name="amount" type="number" step="0.01" placeholder="Importe" className={input}/><select name="currency" className={input}><option>USD</option><option>PYG</option></select><input name="valid_until" type="date" className={input}/></div><button className="mt-4 rounded bg-slate-700 px-4 py-2 text-xs font-bold">Guardar tarifa real</button></form><HistoryPanel rates={rates.filter(r=>r.mode==='OCEAN')}/></div>;
}

function HistoryPanel({ rates }: { rates: LogisticsRate[] }) { const values=rates.map(r=>r.amount); const avg=(days:number)=>{const floor=Date.now()-days*86400000;const scoped=rates.filter(r=>new Date(r.created_at).getTime()>=floor);return scoped.length?scoped.reduce((s,r)=>s+r.amount,0)/scoped.length:undefined}; return <div className="rounded-lg border border-slate-800 bg-[#141820] p-5"><h2 className="mb-4 flex items-center gap-2 font-bold text-white"><History className="h-4 w-4"/> Histórico de tarifas</h2><div className="mb-4 grid gap-3 md:grid-cols-4">{[['Promedio 30 días',avg(30)],['Promedio 90 días',avg(90)],['Mínimo',values.length?Math.min(...values):undefined],['Máximo',values.length?Math.max(...values):undefined]].map(([l,v])=><div key={String(l)} className="rounded border border-slate-800 p-3 text-xs text-slate-400">{l}<strong className="mt-1 block text-white">{typeof v==='number'?v.toFixed(2):'Sin datos'}</strong></div>)}</div>{rates.length===0?<p className="text-sm text-slate-500">Sin datos.</p>:<div className="space-y-2">{rates.map(r=><div key={r.id} className="grid grid-cols-6 gap-2 border-t border-slate-800 py-2 text-xs"><span>{r.origin.city||r.origin.port||r.origin.country} → {r.destination.city||r.destination.port||r.destination.country}</span><span>{r.mode}</span><span>{r.equipment}</span><span>{r.currency} {r.amount}</span><span>{r.source}</span><span>{r.status}</span></div>)}</div>}</div>; }
