'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api, errorText, type Comparison, type DecisionRow, type Offer, type RfqDetail } from './types';

const DECISION_LABEL = { SELECTED: 'Seleccionada', SHORTLISTED: 'Preseleccionada', REJECTED: 'Descartada', DEFERRED: 'Pospuesta' } as const;
const ACTION_LABEL = { SELECTED: 'Seleccionar', SHORTLISTED: 'Preseleccionar', DEFERRED: 'Posponer', REJECTED: 'Descartar' } as const;
const CONFIDENCE_VARIANT = { ALTA: 'success', MEDIA: 'warning', BAJA: 'neutral' } as const;
const usd = (v: number | null) => (v === null ? '—' : `USD ${v.toLocaleString('es-PY', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`);

export function ComparisonPanel({ detail, onChange, onNotice }: { detail: RfqDetail; onChange: () => Promise<void>; onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void }) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<{ offer: Offer; itemId: string; decision: keyof typeof DECISION_LABEL } | null>(null);
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<Comparison>(`/api/rfq/rfqs/${detail.rfq.id}/comparison`);
    if (!result.ok) setError(errorText(result));
    else { setError(null); setComparison(result.data); }
  }, [detail.rfq.id]);

  useEffect(() => { void load(); }, [load, detail.quotes.length, detail.decisions.length]);

  const decide = async () => {
    if (!target) return;
    setBusy(true);
    const result = await api(`/api/rfq/rfqs/${detail.rfq.id}/decisions`, { method: 'POST', body: JSON.stringify({ quote_id: target.offer.quote_id, rfq_item_id: target.itemId, decision: target.decision, rationale }) });
    setBusy(false);
    if (!result.ok) { onNotice({ kind: 'error', text: `No se registró la decisión: ${errorText(result)}` }); return; }
    onNotice({ kind: 'ok', text: 'Decisión registrada en el historial. No se emitió ninguna orden de compra ni se modificó ningún precio.' });
    setTarget(null); setRationale('');
    await onChange();
  };

  const decisionsFor = (itemId: string, supplierId: string): DecisionRow[] => detail.decisions.filter((d) => d.rfq_item_id === itemId && d.supplier_id === supplierId);

  if (error) return <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">No se pudo calcular la comparación: {error}</p>;
  if (!comparison) return <p className="text-xs text-slate-400">Calculando comparación…</p>;

  return (
    <div className="space-y-6">
      <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Info className="h-3 w-3" />Comparación en base {comparison.basis_incoterm}, normalizada a USD con el tipo de cambio de NIUPACK o el validado en cada oferta. El motor propone; la decisión es tuya.</p>

      {comparison.items.map((item) => (
        <section key={item.rfq_item_id} className="rounded border border-slate-800 bg-[#141820] p-4 space-y-3" aria-label={`Comparación ítem ${item.line_no}`} data-testid="comparison-item">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Ítem {item.line_no}: {item.sku} · {item.quantity.toLocaleString('es-PY')} u</h3>
            {item.cost_sheet.available
              ? <Badge size="sm" variant="brand">Hoja de costos v{item.cost_sheet.version}</Badge>
              : <Badge size="sm" variant="warning">Sin hoja de costos vigente</Badge>}
          </div>

          {item.proposal ? (
            <div className="rounded border border-slate-700 bg-[#0c0f14] p-3 text-xs space-y-1" data-testid="proposal">
              <p className="text-white">Propuesta del motor: <strong>{item.proposal.supplier_name}</strong> <Badge size="sm" variant={CONFIDENCE_VARIANT[item.proposal.confidence]}>Confianza {item.proposal.confidence.toLowerCase()}</Badge></p>
              <ul className="list-disc pl-4 text-slate-400">{item.proposal.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <p className="text-[11px] text-slate-500">{item.proposal.note}</p>
            </div>
          ) : <p className="text-xs text-amber-300 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Ninguna oferta es comparable todavía.</p>}

          {item.offers.length === 0 ? <p className="text-xs text-slate-400">Sin ofertas para este ítem.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-slate-400"><tr className="border-b border-slate-800">
                  <th className="py-1.5 pr-3">#</th><th className="pr-3">Proveedor</th><th className="pr-3">Oferta</th><th className="pr-3">USD normalizado</th><th className="pr-3">USD comparable</th>
                  <th className="pr-3">MOQ</th><th className="pr-3">Plazo</th><th className="pr-3">Brecha vs. costo NIUPACK</th><th className="pr-3">Decisión</th><th>Acciones</th></tr></thead>
                <tbody>
                  {item.offers.map((o) => (
                    <React.Fragment key={o.quote_id}>
                      <tr className="border-b border-slate-800/60 align-top" data-testid="offer-row">
                        <td className="py-2 pr-3 text-slate-400">{o.rank ?? '—'}</td>
                        <td className="pr-3 text-white">{o.supplier_name}<span className="block text-[11px] text-slate-500">v{o.version} · {o.incoterm}</span></td>
                        <td className="pr-3">{o.unit_price_original} {o.currency}{o.applied_scale_min_qty ? <span className="block text-[11px] text-slate-500">escala desde {o.applied_scale_min_qty.toLocaleString('es-PY')}</span> : null}</td>
                        <td className="pr-3">{usd(o.normalized_unit_price_usd)}{o.fx && o.currency !== 'USD' ? <span className="block text-[11px] text-slate-500">FX {o.fx.rate_to_usd.toFixed(6)} · {o.fx.source}</span> : null}</td>
                        <td className="pr-3">{o.comparable ? usd(o.comparable_unit_price_usd) : <Badge size="sm" variant="danger">NO COMPARABLE</Badge>}</td>
                        <td className="pr-3">{o.moq?.toLocaleString('es-PY') ?? '—'}</td>
                        <td className="pr-3">{o.lead_time_days ? `${o.lead_time_days} d` : '—'}</td>
                        <td className="pr-3">{o.benchmark ? <>{o.benchmark.gap_usd >= 0 ? '+' : ''}{usd(o.benchmark.gap_usd)}<span className="block text-[11px] text-slate-500">{o.benchmark.gap_percent >= 0 ? '+' : ''}{o.benchmark.gap_percent}% · {o.benchmark.strategy === 'OFERTA_BAJO_COSTO_NIUPACK' ? 'bajo el costo propio' : o.benchmark.strategy === 'OFERTA_SOBRE_COSTO_NIUPACK' ? 'sobre el costo propio' : 'equivalente'}</span></> : '—'}</td>
                        <td className="pr-3">{decisionsFor(item.rfq_item_id, o.supplier_id).slice(0, 1).map((d) => <Badge key={d.id} size="sm" variant={d.decision === 'SELECTED' ? 'success' : 'neutral'}>{DECISION_LABEL[d.decision]}</Badge>)}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(['SELECTED', 'SHORTLISTED', 'DEFERRED', 'REJECTED'] as const).map((d) => (
                              <Button key={d} size="sm" variant={d === 'SELECTED' ? 'secondary' : 'ghost'} disabled={!o.comparable && d === 'SELECTED'} onClick={() => setTarget({ offer: o, itemId: item.rfq_item_id, decision: d })}>{ACTION_LABEL[d]}</Button>
                            ))}
                          </div>
                        </td>
                      </tr>
                      {o.flags.length > 0 && (
                        <tr><td></td><td colSpan={9} className="pb-2"><ul className="flex flex-wrap gap-1.5">{o.flags.map((f) => <li key={f.code}><Badge size="sm" variant={f.severity === 'blocker' ? 'danger' : f.severity === 'warning' ? 'warning' : 'neutral'}>{f.text}</Badge></li>)}</ul></td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {comparison.missing_suppliers.length > 0 && (
        <p className="text-xs text-slate-400">Sin respuesta: {comparison.missing_suppliers.map((s) => s.supplier_name).join(', ')}.</p>
      )}

      <Modal isOpen={Boolean(target)} onClose={() => { setTarget(null); setRationale(''); }} title={target ? `${DECISION_LABEL[target.decision]}: ${target.offer.supplier_name}` : ''}
        description="Se guarda con tu usuario, la fecha y una foto de este comparador. No emite órdenes de compra ni cambia precios oficiales."
        footer={<><Button variant="outline" size="sm" onClick={() => { setTarget(null); setRationale(''); }}>Cancelar</Button><Button size="sm" isLoading={busy} disabled={rationale.trim().length < 3} onClick={decide}>Registrar decisión</Button></>}>
        <label className="block text-[11px] text-slate-400 mb-1" htmlFor="rationale">Motivo de la decisión *</label>
        <textarea id="rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} className="w-full rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white" />
        {target && target.offer.flags.some((f) => f.severity !== 'info') && (
          <ul className="mt-3 list-disc pl-4 text-[11px] text-amber-300">{target.offer.flags.filter((f) => f.severity !== 'info').map((f) => <li key={f.code}>{f.text}</li>)}</ul>
        )}
      </Modal>
    </div>
  );
}
