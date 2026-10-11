'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { PRINT_PROCESSES, PROVIDER_TYPES } from '@/lib/print-rfq/domain';
import { api, buttonClass, ghostButtonClass, inputClass } from './format';

interface Provider { id: string; provider_type: string; name: string; ruc: string | null; contact_name: string | null; email: string | null; phone: string | null; city: string | null; processes: string[]; notes: string | null; active: boolean }
const EMPTY = { provider_type: 'IMPRENTA', name: '', ruc: '', contact_name: '', email: '', phone: '', city: '', processes: [] as string[], notes: '', active: true };

/** Registro de proveedores de Compras. La imprenta es un tipo más; no se mezcla con los transportistas de Logística. */
export function ProvidersPanel() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  const load = useCallback(async () => {
    try { setProviders((await api<{ providers: Provider[] }>('/api/print-rfq/providers?all=1')).providers); setError(null); }
    catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = (key: keyof typeof EMPTY, value: unknown) => setForm((f) => ({ ...f, [key]: value }));
  const toggleProcess = (name: string) => set('processes', form.processes.includes(name) ? form.processes.filter((p) => p !== name) : [...form.processes, name]);
  const reset = () => { setForm({ ...EMPTY }); setEditing(null); };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      await api(editing ? `/api/print-rfq/providers/${editing}` : '/api/print-rfq/providers', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      reset(); await load();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  async function toggleActive(p: Provider) {
    setBusy(true);
    try { await api(`/api/print-rfq/providers/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, provider_type: p.provider_type, ruc: p.ruc ?? '', contact_name: p.contact_name ?? '', email: p.email ?? '', phone: p.phone ?? '', city: p.city ?? '', notes: p.notes ?? '', active: !p.active }) }); await load(); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  const startEdit = (p: Provider) => { setEditing(p.id); setForm({ provider_type: p.provider_type, name: p.name, ruc: p.ruc ?? '', contact_name: p.contact_name ?? '', email: p.email ?? '', phone: p.phone ?? '', city: p.city ?? '', processes: p.processes, notes: p.notes ?? '', active: p.active }); };

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}

      <form onSubmit={save} className="space-y-3 rounded border border-slate-800 bg-[#141820] p-4">
        <p className="text-sm font-medium text-white">{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-[11px] text-slate-400">Tipo de proveedor *
            <select value={form.provider_type} onChange={(e) => set('provider_type', e.target.value)} className={inputClass}>{Object.entries(PROVIDER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="text-[11px] text-slate-400">Nombre *<input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} /></label>
          <label className="text-[11px] text-slate-400">RUC<input value={form.ruc} onChange={(e) => set('ruc', e.target.value)} className={inputClass} /></label>
          <label className="text-[11px] text-slate-400">Ciudad<input value={form.city} onChange={(e) => set('city', e.target.value)} className={inputClass} /></label>
          <label className="text-[11px] text-slate-400">Contacto<input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} className={inputClass} /></label>
          <label className="text-[11px] text-slate-400">Email<input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputClass} /></label>
          <label className="text-[11px] text-slate-400">Teléfono / WhatsApp<input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+595 9…" className={inputClass} /></label>
        </div>
        <fieldset>
          <legend className="mb-1 text-[11px] text-slate-400">Procesos de impresión que ofrece (si es imprenta)</legend>
          <div className="flex flex-wrap gap-3">
            {PRINT_PROCESSES.map((name) => (
              <label key={name} className="flex items-center gap-1.5 text-xs text-slate-300"><input type="checkbox" checked={form.processes.includes(name)} onChange={() => toggleProcess(name)} />{name}</label>
            ))}
          </div>
        </fieldset>
        <label className="block text-[11px] text-slate-400">Notas<textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} className={inputClass} /></label>
        <div className="flex gap-2">
          <button disabled={busy} className={buttonClass}>{editing ? 'Guardar cambios' : 'Agregar proveedor'}</button>
          {editing && <button type="button" onClick={reset} className={ghostButtonClass}>Cancelar</button>}
        </div>
      </form>

      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filtrar por tipo" className={`${inputClass} w-56`}>
        <option value="">Todos los tipos</option>{Object.entries(PROVIDER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {loading ? <p className="text-xs text-slate-400">Cargando…</p> : providers.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">Todavía no hay proveedores cargados. Agregá el primero para poder invitarlo a cotizar.</p>
      ) : (
        <ul className="space-y-2" data-testid="provider-list">
          {providers.filter((p) => !typeFilter || p.provider_type === typeFilter).map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 bg-[#141820] p-3 ${p.active ? '' : 'opacity-60'}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{p.name} <Badge size="sm" variant="neutral">{PROVIDER_TYPES[p.provider_type as keyof typeof PROVIDER_TYPES] ?? p.provider_type}</Badge> {!p.active && <Badge size="sm">Inactivo</Badge>}</p>
                <p className="text-[11px] text-slate-400">{[p.city, p.contact_name, p.phone, p.email, p.ruc && `RUC ${p.ruc}`].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</p>
                {p.processes.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{p.processes.map((x) => <Badge key={x} size="sm" variant="brand">{x}</Badge>)}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(p)} className={ghostButtonClass}>Editar</button>
                <button disabled={busy} onClick={() => void toggleActive(p)} className={ghostButtonClass}>{p.active ? 'Desactivar' : 'Activar'}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
