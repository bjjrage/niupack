'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import type { RfqDetail } from './types';

const EVENT_LABEL: Record<string, string> = {
  RFQ_CREATED: 'RFQ creada', INVITATION_PREPARED: 'Invitación preparada', INVITATION_SENT: 'Invitación enviada', INVITATION_FAILED: 'Envío fallido', LINK_REVOKED: 'Enlace revocado',
  QUOTE_SUBMITTED_VIA_LINK: 'Oferta recibida por enlace', QUOTE_REGISTERED: 'Oferta registrada', QUOTE_VALIDATED: 'Oferta validada', DOCUMENT_STORED: 'Documento guardado', DECISION_RECORDED: 'Decisión registrada',
};
const DECISION_LABEL = { SELECTED: 'Seleccionada', SHORTLISTED: 'Preseleccionada', REJECTED: 'Descartada', DEFERRED: 'Pospuesta' } as const;

export function HistoryPanel({ detail }: { detail: RfqDetail }) {
  const supplier = (id: string | null) => detail.suppliers.find((s) => s.id === id)?.name;
  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-800 bg-[#141820] p-4" aria-label="Decisiones">
        <h3 className="text-sm font-semibold text-white mb-2">Decisiones (historial completo)</h3>
        {detail.decisions.length === 0 ? <p className="text-xs text-slate-400">Todavía no hay decisiones.</p> : (
          <ul className="divide-y divide-slate-800">
            {detail.decisions.map((d) => {
              const item = detail.items.find((i) => i.id === d.rfq_item_id);
              return (
                <li key={d.id} className="py-2 text-xs" data-testid="decision-row">
                  <Badge size="sm" variant={d.decision === 'SELECTED' ? 'success' : 'neutral'}>{DECISION_LABEL[d.decision]}</Badge>{' '}
                  <span className="text-white">{supplier(d.supplier_id)}</span>{item ? ` · ítem ${item.line_no} (${item.sku})` : ''}
                  <span className="text-slate-500"> · {new Date(d.decided_at).toLocaleString('es-PY')}</span>
                  <p className="text-slate-400">{d.rationale}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="rounded border border-slate-800 bg-[#141820] p-4" aria-label="Actividad">
        <h3 className="text-sm font-semibold text-white mb-2">Actividad</h3>
        <ul className="space-y-1.5">
          {detail.events.map((e) => (
            <li key={e.id} className="text-[11px] text-slate-400"><span className="text-slate-500">{new Date(e.created_at).toLocaleString('es-PY')}</span> · <span className="text-slate-200">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>{supplier(e.supplier_id) ? ` · ${supplier(e.supplier_id)}` : ''}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
