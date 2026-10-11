'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import type { ComparativeLine, RfqAllocation, RfqItem } from '@/lib/print-rfq/domain';
import { AllocationPanel } from './AllocationPanel';
import { QuoteForm } from './QuoteForm';
import { ReviewPanel } from './ReviewPanel';
import { FIELD_LABEL, INVITATION_STATUS, PURPOSE_LABEL, STATUS, api, buttonClass, formatDate, formatDateTime, ghostButtonClass, inputClass, money, postJson } from './format';

type Row = Record<string, any>;
interface Workspace {
  rfq: Row; items: RfqItem[]; offers: ComparativeLine[]; history: Row[]; reviews: Row[];
  invitations: Array<Row & { link_open: boolean; budgets: Row[] }>; allocations: RfqAllocation[]; events: Row[]; orders: Row[]; viewer_role: string;
}
interface Provider { id: string; name: string; phone: string | null; processes: string[] }

const EVENT_LABEL: Record<string, string> = {
  'rfq.created': 'Solicitud creada', 'rfq.art.registered': 'Arte registrado', 'rfq.invited': 'Imprentas invitadas', 'rfq.budget.uploaded': 'Presupuesto recibido',
  'rfq.quote.version_submitted': 'Versión de presupuesto', 'rfq.quote.reviewed': 'Revisión humana', 'rfq.allocation.saved': 'Asignación guardada',
  'rfq.allocation.authorized': 'Asignación autorizada', 'rfq.orders.previewed': 'Preview de órdenes', 'rfq.orders.confirmed': 'Órdenes emitidas',
  'rfq.link.revoked': 'Enlace revocado', 'rfq.link.renewed': 'Enlace renovado', 'rfq.cancel': 'Solicitud cancelada', 'rfq.reopen': 'Solicitud reabierta', 'rfq.close_discovery': 'Descubrimiento cerrado',
};

export function RfqWorkspace({ id }: { id: string }) {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setWs(await api<Workspace>(`/api/print-rfq/rfqs/${id}`)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(task: () => Promise<unknown>, success: string) {
    setBusy(true); setNotice(null);
    try { await task(); setNotice({ ok: true, text: success }); await load(); }
    catch (e) { setNotice({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }

  if (error) return <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">No se pudo cargar la solicitud: {error}</p>;
  if (!ws) return <p className="text-xs text-slate-400">Cargando…</p>;

  const { rfq, items, offers, invitations } = ws;
  const status = STATUS[rfq.status] ?? STATUS.BORRADOR;
  const open = ['BORRADOR', 'COTIZANDO', 'OFERTAS_RECIBIDAS'].includes(rfq.status) && Date.parse(rfq.expires_at) > Date.now();
  const missingArt = items.filter((i) => i.art_files.length === 0);
  const versions = [...new Set(offers.map((o) => o.quote_version_id))];
  const isAdmin = ws.viewer_role === 'admin';
  const canWrite = ws.viewer_role === 'admin' || ws.viewer_role === 'analyst';

  const confirmAction = (action: 'CANCEL' | 'REOPEN' | 'CLOSE_DISCOVERY', question: string, success: string) => {
    if (!window.confirm(question)) return;
    void act(() => postJson(`/api/print-rfq/rfqs/${id}/transition`, { action, confirm: true, days: 14 }), success);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-slate-800 pb-4">
        <Link href="/imprentas" className="text-[11px] text-slate-400 hover:text-white">← Solicitudes</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-white">{rfq.code} · {rfq.title}</h1>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="text-[11px] text-slate-400">{PURPOSE_LABEL[rfq.purpose]} · vence {formatDateTime(rfq.expires_at)}{rfq.required_date ? ` · necesitamos para ${formatDate(rfq.required_date)}` : ''}</p>
        {rfq.specifications && <p className="text-xs text-slate-300">{rfq.specifications}</p>}
        {canWrite && (
          <div className="flex flex-wrap gap-2 pt-1">
            {open && <button disabled={busy} className={ghostButtonClass} onClick={() => confirmAction('CANCEL', '¿Cancelar la solicitud? Los enlaces de las imprentas dejan de funcionar.', 'Solicitud cancelada')}>Cancelar solicitud</button>}
            {!['AUTORIZADO', 'CERRADO'].includes(rfq.status) && !open && <button disabled={busy} className={ghostButtonClass} onClick={() => confirmAction('REOPEN', '¿Reabrir la solicitud por 14 días más?', 'Solicitud reabierta')}>Reabrir 14 días</button>}
            {rfq.purpose === 'COST_DISCOVERY' && !rfq.closed_at && rfq.status !== 'AUTORIZADO' && <button disabled={busy} className={ghostButtonClass} onClick={() => confirmAction('CLOSE_DISCOVERY', '¿Cerrar el descubrimiento de costos sin comprar?', 'Descubrimiento cerrado')}>Cerrar sin comprar</button>}
          </div>
        )}
        {notice && <p role={notice.ok ? 'status' : 'alert'} className={`text-xs ${notice.ok ? 'text-emerald-400' : 'text-red-400'}`}>{notice.text}</p>}
      </header>

      <ItemsSection id={id} items={items} open={open} canWrite={canWrite} onChange={load} />

      <InvitationsSection id={id} ws={ws} open={open} canWrite={canWrite} missingArt={missingArt.length} act={act} busy={busy} onChange={load} />

      {offers.length > 0 && (
        <section className="space-y-3" aria-label="Comparativo">
          <h2 className="text-sm font-semibold text-white">Comparativo de presupuestos</h2>
          <p className="text-[11px] text-slate-400">No se comparan monedas distintas sin tipo de cambio. Cada presupuesto conserva su documento original.</p>
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-[11px] text-slate-300">
              <thead className="bg-[#141820] text-left text-slate-500">
                <tr>{['Producto', 'Imprenta / versión', 'Precio', 'Impuesto', 'Flete', 'Plazo', 'Disponible', 'Pago y vigencia', 'Documento y revisión'].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {offers.map((o) => {
                  const item = items.find((i) => i.id === o.rfq_item_id);
                  return (
                    <tr key={o.id} className="border-t border-slate-800 align-top">
                      <td className="p-2">{item?.sku}<br /><span className="text-slate-500">{item?.description}</span></td>
                      <td className="p-2">{o.provider_name} v{o.version_number}{o.revoked && <><br /><Badge size="sm" variant="danger">Enlace revocado</Badge></>}</td>
                      <td className="p-2">{o.unit_price == null ? 'No cotizó' : money(o.unit_price, o.currency)}</td>
                      <td className="p-2">{o.tax_rate}% {o.vat_included ? 'incluido' : 'adicional'}</td>
                      <td className="p-2">{money(o.freight, o.currency)}</td>
                      <td className="p-2">{o.lead_time_days} d</td>
                      <td className="p-2">{o.available_quantity.toLocaleString('es-PY')}</td>
                      <td className="p-2">{o.payment_terms}<br /><span className="text-slate-500">hasta {formatDate(o.valid_until)}</span></td>
                      <td className="p-2">
                        {o.budget_file_id && <a href={`/api/print-rfq/files/${o.budget_file_id}`} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">Presupuesto original</a>}
                        <br />{o.review_id ? <span className="text-emerald-400">Revisión humana registrada</span> : <span className="text-amber-400">Pendiente de revisión</span>}
                        {o.art_stale && <><br /><Badge size="sm" variant="warning">Cotizó un arte anterior</Badge></>}
                        {o.review_discrepancies?.map((d, index) => <p key={index} className="text-slate-500">{FIELD_LABEL[d.field] ?? d.field}: {d.reason}</p>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canWrite && versions.map((versionId) => (
            <ReviewPanel key={versionId} rfqId={id} items={items} offers={offers.filter((o) => o.quote_version_id === versionId)} onDone={load} />
          ))}
        </section>
      )}

      {rfq.purpose === 'COST_DISCOVERY' && offers.length > 0 && (
        <p className="rounded border border-slate-800 bg-[#141820] p-3 text-xs text-slate-300">Esta solicitud es para descubrir costos: la comparación y la revisión cierran el circuito, sin asignación ni órdenes de compra.</p>
      )}
      {rfq.purpose === 'PROCUREMENT' && offers.length > 0 && canWrite && (
        <AllocationPanel rfqId={id} items={items} offers={offers} allocations={ws.allocations} isAdmin={isAdmin} onChange={load} />
      )}

      {ws.orders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">Órdenes de compra emitidas</h2>
          <ul className="space-y-1">{ws.orders.map((o) => (
            <li key={o.id}><Link href={`/imprentas/ordenes/${o.id}`} className="text-xs text-brand-400 hover:underline">{o.code}</Link> <span className="text-xs text-slate-400">· {o.provider_name} · {money(Number(o.total), o.currency)}</span></li>
          ))}</ul>
        </section>
      )}

      <details className="rounded border border-slate-800 bg-[#141820] p-3">
        <summary className="cursor-pointer text-xs text-slate-300">Historial de versiones ({ws.history.length}) y actividad ({ws.events.length})</summary>
        <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
          {ws.history.map((v) => <li key={v.id}>Versión {v.version_number} · {v.budget_number} · {money(Number(v.total_price), v.currency)} · {formatDateTime(v.submitted_at)}</li>)}
        </ul>
        <ul className="mt-3 space-y-1 border-t border-slate-800 pt-2 text-[11px] text-slate-500">
          {ws.events.map((e) => <li key={e.id}>{formatDateTime(e.created_at)} · {EVENT_LABEL[e.event] ?? e.event}{e.actor_type === 'provider' ? ' (imprenta)' : ''}</li>)}
        </ul>
      </details>
    </div>
  );
}

function ItemsSection({ id, items, open, canWrite, onChange }: { id: string; items: RfqItem[]; open: boolean; canWrite: boolean; onChange: () => Promise<void> }) {
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(itemId: string, file: File | undefined) {
    if (!file) return;
    setBusyItem(itemId); setError(null);
    const form = new FormData();
    form.set('item_id', itemId); form.set('file', file);
    try { await api(`/api/print-rfq/rfqs/${id}/art`, { method: 'POST', body: form }); await onChange(); }
    catch (e) { setError((e as Error).message); }
    setBusyItem(null);
  }

  return (
    <section className="space-y-3" aria-label="Productos y arte">
      <h2 className="text-sm font-semibold text-white">Productos a imprimir y arte</h2>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="space-y-1 rounded border border-slate-800 bg-[#141820] p-3" data-testid="workspace-item">
            <p className="text-sm text-white">{item.description}</p>
            <p className="text-[11px] text-slate-400">SKU {item.sku} · {item.quantity.toLocaleString('es-PY')} {item.unit}{Object.keys(item.print_spec).length ? ` · ${Object.values(item.print_spec).join(' · ')}` : ''}</p>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              {item.art_files.length === 0 ? <Badge size="sm" variant="warning">Sin arte registrado</Badge> : item.art_files.map((f, index) => (
                <a key={f.id} href={`/api/print-rfq/files/${f.id}`} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline" title={`SHA-256 ${f.sha256}`}>
                  {index === 0 ? 'Arte vigente' : `Arte anterior ${item.art_files.length - index}`}: {f.file_name} ({formatDate(f.created_at)})
                </a>
              ))}
              {open && canWrite && (
                <label className={`${ghostButtonClass} cursor-pointer`}>
                  {busyItem === item.id ? 'Subiendo…' : item.art_files.length ? 'Subir arte nuevo' : 'Subir arte'}
                  <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.svg,.ai,.eps,.tif,.tiff,.zip" disabled={busyItem === item.id} onChange={(e) => { void upload(item.id, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              )}
            </div>
            {item.art_files.length > 1 && <p className="text-[11px] text-amber-400">Si subís un arte nuevo, los presupuestos que cotizaron el anterior quedan desactualizados y hay que pedirlos de nuevo.</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function InvitationsSection({ id, ws, open, canWrite, missingArt, act, busy, onChange }: {
  id: string; ws: Workspace; open: boolean; canWrite: boolean; missingArt: number; busy: boolean; onChange: () => Promise<void>;
  act: (task: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const invitedIds = new Set(ws.invitations.map((i) => i.provider_id));
  const available = providers.filter((p) => !invitedIds.has(p.id));

  useEffect(() => { api<{ providers: Provider[] }>('/api/print-rfq/providers').then((r) => setProviders(r.providers)).catch(() => setProviders([])); }, []);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const linkOf = (token: string) => `${origin}/cotizar-imprenta/${token}`;
  const copy = async (token: string) => { await navigator.clipboard.writeText(linkOf(token)); setCopied(token); setTimeout(() => setCopied(null), 2000); };
  const whatsapp = (name: string, phone: string | null, token: string) =>
    `https://wa.me/${(phone ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${name}, te pedimos presupuesto de impresión (${ws.rfq.code}). Ahí vas a ver el arte y podés cargar tus precios y subir tu presupuesto: ${linkOf(token)}`)}`;

  return (
    <section className="space-y-3" aria-label="Imprentas invitadas">
      <h2 className="text-sm font-semibold text-white">Imprentas invitadas</h2>
      {open && canWrite && (
        <div className="space-y-2 rounded border border-slate-800 bg-[#141820] p-3">
          {missingArt > 0 && <p className="text-xs text-amber-400">Falta el arte de {missingArt} producto(s). Subilo antes de invitar: la imprenta cotiza sobre ese arte.</p>}
          {available.length === 0 ? <p className="text-xs text-slate-400">No quedan imprentas para invitar. <Link href="/imprentas/proveedores" className="text-brand-400 hover:underline">Cargar imprentas</Link></p> : (
            <>
              <div className="flex flex-wrap gap-3">
                {available.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-xs text-slate-300">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                    {p.name}{p.processes.length ? <span className="text-slate-500"> ({p.processes.join(', ')})</span> : null}
                  </label>
                ))}
              </div>
              <button disabled={busy || selected.size === 0 || missingArt > 0} className={buttonClass}
                onClick={() => void act(async () => { await postJson(`/api/print-rfq/rfqs/${id}/invite`, { provider_ids: [...selected] }); setSelected(new Set()); }, 'Enlaces generados. Compartilos con cada imprenta; no se envió nada automáticamente.')}>
                Generar enlace para {selected.size || ''} imprenta(s)
              </button>
            </>
          )}
        </div>
      )}
      {ws.invitations.length === 0 && <p className="text-xs text-slate-400">Todavía no invitaste a ninguna imprenta.</p>}
      <ul className="space-y-2">
        {ws.invitations.map((inv) => (
          <li key={inv.id} className="space-y-2 rounded border border-slate-800 bg-[#141820] p-3" data-testid="invitation">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-white">{inv.print_providers?.name} <span className="text-[11px] text-slate-400">· {INVITATION_STATUS[inv.status]}{inv.responded_at ? ` ${formatDate(inv.responded_at)}` : ''}</span></p>
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  {inv.link_open && (
                    <>
                      <button className={ghostButtonClass} onClick={() => void copy(inv.token)}>{copied === inv.token ? '¡Copiado!' : 'Copiar enlace'}</button>
                      <a className={ghostButtonClass} target="_blank" rel="noopener noreferrer" href={whatsapp(inv.print_providers?.name ?? '', inv.print_providers?.phone ?? null, inv.token)}>WhatsApp</a>
                    </>
                  )}
                  {inv.link_open && <button disabled={busy} className={ghostButtonClass} onClick={() => window.confirm('¿Revocar el enlace? La imprenta ya no podrá cotizar.') && void act(() => postJson(`/api/print-rfq/rfqs/${id}/invitations/${inv.id}`, { action: 'REVOKE' }), 'Enlace revocado')}>Revocar</button>}
                  {open && <button disabled={busy} className={ghostButtonClass} onClick={() => window.confirm('¿Generar un enlace nuevo? El anterior deja de funcionar.') && void act(() => postJson(`/api/print-rfq/rfqs/${id}/invitations/${inv.id}`, { action: 'RENEW' }), 'Enlace nuevo generado')}>Renovar enlace</button>}
                </div>
              )}
            </div>
            {inv.link_open ? <p className="break-all text-[11px] text-slate-500">{linkOf(inv.token)}</p> : <p className="text-[11px] text-amber-400">Enlace vencido o revocado</p>}
            {open && canWrite && inv.link_open && (
              <details>
                <summary className="cursor-pointer text-[11px] text-slate-300">Cargar un presupuesto que la imprenta envió por otro canal</summary>
                <div className="mt-3">
                  <QuoteForm items={ws.items.map((i) => ({ id: i.id, sku: i.sku, description: i.description, quantity: i.quantity, unit: i.unit, print_spec: i.print_spec as Record<string, string> }))}
                    artHref={(fileId) => `/api/print-rfq/files/${fileId}`} submitLabel="Registrar presupuesto"
                    onSubmit={async (form) => { form.set('invitation_id', inv.id); await api(`/api/print-rfq/rfqs/${id}/budget`, { method: 'POST', body: form }); await onChange(); }} />
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
