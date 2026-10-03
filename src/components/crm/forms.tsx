'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Avatar, Field, inputCls, PERIOD_LABEL, PRIORITY_LABEL, Segmented, sendJson, TASK_TYPE_LABEL } from './commercial-ui';
import type { CatalogSku, CrmActions, CrmData, TaskRow } from './types';

const COUNTRIES = [
  { code: 'BR', name: 'Brasil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'PY', name: 'Paraguay' },
];

function Footer({ onCancel, onSubmit, saving, label }: { onCancel: () => void; onSubmit: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="ghost" size="md" onClick={onCancel}>Cancelar</Button>
      <Button variant="primary" size="md" isLoading={saving} onClick={onSubmit}>{label}</Button>
    </div>
  );
}

export function NewOppModal({ open, onClose, data, actions, companyId }: { open: boolean; onClose: () => void; data: CrmData; actions: CrmActions; companyId?: string }) {
  const empty = { company: '', sku: '', volume: '', period: 'MONTHLY', value: '', close: '', owner: '', title: '' };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (!open) return;
    const c = companyId ? data.companyById.get(companyId) : null;
    setF({ ...empty, company: companyId ?? '', owner: c?.owner_profile_id ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId]);

  const companyName = f.company ? data.companyById.get(f.company)?.name : '';
  // El nombre se arma solo: lo que se vende + a quién. Se puede sobrescribir.
  const item = f.sku ? data.catalogBySku.get(f.sku) : undefined;
  const autoTitle = [item ? [item.product_name, item.size].filter(Boolean).join(' ') : '', companyName].filter(Boolean).join(' · ');

  async function submit() {
    if (!item) return actions.notify('Elegí el producto del maestro.', 'error');
    const title = f.title.trim() || autoTitle;
    if (title.length < 2) return actions.notify('Falta el producto.', 'error');
    setSaving(true);
    try {
      const body = (await sendJson('/api/crm/opportunities', 'POST', {
        title,
        company_id: f.company || null,
        product_interest: item.product_name,
        sku: item.sku,
        material: item.material,
        capacity: item.size,
        estimated_volume: f.volume.trim() ? Number(f.volume) : null,
        volume_period: f.volume.trim() ? f.period : null,
        estimated_value: f.value.trim() ? Number(f.value) : null,
        expected_close_at: f.close || null,
        owner_profile_id: f.owner || null,
      })) as { opportunity?: { id: string } } | null;
      onClose();
      actions.reload();
      actions.notify('Oportunidad creada en Nuevo.');
      if (body?.opportunity?.id) actions.openOpp(body.opportunity.id);
    } catch {
      actions.notify('No se pudo crear la oportunidad. Revisá los números.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Nueva oportunidad" description="Un pedido o cotización en juego. Entra al pipeline en Nuevo." maxWidth="lg">
      <div className="space-y-3">
        <Field label="Cuenta">
          <select autoFocus value={f.company} onChange={set('company')} className={inputCls}>
            <option value="">Sin cuenta todavía</option>
            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Producto (maestro)">
          <ProductPicker catalog={data.catalog} value={f.sku} onChange={(p) => setF((s) => ({ ...s, sku: p?.sku ?? '' }))} />
        </Field>
        {item?.moq ? <p className="-mt-1 text-xs text-slate-500">MOQ {item.moq.toLocaleString('es-PY')} u.{item.material ? ` · ${item.material}` : ''}</p> : null}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cantidad (u.)">
            <input value={f.volume} onChange={set('volume')} inputMode="numeric" placeholder="100000" className={`${inputCls} tabular-nums`} />
          </Field>
          <Field label="Frecuencia">
            <select value={f.period} onChange={set('period')} className={inputCls}>
              {Object.entries(PERIOD_LABEL).map(([k, v]) => <option key={k} value={k}>{k === 'ONE_OFF' ? 'Pedido único' : `Por ${v}`}</option>)}
            </select>
          </Field>
          <Field label="Valor (USD)">
            <input value={f.value} onChange={set('value')} inputMode="decimal" placeholder="0" className={`${inputCls} tabular-nums`} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cierre previsto">
            <input type="date" value={f.close} onChange={set('close')} className={inputCls} />
          </Field>
          <Field label="Responsable">
            <select value={f.owner} onChange={set('owner')} className={inputCls}>
              <option value="">Sin asignar</option>
              {data.owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Nombre en el pipeline">
          <input value={f.title} onChange={set('title')} placeholder={autoTitle || 'Se arma con producto y cuenta'} className={inputCls} />
        </Field>
        <Footer onCancel={onClose} onSubmit={() => void submit()} saving={saving} label="Crear oportunidad" />
      </div>
    </Modal>
  );
}

export function NewAccountModal({ open, onClose, data, actions }: { open: boolean; onClose: () => void; data: CrmData; actions: CrmActions }) {
  const empty = { name: '', taxId: '', country: 'PY', city: '', phone: '', email: '', owner: '', type: 'PROSPECT', contact: '', contactPhone: '', contactEmail: '' };
  const [f, setF] = useState(empty);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (open) setF(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    if (f.name.trim().length < 2) return actions.notify('Poné el nombre de la cuenta.', 'error');
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return actions.notify('El email no es válido.', 'error');
    setSaving(true);
    try {
      const body = (await sendJson('/api/crm/companies', 'POST', {
        name: f.name.trim(),
        tax_id: f.taxId.trim() || null,
        country_code: f.country,
        city: f.city.trim() || null,
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        owner_profile_id: f.owner || null,
        lifecycle_stage: f.type,
      })) as { company?: { id: string } } | null;
      const id = body?.company?.id;
      if (id && f.contact.trim().length >= 2) {
        await sendJson('/api/crm/contacts', 'POST', {
          company_id: id,
          full_name: f.contact.trim(),
          whatsapp_phone: f.contactPhone.trim() || null,
          email: f.contactEmail.trim() || null,
        }).catch(() => actions.notify('La cuenta se creó, pero no el contacto.', 'error'));
      }
      onClose();
      actions.reload();
      actions.notify(f.type === 'PROSPECT' ? 'Prospecto creado. Agendá el primer contacto desde Hoy.' : 'Cliente creado.');
      if (id) actions.openAccount(id);
    } catch {
      actions.notify('No se pudo crear la cuenta.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Nueva cuenta" maxWidth="lg">
      <div className="space-y-4">
        <Segmented
          value={f.type}
          onChange={(v) => setF((s) => ({ ...s, type: v }))}
          options={[
            { key: 'PROSPECT', label: 'Prospecto' },
            { key: 'CUSTOMER', label: 'Cliente que ya compra' },
          ]}
        />
        <div className="grid grid-cols-[1fr_160px] gap-3">
          <Field label="Empresa">
            <input autoFocus value={f.name} onChange={set('name')} placeholder="Nombre comercial" className={inputCls} />
          </Field>
          <Field label="RUC / CNPJ / CUIT">
            <input value={f.taxId} onChange={set('taxId')} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Teléfono">
            <input value={f.phone} onChange={set('phone')} placeholder="+595…" className={inputCls} />
          </Field>
          <Field label="Email">
            <input type="email" value={f.email} onChange={set('email')} placeholder="compras@empresa.com" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="País">
            <select value={f.country} onChange={set('country')} className={inputCls}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Ciudad">
            <input value={f.city} onChange={set('city')} className={inputCls} />
          </Field>
          <Field label="Responsable">
            <select value={f.owner} onChange={set('owner')} className={inputCls}>
              <option value="">Yo</option>
              {data.owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          </Field>
        </div>
        <fieldset className="rounded-lg border border-slate-800 p-3">
          <legend className="px-1 text-xs font-medium text-slate-400">Persona de contacto (opcional)</legend>
          <div className="grid grid-cols-3 gap-3">
            <input value={f.contact} onChange={set('contact')} placeholder="Nombre" className={inputCls} />
            <input value={f.contactPhone} onChange={set('contactPhone')} placeholder="WhatsApp" className={inputCls} />
            <input value={f.contactEmail} onChange={set('contactEmail')} placeholder="Email" className={inputCls} />
          </div>
        </fieldset>
        <Footer onCancel={onClose} onSubmit={() => void submit()} saving={saving} label={f.type === 'PROSPECT' ? 'Crear prospecto' : 'Crear cliente'} />
      </div>
    </Modal>
  );
}

export function TaskModal({ prefill, onClose, data, actions }: { prefill: Partial<TaskRow> | null; onClose: () => void; data: CrmData; actions: CrmActions }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('CALL');
  const [owner, setOwner] = useState('');
  const [company, setCompany] = useState('');
  const [opp, setOpp] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [due, setDue] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!prefill) return;
    setTitle(prefill.title ?? '');
    setType(prefill.task_type ?? 'CALL');
    setOwner(prefill.assigned_to ?? '');
    setCompany(prefill.company_id ?? '');
    setOpp(prefill.opportunity_id ?? '');
    setPriority(prefill.priority ?? 'MEDIUM');
    setDue(prefill.due_at ? prefill.due_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setDesc(prefill.description ?? '');
  }, [prefill]);

  const oppOptions = useMemo(() => data.opps.filter((o) => !company || o.company_id === company), [data.opps, company]);

  async function submit() {
    if (title.trim().length < 2) return actions.notify('Describí la tarea.', 'error');
    setSaving(true);
    try {
      await sendJson('/api/crm/tasks', 'POST', {
        title: title.trim(),
        task_type: type,
        assigned_to: owner || null,
        company_id: company || null,
        opportunity_id: opp || null,
        lead_id: prefill?.lead_id ?? null,
        priority,
        due_at: due ? new Date(`${due}T12:00:00`).toISOString() : null,
        description: desc.trim() || null,
        external_key: prefill?.external_key ?? null,
      });
      onClose();
      actions.reload();
      actions.notify('Tarea agendada.');
    } catch {
      actions.notify('No se pudo crear la tarea.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={Boolean(prefill)} onClose={onClose} title="Nueva tarea" maxWidth="lg">
      <div className="space-y-3">
        <Field label="Qué hay que hacer">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Llamar para confirmar pedido" className={inputCls} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tipo">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {Object.entries(TASK_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Fecha">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Prioridad">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cuenta">
            <select value={company} onChange={(e) => { setCompany(e.target.value); setOpp(''); }} className={inputCls}>
              <option value="">Ninguna</option>
              {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Oportunidad">
            <select value={opp} onChange={(e) => setOpp(e.target.value)} className={inputCls}>
              <option value="">Ninguna</option>
              {oppOptions.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Responsable">
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls}>
            <option value="">Sin asignar</option>
            {data.owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
          </select>
        </Field>
        <Field label="Detalle (opcional)">
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={inputCls} />
        </Field>
        <Footer onCancel={onClose} onSubmit={() => void submit()} saving={saving} label="Agendar" />
      </div>
    </Modal>
  );
}

/** Selector de SKU del maestro de productos, agrupado por categoría. */
export function ProductPicker({ catalog, value, onChange, autoFocus = false }: { catalog: CatalogSku[]; value: string; onChange: (sku: CatalogSku | null) => void; autoFocus?: boolean }) {
  if (catalog.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-400">
        El maestro de productos está vacío.{' '}
        <a href="/cost/skus" className="font-medium text-slate-100 underline">Cargá productos y SKUs</a> para poder elegirlos acá.
      </p>
    );
  }
  const groups = [...new Set(catalog.map((c) => c.category))];
  return (
    <select autoFocus={autoFocus} value={value} onChange={(e) => onChange(catalog.find((c) => c.sku === e.target.value) ?? null)} className={inputCls}>
      <option value="">Elegí un producto del maestro…</option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {catalog.filter((c) => c.category === g).map((c) => <option key={c.sku} value={c.sku}>{c.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

const OWNER_ERRORS: Record<string, string> = {
  ADMIN_REQUIRED: 'Solo un administrador puede agregar vendedores.',
  OWNER_EXISTS: 'Ese email ya está en tu equipo.',
  EMAIL_IN_USE: 'Ese email pertenece a otra organización.',
  INVALID_REQUEST: 'Revisá el nombre y el email.',
};

/** Equipo comercial: quiénes pueden ser responsables de cuentas, oportunidades y tareas. */
export function TeamModal({ open, onClose, data, actions }: { open: boolean; onClose: () => void; data: CrmData; actions: CrmActions }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useMemo(() => {
    const m = new Map<string, { accounts: number; opps: number; pipeline: number; tasks: number }>();
    for (const o of data.owners) m.set(o.id, { accounts: 0, opps: 0, pipeline: 0, tasks: 0 });
    for (const c of data.companies) {
      const x = c.owner_profile_id ? m.get(c.owner_profile_id) : null;
      if (x) x.accounts += 1;
    }
    for (const o of data.opps) {
      const x = o.owner_profile_id ? m.get(o.owner_profile_id) : null;
      if (x && o.stage !== 'GANADO' && o.stage !== 'PERDIDO') {
        x.opps += 1;
        x.pipeline += o.estimated_value ?? 0;
      }
    }
    for (const t of data.tasks) {
      const x = t.assigned_to ? m.get(t.assigned_to) : null;
      if (x && t.status !== 'DONE' && t.status !== 'CANCELLED') x.tasks += 1;
    }
    return m;
  }, [data.owners, data.companies, data.opps, data.tasks]);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch('/api/crm/owners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: name, email }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        actions.notify(OWNER_ERRORS[body.error ?? ''] ?? 'No se pudo agregar el vendedor.', 'error');
        return;
      }
      setName('');
      setEmail('');
      actions.reload();
      actions.notify(`${name.trim()} ya puede ser responsable.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Equipo comercial" description="Responsables de cuentas, oportunidades y tareas." maxWidth="xl">
      <div className="space-y-4">
        <ul className="max-h-72 divide-y divide-slate-800 overflow-y-auto rounded-lg border border-slate-800">
          {data.owners.map((o) => {
            const l = load.get(o.id);
            return (
              <li key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={o.full_name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">{o.full_name}</span>
                  <span className="block truncate text-xs text-slate-500">{o.email}</span>
                </span>
                <span className="text-right text-xs tabular-nums text-slate-400">
                  {l?.accounts ?? 0} cuentas · {l?.opps ?? 0} oport. · {l?.tasks ?? 0} tareas
                </span>
              </li>
            );
          })}
        </ul>
        <div className="rounded-lg border border-slate-800 p-3">
          <p className="text-xs font-medium text-slate-400">Agregar vendedor</p>
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" className={inputCls} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@niupack.com.py" className={inputCls} />
            <Button variant="primary" size="md" isLoading={saving} disabled={name.trim().length < 2 || !email.includes('@')} onClick={() => void submit()}>
              Agregar
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Queda disponible como responsable al instante. Para que entre al sistema necesita un usuario de acceso con ese mismo email; al iniciar sesión se vincula solo.
          </p>
        </div>
      </div>
    </Modal>
  );
}
