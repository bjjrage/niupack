'use client';

import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Card, Drawer, DrawerClose, Empty, Field, inputCls, Pill, timeAgo, useCrmFetch } from '../commercial-ui';
import { placeholders, renderTemplate, TEMPLATE_BODY_MAX } from '@/lib/niupackbot/outreach/template-text';
import type { OutreachTemplate, TemplateCategory, TemplateLanguage } from '@/lib/niupackbot/outreach/types';
import type { CrmActions } from '../types';
import { callApi } from './api';
import { CATEGORY_LABEL, errorMessage, LANGUAGE_LABEL, TEMPLATE_STATUS } from './labels';

/** Templates de WhatsApp: viven dentro de Campañas, no son un módulo aparte. */
export function TemplatesPanel({ onClose, actions, onChanged }: { onClose: () => void; actions: CrmActions; onChanged: () => void }) {
  const q = useCrmFetch<{ templates: OutreachTemplate[] }>('/api/crm/templates');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const templates = q.data?.templates ?? [];

  async function act(t: OutreachTemplate, action: 'submit' | 'sync') {
    setBusy(`${action}-${t.id}`);
    const r = await callApi<{ template: OutreachTemplate }>(`/api/crm/templates/${t.id}`, 'POST', { action });
    setBusy(null);
    if (!r.ok) return actions.notify(errorMessage(r.error), 'error');
    actions.notify(action === 'submit' ? 'Enviado a aprobación de WhatsApp. Suele tardar minutos u horas.' : `Estado actualizado: ${TEMPLATE_STATUS[r.data.template.status].label}.`);
    await q.reload();
    onChanged();
  }

  return (
    <Drawer onClose={onClose} width="max-w-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Templates de WhatsApp</h2>
          <p className="mt-1 max-w-md text-sm text-slate-400">
            El primer mensaje a un contacto solo puede ser un template aprobado por WhatsApp. Creá uno, enviálo a aprobación y usalo en tus campañas.
          </p>
        </div>
        <DrawerClose onClose={onClose} />
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="flex justify-end">
          <Button variant="primary" size="md" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nuevo template
          </Button>
        </div>
        {templates.length === 0 ? (
          <Card>
            <Empty title={q.loading ? 'Cargando templates…' : 'Todavía no hay templates'} hint={q.loading ? undefined : 'Creá el primero para poder lanzar campañas.'} />
          </Card>
        ) : (
          <ul className="space-y-3">
            {templates.map((t) => {
              const st = TEMPLATE_STATUS[t.status];
              return (
                <li key={t.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="mr-auto font-mono text-sm font-medium text-slate-100">{t.name}</p>
                      <span className="text-xs text-slate-500">
                        {LANGUAGE_LABEL[t.language]} · {CATEGORY_LABEL[t.category]}
                      </span>
                      <Pill tone={st.tone} dot>{st.label}</Pill>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-800 bg-[#0c0f14] px-3 py-2.5 text-sm leading-relaxed text-slate-300">{t.body}</p>
                    {t.rejection_reason && <p className="mt-2 text-xs text-red-400">Motivo del rechazo: {t.rejection_reason}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-600">Creado {timeAgo(t.created_at)}</span>
                      <div className="flex gap-2">
                        {(t.status === 'DRAFT' || t.status === 'REJECTED') && (
                          <Button variant="outline" size="sm" isLoading={busy === `submit-${t.id}`} onClick={() => void act(t, 'submit')}>
                            {t.status === 'REJECTED' ? 'Reenviar a aprobación' : 'Enviar a aprobación'}
                          </Button>
                        )}
                        {t.twilio_content_sid && t.status !== 'APPROVED' && (
                          <Button variant="ghost" size="sm" isLoading={busy === `sync-${t.id}`} onClick={() => void act(t, 'sync')}>
                            <RefreshCw className="h-3.5 w-3.5" /> Actualizar estado
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <TemplateForm
        open={creating}
        onClose={() => setCreating(false)}
        actions={actions}
        onCreated={async () => {
          setCreating(false);
          await q.reload();
          onChanged();
        }}
      />
    </Drawer>
  );
}

function TemplateForm({ open, onClose, actions, onCreated }: { open: boolean; onClose: () => void; actions: CrmActions; onCreated: () => void }) {
  const [f, setF] = useState({ name: '', language: 'es' as TemplateLanguage, category: 'MARKETING' as TemplateCategory, body: '', example1: '' });
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null);
  const usesName = placeholders(f.body).includes(1);

  async function save(submit: boolean) {
    setSaving(submit ? 'submit' : 'draft');
    const r = await callApi('/api/crm/templates', 'POST', { ...f, example1: usesName ? f.example1 : undefined, submit });
    setSaving(null);
    if (!r.ok) return actions.notify(errorMessage(r.error), 'error');
    actions.notify(submit ? 'Template creado y enviado a aprobación.' : 'Template guardado como borrador.');
    setF({ name: '', language: 'es', category: 'MARKETING', body: '', example1: '' });
    onCreated();
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Nuevo template" description="Se crea en Twilio y WhatsApp lo revisa antes de poder usarse." maxWidth="xl">
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_150px_130px] gap-3">
          <Field label="Nombre interno">
            <input
              autoFocus
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') })}
              placeholder="presentacion_niupack"
              className={`${inputCls} font-mono`}
            />
          </Field>
          <Field label="Idioma">
            <select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as TemplateLanguage })} className={inputCls}>
              {Object.entries(LANGUAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Categoría">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as TemplateCategory })} className={inputCls}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Mensaje">
          <textarea
            value={f.body}
            onChange={(e) => setF({ ...f, body: e.target.value })}
            rows={5}
            maxLength={TEMPLATE_BODY_MAX}
            placeholder="Hola {{1}}, somos NIUPACK, planta en Asunción. Fabricamos vasos, potes y tapas. ¿Te interesa que te contemos más?"
            className={inputCls}
          />
        </Field>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <button type="button" onClick={() => setF({ ...f, body: `${f.body}${f.body && !f.body.endsWith(' ') ? ' ' : ''}{{1}}` })} className="font-medium text-slate-300 hover:text-white">
            + Insertar nombre del contacto {'{{1}}'}
          </button>
          <span className="tabular-nums">{f.body.length} / {TEMPLATE_BODY_MAX}</span>
        </div>
        {usesName && (
          <Field label="Ejemplo de nombre (WhatsApp lo pide para aprobar)">
            <input value={f.example1} onChange={(e) => setF({ ...f, example1: e.target.value })} placeholder="María" className={inputCls} />
          </Field>
        )}
        {f.body.trim() && (
          <div>
            <p className="text-xs font-medium text-slate-400">Así lo recibe el cliente</p>
            <p className="mt-1 whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-slate-800 bg-[#0c0f14] px-3.5 py-2.5 text-sm text-slate-100">
              {renderTemplate(f.body, { '1': f.example1 || 'María' })}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="md" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary" size="md" isLoading={saving === 'draft'} disabled={!f.name || !f.body.trim()} onClick={() => void save(false)}>Guardar borrador</Button>
          <Button variant="primary" size="md" isLoading={saving === 'submit'} disabled={!f.name || !f.body.trim()} onClick={() => void save(true)}>Crear y enviar a aprobación</Button>
        </div>
      </div>
    </Modal>
  );
}
