'use client';

import React, { useState } from 'react';
import type { ComparativeLine, DocumentFact, RfqItem } from '@/lib/print-rfq/domain';
import { FIELD_LABEL, buttonClass, inputClass, postJson } from './format';

const FIELDS = ['unit_price', 'currency', 'tax_rate', 'available_quantity', 'lead_time_days', 'freight', 'payment_terms', 'valid_until'] as const;
const TEXT_FIELDS = ['currency', 'payment_terms', 'valid_until'];

/**
 * Reconciliación humana: se abre el presupuesto original, se transcribe lo que dice y se compara con lo cargado.
 * Nunca corrige precios por su cuenta; deja registrada la revisión con la resolución escrita.
 */
export function ReviewPanel({ rfqId, items, offers, onDone }: { rfqId: string; items: RfqItem[]; offers: ComparativeLine[]; onDone: () => void }) {
  const first = offers[0];
  const [facts, setFacts] = useState<DocumentFact[]>([]);
  const [resolution, setResolution] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const setFact = (itemId: string, field: (typeof FIELDS)[number], raw: string) => setFacts((previous) => {
    const old = previous.find((f) => f.rfq_item_id === itemId) ?? { rfq_item_id: itemId };
    const value = raw === '' ? undefined : TEXT_FIELDS.includes(field) ? (field === 'currency' ? raw.toUpperCase() : raw) : Number(raw);
    return [...previous.filter((f) => f.rfq_item_id !== itemId), { ...old, [field]: value }];
  });

  async function submit() {
    setPending(true); setMessage(null);
    try {
      const result = await postJson<{ discrepancies: Array<{ field: string }> }>(`/api/print-rfq/rfqs/${rfqId}/review`, { version_id: first.quote_version_id, facts, resolution });
      setMessage({ ok: true, text: result.discrepancies.length ? `Revisión registrada con ${result.discrepancies.length} diferencia(s) o campo(s) sin verificar.` : 'Revisión registrada: todo coincide.' });
      onDone();
    } catch (e) { setMessage({ ok: false, text: (e as Error).message }); }
    setPending(false);
  }

  return (
    <details className="rounded border border-slate-800 bg-[#141820] p-3">
      <summary className="cursor-pointer text-xs text-slate-200">
        Revisión de {first.provider_name} v{first.version_number} — {first.review_id ? <span className="text-emerald-400">revisada</span> : <span className="text-amber-400">pendiente</span>}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-[11px] text-slate-400">Abrí el presupuesto original y transcribí lo que dice. Los campos vacíos quedan como “sin evidencia”. No se modifica la oferta: solo se registra la comparación y tu resolución.</p>
        {first.budget_file_id && <a href={`/api/print-rfq/files/${first.budget_file_id}`} target="_blank" rel="noreferrer" className="text-xs text-brand-400 hover:underline">Abrir presupuesto original</a>}
        {offers.map((o) => (
          <div key={o.id} className="space-y-2 rounded border border-slate-800 p-2">
            <p className="text-xs text-slate-200">{items.find((i) => i.id === o.rfq_item_id)?.description}</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {FIELDS.map((field) => (
                <label key={field} className="text-[11px] text-slate-400">{FIELD_LABEL[field]} (documento)
                  <input aria-label={`${FIELD_LABEL[field]} documento ${o.id}`} className={inputClass} type={TEXT_FIELDS.includes(field) ? 'text' : 'number'} step="any"
                    onChange={(e) => setFact(o.rfq_item_id, field, e.target.value)} />
                </label>
              ))}
            </div>
            {o.review_discrepancies && o.review_discrepancies.length > 0 && (
              <ul className="text-[11px] text-amber-400">{o.review_discrepancies.map((d, i) => <li key={i}>{FIELD_LABEL[d.field] ?? d.field}: {d.reason}</li>)}</ul>
            )}
          </div>
        ))}
        {first.review_resolution && <p className="text-[11px] text-slate-300">Última resolución: {first.review_resolution}</p>}
        <label className="block text-[11px] text-slate-400">Resolución de las diferencias y de lo que no se pudo verificar (mínimo 10 caracteres)
          <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={2} className={inputClass} />
        </label>
        <button disabled={pending || resolution.trim().length < 10} onClick={() => void submit()} className={buttonClass}>Registrar revisión humana</button>
        {message && <p role={message.ok ? 'status' : 'alert'} className={`text-xs ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>}
      </div>
    </details>
  );
}
