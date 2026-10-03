'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar, fmtDateLabel, fmtMoney, isOverdue, ownerName, type OwnerRef } from './commercial-ui';
import { opportunityProbability } from '@/lib/crm/types';

export interface Opp360 {
  id: string;
  title: string;
  stage: string;
  product_interest?: string | null;
  capacity?: string | null;
  material?: string | null;
  printing?: string | null;
  estimated_volume?: number | null;
  volume_period?: string | null;
  estimated_value?: number | null;
  currency?: string | null;
  destination_city?: string | null;
  destination_country?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  lead_id?: string | null;
  owner_profile_id?: string | null;
  next_action?: string | null;
  next_action_at?: string | null;
  expected_close_at?: string | null;
  probability?: number | null;
  qualification?: string | null;
  intent?: string | null;
  updated_at?: string;
}

const STAGES = ['NUEVO', 'CONTACTADO', 'CALIFICADO', 'COTIZACIÓN', 'NEGOCIACIÓN', 'GANADO', 'PERDIDO'];

export function Opportunity360({
  opp,
  companyName,
  contactName,
  owners,
  onClose,
  onChanged,
}: {
  opp: Opp360;
  companyName?: string | null;
  contactName?: string | null;
  owners: OwnerRef[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [title, setTitle] = useState(opp.title);
  const [value, setValue] = useState(opp.estimated_value != null ? String(opp.estimated_value) : '');
  const [stage, setStage] = useState(opp.stage);
  const [owner, setOwner] = useState(opp.owner_profile_id ?? '');
  const [nextAction, setNextAction] = useState(opp.next_action ?? '');
  const [nextAt, setNextAt] = useState(opp.next_action_at ? opp.next_action_at.slice(0, 16) : '');
  const [expectedClose, setExpectedClose] = useState(opp.expected_close_at ? opp.expected_close_at.slice(0, 10) : '');
  const [probability, setProbability] = useState(opp.probability != null ? String(opp.probability) : '');
  const [note, setNote] = useState('');
  const [timeline, setTimeline] = useState<Array<{ id: string; type: string; title?: string | null; occurred_at: string }>>([]);

  useEffect(() => {
    if (!opp.lead_id) return;
    fetch(`/api/crm/leads/${opp.lead_id}/360`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b?.activities) setTimeline(b.activities.slice(0, 12));
      })
      .catch(() => undefined);
  }, [opp.lead_id]);

  async function patch(body: Record<string, unknown>, okMsg: string) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${opp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('SAVE_FAILED');
      setMsg(okMsg);
      onChanged();
    } catch {
      setMsg('No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStage(to: string) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/crm/opportunities/${opp.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: to }),
      });
      if (!res.ok) throw new Error('STAGE_FAILED');
      setStage(to);
      setMsg(`Etapa: ${to}`);
      onChanged();
    } catch {
      setMsg('No se pudo cambiar la etapa.');
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_id: opp.id, lead_id: opp.lead_id ?? null, type: 'NOTE', title: 'Nota', body: note.trim() }),
      });
      if (!res.ok) throw new Error('NOTE_FAILED');
      setNote('');
      setMsg('Nota agregada.');
      onChanged();
    } catch {
      setMsg('No se pudo agregar la nota.');
    } finally {
      setSaving(false);
    }
  }

  const prob = opp.probability ?? opportunityProbability(opp.stage as never, null);
  const currency = opp.currency ?? 'USD';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-slate-700 bg-[#141820]">
        <div className="border-b border-slate-800 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-wide text-brand-400">{opp.stage}</p>
              <h2 className="mt-1 truncate text-base font-bold text-white">{companyName || opp.title}</h2>
              <p className="mt-1 text-xs text-slate-400">
                {contactName || 'Sin contacto'} · <span className="tabular-nums">{fmtMoney(opp.estimated_value, currency)}</span>
              </p>
            </div>
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div className="rounded border border-slate-800 bg-[#0c0f14] p-2">
              <p className="text-[10px] uppercase text-slate-600">Responsable</p>
              <p className="mt-1 flex items-center gap-1.5 text-slate-200">
                <Avatar name={ownerName(owners, opp.owner_profile_id)} size="sm" />
                <span className="truncate">{ownerName(owners, opp.owner_profile_id)}</span>
              </p>
            </div>
            <div className="rounded border border-slate-800 bg-[#0c0f14] p-2">
              <p className="text-[10px] uppercase text-slate-600">Cierre previsto</p>
              <p className="mt-1 text-slate-200">{fmtDateLabel(opp.expected_close_at)}</p>
            </div>
            <div className="rounded border border-slate-800 bg-[#0c0f14] p-2">
              <p className="text-[10px] uppercase text-slate-600">Probabilidad</p>
              <p className="mt-1 tabular-nums text-slate-200">{prob}%</p>
            </div>
            <div className={`rounded border p-2 ${isOverdue(opp.next_action_at) ? 'border-amber-600/60 bg-amber-950/20' : 'border-slate-800 bg-[#0c0f14]'}`}>
              <p className="text-[10px] uppercase text-slate-600">Próxima acción</p>
              <p className="mt-1 truncate text-slate-200">{opp.next_action || '—'} · {fmtDateLabel(opp.next_action_at)}</p>
            </div>
          </div>
          {msg && <p className="mt-2 text-[11px] text-amber-400">{msg}</p>}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
          <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
            <h3 className="text-xs font-semibold text-white">Necesidad</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-slate-300">
              <p>Producto: <span className="text-slate-100">{opp.product_interest || '—'}</span></p>
              <p>Capacidad: <span className="text-slate-100">{opp.capacity || '—'}</span></p>
              <p>Material: <span className="text-slate-100">{opp.material || '—'}</span></p>
              <p>Impresión: <span className="text-slate-100">{opp.printing || '—'}</span></p>
              <p>Volumen: <span className="tabular-nums text-slate-100">{opp.estimated_volume ? Number(opp.estimated_volume).toLocaleString('es-PY') : '—'} {opp.volume_period ? `/ ${opp.volume_period}` : ''}</span></p>
              <p>Destino: <span className="text-slate-100">{opp.destination_city || '—'}</span></p>
            </div>
            {(opp.intent || opp.qualification) && (
              <div className="mt-2 flex gap-2">
                {opp.intent && <Badge variant="neutral" size="sm">{opp.intent}</Badge>}
                {opp.qualification && <Badge variant={opp.qualification === 'HIGH' ? 'success' : opp.qualification === 'MEDIUM' ? 'warning' : 'neutral'} size="sm">{opp.qualification}</Badge>}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
            <h3 className="text-xs font-semibold text-white">Editar</h3>
            <div className="mt-2 space-y-2">
              <label className="block">
                <span className="text-[11px] text-slate-500">Título</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-[#141820] px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-slate-500">Valor (USD)</span>
                  <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" className="mt-1 w-full rounded border border-slate-700 bg-[#141820] px-2.5 py-1.5 text-xs tabular-nums text-white focus:border-brand-500 focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500">Probabilidad %</span>
                  <input value={probability} onChange={(e) => setProbability(e.target.value)} inputMode="numeric" placeholder="—" className="mt-1 w-full rounded border border-slate-700 bg-[#141820] px-2.5 py-1.5 text-xs tabular-nums text-white focus:border-brand-500 focus:outline-none" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-slate-500">Responsable</span>
                  <select value={owner} onChange={(e) => setOwner(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-[#141820] px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none">
                    <option value="">Sin asignar</option>
                    {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500">Cierre previsto</span>
                  <input type="date" value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-[#141820] px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-slate-500">Próxima acción</span>
                  <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Llamar comprador" className="mt-1 w-full rounded border border-slate-700 bg-[#141820] px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-slate-500">Fecha</span>
                  <input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-[#141820] px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={saving}
                  onClick={() => void patch({
                    title: title.trim() || opp.title,
                    estimated_value: value.trim() === '' ? null : Number(value),
                    probability: probability.trim() === '' ? null : Math.min(100, Math.max(0, Number(probability))),
                    owner_profile_id: owner || null,
                    next_action: nextAction.trim() || null,
                    next_action_at: nextAt || null,
                    expected_close_at: expectedClose || null,
                  }, 'Cambios guardados.')}
                >
                  Guardar
                </Button>
                <select
                  value={stage}
                  disabled={saving}
                  onChange={(e) => void changeStage(e.target.value)}
                  className="rounded border border-slate-700 bg-[#141820] px-2.5 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
                >
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <Button variant="outline" size="sm" disabled={saving} onClick={() => void changeStage('GANADO')}>Ganado</Button>
                <Button variant="outline" size="sm" disabled={saving} onClick={() => void changeStage('PERDIDO')}>Perdido</Button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-[#0c0f14] p-3">
            <h3 className="text-xs font-semibold text-white">Notas</h3>
            <div className="mt-2 flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Agregar nota…" className="flex-1 rounded border border-slate-700 bg-[#141820] px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
              <Button variant="outline" size="sm" disabled={saving || !note.trim()} onClick={() => void addNote()}>Agregar</Button>
            </div>
            <ul className="mt-2 space-y-1.5">
              {timeline.length === 0 && <li className="text-[11px] text-slate-600">Sin actividad registrada.</li>}
              {timeline.map((a) => (
                <li key={a.id} className="text-[11px] text-slate-400">
                  <span className="font-mono text-[10px] text-slate-500">{a.type}</span> · {a.title || ''}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
