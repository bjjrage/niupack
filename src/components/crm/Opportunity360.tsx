'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Trophy, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { opportunityProbability } from '@/lib/crm/types';
import {
  ACTIVITY_LABEL,
  Avatar,
  daysFromToday,
  Drawer,
  DrawerClose,
  Field,
  fmtDateLabel,
  fmtMoney,
  fmtVolume,
  inputCls,
  label,
  OPEN_STAGES,
  ownerName,
  Pill,
  QUALIFICATION_LABEL,
  sendJson,
  STAGE_LABEL,
  timeAgo,
} from './commercial-ui';
import type { CrmActions, CrmData, Opp } from './types';

interface Activity {
  id: string;
  type: string;
  title?: string | null;
  body?: string | null;
  occurred_at: string;
}

export function Opportunity360({ opp, data, actions, onClose }: { opp: Opp; data: CrmData; actions: CrmActions; onClose: () => void }) {
  const company = opp.company_id ? data.companyById.get(opp.company_id) : null;
  const contact = opp.contact_id ? data.contactById.get(opp.contact_id) : null;
  const closed = opp.stage === 'GANADO' || opp.stage === 'PERDIDO';
  const currency = opp.currency ?? 'USD';

  const [busy, setBusy] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState(opp.next_action ?? '');
  const [nextAt, setNextAt] = useState(opp.next_action_at ? opp.next_action_at.slice(0, 10) : '');
  const [form, setForm] = useState({
    title: opp.title,
    value: opp.estimated_value != null ? String(opp.estimated_value) : '',
    probability: opp.probability != null ? String(opp.probability) : '',
    owner: opp.owner_profile_id ?? '',
    close: opp.expected_close_at ? opp.expected_close_at.slice(0, 10) : '',
  });
  const [editing, setEditing] = useState(false);
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [note, setNote] = useState('');
  const [timeline, setTimeline] = useState<Activity[] | null>(null);

  const loadTimeline = useCallback(async () => {
    const urls = [`/api/crm/activities?opportunity_id=${opp.id}`];
    if (opp.lead_id) urls.push(`/api/crm/activities?lead_id=${opp.lead_id}`);
    const lists = await Promise.all(
      urls.map((u) =>
        fetch(u, { cache: 'no-store' })
          .then((r) => (r.ok ? (r.json() as Promise<{ activities: Activity[] }>) : { activities: [] }))
          .catch(() => ({ activities: [] as Activity[] })),
      ),
    );
    const byId = new Map<string, Activity>();
    for (const l of lists) for (const a of l.activities) byId.set(a.id, a);
    setTimeline([...byId.values()].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 30));
  }, [opp.id, opp.lead_id]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      actions.notify(ok);
      actions.reload();
      void loadTimeline();
      return true;
    } catch {
      actions.notify('No se pudo guardar.', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const changeStage = (stage: string, extra: Record<string, unknown> = {}) =>
    run(`stage-${stage}`, () => sendJson(`/api/crm/opportunities/${opp.id}/stage`, 'POST', { stage, ...extra }), `Etapa: ${STAGE_LABEL[stage]}.`);

  const patch = (key: string, body: Record<string, unknown>, ok: string) => run(key, () => sendJson(`/api/crm/opportunities/${opp.id}`, 'PATCH', body), ok);

  const prob = opportunityProbability(opp.stage as never, opp.probability ?? null);
  const stageIdx = (OPEN_STAGES as readonly string[]).indexOf(opp.stage);
  const nd = daysFromToday(opp.next_action_at);
  const stepOverdue = Boolean(opp.next_action) && nd !== null && nd < 0;
  const openTasks = useMemo(
    () => data.tasks.filter((t) => t.opportunity_id === opp.id && t.status !== 'DONE' && t.status !== 'CANCELLED'),
    [data.tasks, opp.id],
  );

  const need: Array<[string, string | null | undefined]> = [
    ['Producto', opp.product_interest],
    ['Capacidad', opp.capacity],
    ['Material', opp.material],
    ['Impresión', opp.printing],
    ['Volumen', opp.estimated_volume ? fmtVolume(opp.estimated_volume, opp.volume_period) : null],
    ['Destino', [opp.destination_city, opp.destination_country].filter(Boolean).join(', ') || null],
  ];
  const needFilled = need.filter(([, v]) => v);

  return (
    <Drawer onClose={onClose}>
      {/* Encabezado: quién, cuánto, en qué etapa */}
      <header className="border-b border-slate-800 px-6 pb-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">
              Oportunidad
              {company && (
                <>
                  {' · '}
                  <button onClick={() => actions.openAccount(company.id)} className="text-slate-300 hover:text-white hover:underline">
                    {company.name}
                  </button>
                </>
              )}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-white">{opp.title}</h2>
            <p className="mt-1 text-sm text-slate-400">
              <span className="text-lg font-semibold tabular-nums text-slate-100">{opp.estimated_value ? fmtMoney(opp.estimated_value, currency) : 'Sin valor'}</span>
              <span className="ml-2 text-slate-500">· {prob}% probabilidad</span>
              {contact && <span className="text-slate-500"> · {contact.full_name}</span>}
            </p>
          </div>
          <DrawerClose onClose={onClose} />
        </div>

        {closed ? (
          <div className={`mt-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${opp.stage === 'GANADO' ? 'border-emerald-900/70 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/40'}`}>
            <span className={`text-sm font-medium ${opp.stage === 'GANADO' ? 'text-emerald-400' : 'text-slate-300'}`}>
              {opp.stage === 'GANADO' ? 'Ganada' : 'Perdida'} · {timeAgo(opp.updated_at)}
            </span>
            <Button variant="ghost" size="sm" isLoading={busy === 'stage-NEGOCIACIÓN'} onClick={() => void changeStage('NEGOCIACIÓN')}>
              Reabrir
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-5 gap-1">
              {OPEN_STAGES.map((s, i) => (
                <button
                  key={s}
                  onClick={() => void changeStage(s)}
                  disabled={busy !== null || s === opp.stage}
                  title={`Mover a ${STAGE_LABEL[s]}`}
                  className="group text-left"
                >
                  <span className={`block h-1.5 rounded-full transition ${i <= stageIdx ? 'bg-brand-500' : 'bg-slate-800 group-hover:bg-slate-700'}`} />
                  <span className={`mt-1.5 block truncate text-[11px] ${i === stageIdx ? 'font-semibold text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>{STAGE_LABEL[s]}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" isLoading={busy === 'stage-GANADO'} onClick={() => void changeStage('GANADO')}>
                <Trophy className="h-3.5 w-3.5 text-emerald-400" /> Marcar ganada
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setLosing((v) => !v)}>
                <XCircle className="h-3.5 w-3.5" /> Marcar perdida
              </Button>
            </div>
            {losing && (
              <div className="mt-3 flex gap-2">
                <input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="¿Por qué se perdió? (precio, plazo, competencia…)" className={inputCls} />
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={busy === 'stage-PERDIDO'}
                  onClick={() => void changeStage('PERDIDO', { lost_reason: lostReason.trim() || null })}
                >
                  Confirmar
                </Button>
              </div>
            )}
          </>
        )}
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {/* Próximo paso: lo único que hace avanzar una oportunidad */}
        {!closed && (
          <section className={`rounded-xl border p-4 ${stepOverdue ? 'border-red-900/70 bg-red-500/5' : !opp.next_action ? 'border-amber-900/60 bg-amber-500/5' : 'border-slate-800 bg-[#141820]'}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">Próximo paso</h3>
              {stepOverdue && <Pill tone="danger">Atrasado {Math.abs(nd!)} d</Pill>}
              {!opp.next_action && <Pill tone="warning">Sin definir</Pill>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Enviar cotización, llamar al comprador…" className={`${inputCls} min-w-[200px] flex-1`} />
              <input type="date" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className={`${inputCls} w-40`} />
              <Button
                variant="primary"
                size="md"
                isLoading={busy === 'next'}
                disabled={nextAction.trim() === (opp.next_action ?? '') && nextAt === (opp.next_action_at?.slice(0, 10) ?? '')}
                onClick={() =>
                  void patch('next', { next_action: nextAction.trim() || null, next_action_at: nextAt ? new Date(`${nextAt}T12:00:00`).toISOString() : null }, 'Próximo paso guardado.')
                }
              >
                Guardar
              </Button>
            </div>
          </section>
        )}

        {openTasks.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-100">Tareas abiertas</h3>
            <ul className="space-y-1.5">
              {openTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-[#141820] px-3 py-2">
                  <button
                    title="Marcar como hecha"
                    onClick={() => void run(`task-${t.id}`, () => sendJson(`/api/crm/tasks/${t.id}`, 'PATCH', { status: 'DONE' }), 'Tarea completada.')}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-slate-600 text-transparent hover:border-emerald-500 hover:text-emerald-400"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{t.title}</span>
                  <span className={`text-xs ${(daysFromToday(t.due_at) ?? 0) < 0 ? 'text-red-400' : 'text-slate-500'}`}>{fmtDateLabel(t.due_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Datos comerciales */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">Datos</h3>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-xs font-medium text-slate-400 hover:text-white">
                Editar
              </button>
            )}
          </div>
          {editing ? (
            <div className="space-y-3 rounded-xl border border-slate-800 bg-[#141820] p-4">
              <Field label="Título">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Valor (${currency})`}>
                  <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} inputMode="decimal" className={`${inputCls} tabular-nums`} />
                </Field>
                <Field label="Probabilidad % (vacío = según etapa)">
                  <input value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} inputMode="numeric" className={`${inputCls} tabular-nums`} />
                </Field>
                <Field label="Responsable">
                  <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className={inputCls}>
                    <option value="">Sin asignar</option>
                    {data.owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                  </select>
                </Field>
                <Field label="Cierre previsto">
                  <input type="date" value={form.close} onChange={(e) => setForm({ ...form, close: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={busy === 'form'}
                  onClick={async () => {
                    const ok = await patch(
                      'form',
                      {
                        title: form.title.trim() || opp.title,
                        estimated_value: form.value.trim() === '' ? null : Number(form.value),
                        probability: form.probability.trim() === '' ? null : Math.min(100, Math.max(0, Number(form.probability))),
                        owner_profile_id: form.owner || null,
                        expected_close_at: form.close || null,
                      },
                      'Cambios guardados.',
                    );
                    if (ok) setEditing(false);
                  }}
                >
                  Guardar
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Fact k="Responsable">
                <span className="inline-flex items-center gap-2">
                  <Avatar name={ownerName(data.owners, opp.owner_profile_id)} size="sm" />
                  {ownerName(data.owners, opp.owner_profile_id)}
                </span>
              </Fact>
              <Fact k="Cierre previsto">{opp.expected_close_at ? fmtDateLabel(opp.expected_close_at) : '—'}</Fact>
              <Fact k="Calificación">{opp.qualification ? label(QUALIFICATION_LABEL, opp.qualification) : '—'}</Fact>
              {needFilled.map(([k, v]) => (
                <Fact key={k} k={k}>{v}</Fact>
              ))}
            </dl>
          )}
          {!editing && needFilled.length === 0 && <p className="mt-3 text-xs text-slate-600">Sin detalle de producto. Se completa solo cuando el lead viene de NIUPACKBOT.</p>}
        </section>

        {/* Actividad */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-100">Actividad</h3>
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && note.trim()) document.getElementById(`note-${opp.id}`)?.click();
              }}
              placeholder="Registrar una nota, llamada o acuerdo…"
              className={inputCls}
            />
            <Button
              id={`note-${opp.id}`}
              variant="secondary"
              size="md"
              disabled={!note.trim()}
              isLoading={busy === 'note'}
              onClick={async () => {
                const ok = await run(
                  'note',
                  () => sendJson('/api/crm/activities', 'POST', { opportunity_id: opp.id, lead_id: opp.lead_id ?? null, company_id: opp.company_id ?? null, type: 'NOTE', title: 'Nota', body: note.trim() }),
                  'Nota registrada.',
                );
                if (ok) setNote('');
              }}
            >
              Agregar
            </Button>
          </div>
          <Timeline items={timeline} />
        </section>
      </div>
    </Drawer>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="mt-0.5 truncate text-sm text-slate-100">{children}</dd>
    </div>
  );
}

export function Timeline({ items }: { items: Activity[] | null }) {
  if (items === null) return <p className="mt-4 text-xs text-slate-600">Cargando…</p>;
  if (items.length === 0) return <p className="mt-4 text-xs text-slate-600">Todavía no hay actividad registrada.</p>;
  return (
    <ol className="relative mt-5 space-y-4 border-l border-slate-800 pl-5">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ${a.type === 'NOTE' ? 'bg-brand-500' : a.type === 'WON' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-300">{label(ACTIVITY_LABEL, a.type)}</span> · {timeAgo(a.occurred_at)}
          </p>
          {(a.body || (a.title && a.title !== 'Nota')) && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-200">{a.body || a.title}</p>}
        </li>
      ))}
    </ol>
  );
}
