'use client';

import { useMemo, useState } from 'react';
import { Check, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, Drawer, DrawerClose, Field, inputCls, Pill, useCrmFetch } from '../commercial-ui';
import { parseContactsCsv, previewContacts, type PreviewRow } from '@/lib/niupackbot/outreach/csv';
import { normalizePhone } from '@/lib/niupackbot/outreach/phone';
import { placeholders, renderTemplate } from '@/lib/niupackbot/outreach/template-text';
import type { OutreachTemplate } from '@/lib/niupackbot/outreach/types';
import type { CrmActions, CrmData } from '../types';
import { callApi } from './api';
import { errorMessage, LANGUAGE_LABEL, TEMPLATE_STATUS } from './labels';

type Step = 'template' | 'audience' | 'review';
const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'template', label: 'Plantilla' },
  { key: 'audience', label: 'Audiencia' },
  { key: 'review', label: 'Ritmo y revisión' },
];
const RATES = [10, 20, 30, 60];
const CRM_LIST_CAP = 80;

interface Entry {
  name: string;
  phone: string;
  source: 'crm' | 'csv';
}

export function CampaignWizard({ onClose, data, actions, onCreated }: { onClose: () => void; data: CrmData; actions: CrmActions; onCreated: (campaignId: string) => void }) {
  const tplQ = useCrmFetch<{ templates: OutreachTemplate[] }>('/api/crm/templates');
  const templates = tplQ.data?.templates ?? [];

  const [step, setStep] = useState<Step>('template');
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set()); // contactIds del CRM
  const [search, setSearch] = useState('');
  const [csvText, setCsvText] = useState('');
  const [rate, setRate] = useState(20);
  const [scheduled, setScheduled] = useState('');
  const [busy, setBusy] = useState<'draft' | 'launch' | null>(null);

  const template = templates.find((t) => t.id === templateId);

  // Contactos del CRM con teléfono utilizable.
  const crmContacts = useMemo(
    () =>
      data.contacts
        .map((c) => {
          const p = [c.whatsapp_phone, c.phone].map(normalizePhone).find((x) => x.ok);
          return { id: c.id, name: c.full_name, company: c.company_id ? data.companyById.get(c.company_id)?.name ?? '' : '', e164: p?.e164 ?? '' };
        })
        .filter((c) => c.e164),
    [data.contacts, data.companyById],
  );
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return crmContacts.filter((c) => !t || `${c.name} ${c.company} ${c.e164}`.toLowerCase().includes(t));
  }, [crmContacts, search]);

  const csv = useMemo(() => previewContacts(parseContactsCsv(csvText)), [csvText]);

  // Audiencia final: CRM + CSV, sin repetir teléfonos (gana el contacto del CRM).
  const audience: Entry[] = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const c of crmContacts) if (selected.has(c.id)) map.set(c.e164, { name: c.name, phone: c.e164, source: 'crm' });
    for (const r of csv.rows) if (r.estado === 'valido' && !map.has(r.phone_e164)) map.set(r.phone_e164, { name: r.nombre, phone: r.phone_e164, source: 'csv' });
    return [...map.values()];
  }, [crmContacts, selected, csv.rows]);

  // Filas pegadas cuyo teléfono ya está elegido desde el CRM: cuentan como repetidas.
  const crmPhones = new Set(crmContacts.filter((c) => selected.has(c.id)).map((c) => c.e164));
  const repeated = csv.resumen.duplicados + csv.rows.filter((r) => r.estado === 'valido' && crmPhones.has(r.phone_e164)).length;
  const approved = template?.status === 'APPROVED';
  const canNext = step === 'template' ? name.trim().length >= 2 && Boolean(template) : step === 'audience' ? audience.length > 0 : true;
  const minutes = Math.max(1, Math.ceil(audience.length / rate));
  const firstName = (audience[0]?.name ?? 'María').trim().split(/\s+/)[0];

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setCsvText(await file.text());
  }

  async function submit(launch: boolean) {
    if (!template) return;
    setBusy(launch ? 'launch' : 'draft');
    const created = await callApi<{ campaign: { id: string }; recipients: { added: number; optOut: number } }>('/api/crm/campaigns', 'POST', {
      name: name.trim(),
      templateId: template.id,
      sendRatePerMin: rate,
      scheduledAt: scheduled ? new Date(scheduled).toISOString() : null,
      audience: {
        contactIds: audience.filter((a) => a.source === 'crm').map((a) => crmContacts.find((c) => c.e164 === a.phone)!.id),
        rows: audience.filter((a) => a.source === 'csv').map((a) => ({ name: a.name, phone: a.phone })),
      },
    });
    if (!created.ok) {
      setBusy(null);
      return actions.notify(errorMessage(created.error), 'error');
    }
    const id = created.data.campaign.id;
    if (launch) {
      const l = await callApi(`/api/crm/campaigns/${id}/action`, 'POST', { action: 'launch' });
      if (!l.ok) {
        setBusy(null);
        actions.notify(`La campaña se guardó como borrador, pero no se lanzó: ${errorMessage(l.error)}`, 'error');
        onCreated(id);
        return;
      }
    }
    setBusy(null);
    actions.notify(launch ? (scheduled ? 'Campaña programada.' : 'Campaña lanzada. Los envíos empezaron.') : 'Borrador guardado.');
    onCreated(id);
  }

  return (
    <Drawer onClose={onClose} width="max-w-3xl">
      <header className="border-b border-slate-800 px-6 pb-4 pt-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">Nueva campaña</h2>
          <DrawerClose onClose={onClose} />
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2">
          {STEPS.map((s, i) => {
            const idx = STEPS.findIndex((x) => x.key === step);
            const done = i < idx;
            return (
              <li key={s.key}>
                <span className={`block h-1.5 rounded-full ${i <= idx ? 'bg-brand-500' : 'bg-slate-800'}`} />
                <span className={`mt-1.5 flex items-center gap-1.5 text-xs ${i === idx ? 'font-semibold text-white' : 'text-slate-500'}`}>
                  {done ? <Check className="h-3 w-3 text-emerald-400" /> : <span className="tabular-nums">{i + 1}.</span>} {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
        {step === 'template' && (
          <>
            <Field label="Nombre de la campaña">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Presentación NIUPACK · cafeterías octubre" className={inputCls} />
            </Field>
            <div>
              <p className="text-xs font-medium text-slate-400">Template (el primer mensaje que recibe el contacto)</p>
              {templates.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-400">
                  {tplQ.loading ? 'Cargando templates…' : 'No hay templates todavía. Cerrá este asistente y creá uno desde “Templates”.'}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {templates.map((t) => {
                    const st = TEMPLATE_STATUS[t.status];
                    const ok = t.status === 'APPROVED';
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => setTemplateId(t.id)}
                          className={`w-full rounded-xl border p-3.5 text-left transition ${templateId === t.id ? 'border-brand-500/70 bg-brand-500/5' : 'border-slate-800 bg-[#141820] hover:border-slate-600'} ${ok ? '' : 'opacity-75'}`}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="mr-auto font-mono text-sm text-slate-100">{t.name}</span>
                            <span className="text-xs text-slate-500">{LANGUAGE_LABEL[t.language]}</span>
                            <Pill tone={st.tone} dot>{st.label}</Pill>
                          </span>
                          <span className="mt-1.5 line-clamp-2 block text-sm text-slate-400">{t.body}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {template && !approved && (
                <p className="mt-2 text-xs text-amber-400">Este template todavía no está aprobado: podés guardar la campaña como borrador, pero no lanzarla hasta que WhatsApp lo apruebe.</p>
              )}
            </div>
          </>
        )}

        {step === 'audience' && (
          <>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-100">Contactos del CRM <span className="font-normal text-slate-500">({crmContacts.length} con teléfono)</span></h3>
                {filtered.length > 0 && (
                  <button
                    className="text-xs font-medium text-slate-400 hover:text-white"
                    onClick={() => setSelected((s) => (filtered.slice(0, CRM_LIST_CAP).every((c) => s.has(c.id)) ? new Set([...s].filter((id) => !filtered.some((c) => c.id === id))) : new Set([...s, ...filtered.slice(0, CRM_LIST_CAP).map((c) => c.id)])))}
                  >
                    Seleccionar visibles
                  </button>
                )}
              </div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, empresa o teléfono" className={`${inputCls} mt-3`} />
              {crmContacts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No hay contactos con teléfono en el CRM. Importá una lista abajo.</p>
              ) : (
                <ul className="mt-3 max-h-56 divide-y divide-slate-800/70 overflow-y-auto rounded-lg border border-slate-800">
                  {filtered.slice(0, CRM_LIST_CAP).map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-800/30">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                          className="h-4 w-4 accent-[#e30613]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-100">{c.name}</span>
                          <span className="block truncate text-xs text-slate-500">{c.company || 'Sin empresa'}</span>
                        </span>
                        <span className="text-xs tabular-nums text-slate-400">{c.e164}</span>
                      </label>
                    </li>
                  ))}
                  {filtered.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">Sin coincidencias.</li>}
                </ul>
              )}
              {filtered.length > CRM_LIST_CAP && <p className="mt-2 text-xs text-slate-500">Mostrando {CRM_LIST_CAP} de {filtered.length}. Afiná la búsqueda para ver el resto.</p>}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-100">Importar lista</h3>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white">
                  <Upload className="h-3.5 w-3.5" /> Subir CSV
                  <input type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={(e) => void loadFile(e.target.files?.[0])} />
                </label>
              </div>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={4}
                placeholder={'Pegá una lista: nombre, teléfono\nMaría López, 0981 123 456\nJoão Silva, +55 41 99999-1234'}
                className={`${inputCls} mt-3 font-mono text-xs`}
              />
              <p className="mt-1.5 text-xs text-slate-500">Teléfonos de Paraguay, Brasil, Argentina o Bolivia. Sin código de país se asume Paraguay.</p>
              {csv.resumen.total > 0 && (
                <div className="mt-3">
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="text-emerald-400">{csv.resumen.validos} válidos</span>
                    {csv.resumen.invalidos > 0 && <span className="text-red-400">{csv.resumen.invalidos} inválidos</span>}
                    {csv.resumen.duplicados > 0 && <span className="text-amber-400">{csv.resumen.duplicados} repetidos</span>}
                  </p>
                  <PreviewTable rows={csv.rows} />
                </div>
              )}
            </Card>
          </>
        )}

        {step === 'review' && template && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ritmo de envío">
                <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className={inputCls}>
                  {RATES.map((r) => <option key={r} value={r}>{r} mensajes por minuto</option>)}
                </select>
              </Field>
              <Field label="Programar (opcional)">
                <input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Card className="p-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact k="Destinatarios" v={String(audience.length)} />
                <Fact k="Del CRM" v={String(audience.filter((a) => a.source === 'crm').length)} />
                <Fact k="Importados" v={String(audience.filter((a) => a.source === 'csv').length)} />
                <Fact k="Duración aprox." v={minutes < 60 ? `${minutes} min` : `${Math.round((minutes / 60) * 10) / 10} h`} />
              </dl>
              {(csv.resumen.invalidos > 0 || repeated > 0) && (
                <p className="mt-3 text-xs text-amber-400">Se excluyen {csv.resumen.invalidos} teléfonos inválidos y {repeated} repetidos. Los contactos que ya pidieron la baja quedan marcados y no reciben nada.</p>
              )}
            </Card>
            <div>
              <p className="text-xs font-medium text-slate-400">Así lo recibe {placeholders(template.body).includes(1) ? firstName : 'el contacto'}</p>
              <p className="mt-1 whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-slate-800 bg-[#0c0f14] px-3.5 py-2.5 text-sm text-slate-100">{renderTemplate(template.body, { '1': firstName })}</p>
              <p className="mt-2 text-xs text-slate-500">Cuando respondan, NIUPACKBOT los atiende: se presenta, entiende qué necesitan y pasa a un vendedor si piden precio, cotización o una persona. No cotiza.</p>
            </div>
            {!approved && <p className="rounded-lg border border-amber-900/60 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">El template está “{TEMPLATE_STATUS[template.status].label.toLowerCase()}”: solo se puede guardar como borrador.</p>}
          </>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
        <Button variant="ghost" size="md" onClick={() => (step === 'template' ? onClose() : setStep(STEPS[STEPS.findIndex((s) => s.key === step) - 1].key))}>
          {step === 'template' ? 'Cancelar' : 'Atrás'}
        </Button>
        {step !== 'review' ? (
          <Button variant="primary" size="md" disabled={!canNext} onClick={() => setStep(STEPS[STEPS.findIndex((s) => s.key === step) + 1].key)}>Siguiente</Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" size="md" isLoading={busy === 'draft'} disabled={busy !== null} onClick={() => void submit(false)}>Guardar borrador</Button>
            <Button variant="primary" size="md" isLoading={busy === 'launch'} disabled={!approved || audience.length === 0 || busy !== null} onClick={() => void submit(true)}>
              {scheduled ? 'Programar campaña' : `Lanzar a ${audience.length}`}
            </Button>
          </div>
        )}
      </footer>
    </Drawer>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-white">{v}</dd>
    </div>
  );
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  // Primero lo que hay que corregir; después una muestra de los válidos.
  const shown = [...rows.filter((r) => r.estado !== 'valido'), ...rows.filter((r) => r.estado === 'valido')].slice(0, 8);
  return (
    <ul className="mt-2 divide-y divide-slate-800/70 rounded-lg border border-slate-800 text-xs">
      {shown.map((r, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-slate-200">{r.nombre}</span>
          <span className="tabular-nums text-slate-400">{r.phone_e164 || r.telefonoOriginal || '—'}</span>
          <span className={`w-32 truncate text-right ${r.estado === 'valido' ? 'text-emerald-400' : r.estado === 'duplicado' ? 'text-amber-400' : 'text-red-400'}`}>{r.estado === 'valido' ? 'Válido' : r.motivo}</span>
        </li>
      ))}
      {rows.length > shown.length && <li className="px-3 py-1.5 text-slate-500">y {rows.length - shown.length} más…</li>}
    </ul>
  );
}
