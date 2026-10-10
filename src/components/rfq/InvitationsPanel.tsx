'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api, DISPATCH_LABEL, errorText, type RfqDetail } from './types';

const BADGE = { PENDING: 'neutral', PREPARED: 'brand', SENDING: 'warning', SENT: 'success', FAILED: 'danger', REPLIED: 'success', DECLINED: 'neutral', REVOKED: 'neutral' } as const;

export function InvitationsPanel({ detail, onChange, onNotice }: { detail: RfqDetail; onChange: () => Promise<void>; onNotice: (n: { kind: 'ok' | 'error'; text: string }) => void }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [ttl, setTtl] = useState('14');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toSend, setToSend] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<string | null>(null);

  const dispatchBySupplier = useMemo(() => new Map(detail.dispatches.map((d) => [d.supplier_id, d])), [detail.dispatches]);
  const supplierName = (id: string) => detail.suppliers.find((s) => s.id === id)?.name ?? 'Proveedor';
  const available = detail.suppliers.filter((s) => {
    const d = dispatchBySupplier.get(s.id);
    return !d || ['PENDING', 'PREPARED', 'FAILED', 'REVOKED'].includes(d.status);
  });
  const chosen = available.filter((s) => selected[s.id]);
  const sendable = detail.dispatches.filter((d) => ['PREPARED', 'FAILED'].includes(d.status));
  const sendChosen = sendable.filter((d) => toSend[d.id]);

  const prepare = async () => {
    setBusy(true);
    const result = await api<{ invitations: Array<{ skipped: boolean }> }>(`/api/rfq/rfqs/${detail.rfq.id}/dispatch`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'prepare', ttl_days: Number(ttl) || 14, invitations: chosen.map((s) => ({ supplier_id: s.id, recipient_email: (emails[s.id] || s.email || '').trim() || undefined })) }),
    });
    setBusy(false);
    if (!result.ok) { onNotice({ kind: 'error', text: `No se prepararon las invitaciones: ${errorText(result)}` }); return; }
    onNotice({ kind: 'ok', text: `${result.data.invitations.filter((i) => !i.skipped).length} invitación(es) preparadas. Todavía no se envió ningún correo.` });
    setSelected({});
    await onChange();
  };

  const send = async () => {
    setBusy(true);
    const result = await api<{ sent: number; failed: number; outcomes: Array<{ status: string; error?: string }> }>(`/api/rfq/rfqs/${detail.rfq.id}/dispatch`, {
      method: 'POST', body: JSON.stringify({ mode: 'send', confirm: true, dispatch_ids: sendChosen.map((d) => d.id) }),
    });
    setBusy(false);
    setConfirmOpen(false);
    if (!result.ok && result.status !== 207) { onNotice({ kind: 'error', text: `No se envió ningún correo: ${errorText(result)}` }); await onChange(); return; }
    const failedMsg = result.data.outcomes.find((o) => o.status === 'FAILED')?.error;
    onNotice({ kind: result.data.failed ? 'error' : 'ok', text: `Enviados: ${result.data.sent}. Fallidos: ${result.data.failed}.${failedMsg ? ` Motivo: ${failedMsg}.` : ''}` });
    setToSend({});
    await onChange();
  };

  const revoke = async (id: string) => {
    const result = await api(`/api/rfq/dispatches/${id}/revoke`, { method: 'POST' });
    onNotice(result.ok ? { kind: 'ok', text: 'Enlace revocado.' } : { kind: 'error', text: errorText(result) });
    await onChange();
  };

  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-800 bg-[#141820] p-4 space-y-3" aria-label="Seleccionar proveedores">
        <h3 className="text-sm font-semibold text-white">1. Elegir proveedores del maestro</h3>
        {available.length === 0 && <p className="text-xs text-slate-400">No hay proveedores disponibles para invitar. Cargalos en el Maestro de proveedores.</p>}
        <ul className="divide-y divide-slate-800">
          {available.map((s) => (
            <li key={s.id} className="py-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-white min-w-56">
                <input type="checkbox" checked={Boolean(selected[s.id])} onChange={(e) => setSelected({ ...selected, [s.id]: e.target.checked })} aria-label={`Invitar a ${s.name}`} />
                <span>{s.name}<span className="ml-2 text-slate-500">{s.country_code}</span></span>
              </label>
              <input value={emails[s.id] ?? s.email ?? ''} onChange={(e) => setEmails({ ...emails, [s.id]: e.target.value })} placeholder="correo del proveedor"
                aria-label={`Correo de ${s.name}`} className="flex-1 min-w-52 rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white" />
              {dispatchBySupplier.get(s.id) && <Badge size="sm" variant={BADGE[dispatchBySupplier.get(s.id)!.status]}>{DISPATCH_LABEL[dispatchBySupplier.get(s.id)!.status]}</Badge>}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-slate-400">Vigencia del enlace (días)
            <input value={ttl} onChange={(e) => setTtl(e.target.value)} inputMode="numeric" className="ml-2 w-16 rounded border border-slate-700 bg-[#0c0f14] px-2 py-1 text-xs text-white" />
          </label>
          <Button size="sm" disabled={busy || chosen.length === 0} onClick={prepare}>Preparar invitaciones ({chosen.length})</Button>
        </div>
        <p className="text-[11px] text-slate-500">Preparar crea el enlace personal de cada proveedor y el correo para revisar. No envía nada.</p>
      </section>

      <section className="rounded border border-slate-800 bg-[#141820] p-4 space-y-3" aria-label="Invitaciones">
        <h3 className="text-sm font-semibold text-white">2. Revisar y enviar</h3>
        {detail.dispatches.length === 0 && <p className="text-xs text-slate-400">Todavía no hay invitaciones.</p>}
        <ul className="divide-y divide-slate-800">
          {detail.dispatches.map((d) => (
            <li key={d.id} className="py-3 space-y-1.5" data-testid="dispatch-row">
              <div className="flex flex-wrap items-center gap-3">
                {['PREPARED', 'FAILED'].includes(d.status) && (
                  <input type="checkbox" checked={Boolean(toSend[d.id])} onChange={(e) => setToSend({ ...toSend, [d.id]: e.target.checked })} aria-label={`Enviar a ${supplierName(d.supplier_id)}`} />
                )}
                <span className="text-xs text-white min-w-48">{supplierName(d.supplier_id)}</span>
                <span className="text-[11px] text-slate-400">{d.recipient_email}</span>
                <Badge size="sm" variant={BADGE[d.status]}>{DISPATCH_LABEL[d.status]}</Badge>
                {d.send_attempts > 0 && <span className="text-[11px] text-slate-500">{d.send_attempts} intento(s)</span>}
                <button className="text-[11px] text-brand-400 hover:underline" onClick={() => setPreview(preview === d.id ? null : d.id)}>{preview === d.id ? 'Ocultar correo' : 'Ver correo'}</button>
                {['SENT', 'REPLIED', 'PREPARED'].includes(d.status) && !d.token_revoked_at && <button className="text-[11px] text-slate-400 hover:text-white" onClick={() => revoke(d.id)}>Revocar enlace</button>}
              </div>
              {d.last_error && <p className="text-[11px] text-amber-300 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />No se envió: {d.last_error === 'SMTP_NOT_CONFIGURED' ? 'el correo saliente (SMTP) no está configurado' : d.last_error}</p>}
              <p className="text-[11px] text-slate-500">
                {d.sent_at ? `Enviado ${new Date(d.sent_at).toLocaleString('es-PY')}` : 'No enviado'}
                {d.token_expires_at ? ` · enlace vence ${new Date(d.token_expires_at).toLocaleDateString('es-PY')}` : ''}
                {d.access_count > 0 ? ` · el proveedor abrió el enlace ${d.access_count} vez/veces` : ''}
                {d.token_revoked_at ? ' · enlace revocado' : ''}
              </p>
              {preview === d.id && <pre className="whitespace-pre-wrap rounded bg-[#0c0f14] border border-slate-800 p-3 text-[11px] text-slate-300">{d.subject}{'\n\n'}{d.body_text}</pre>}
            </li>
          ))}
        </ul>
        <Button size="sm" disabled={busy || sendChosen.length === 0} onClick={() => setConfirmOpen(true)}><Mail className="h-3.5 w-3.5" />Confirmar y enviar ({sendChosen.length})</Button>
      </section>

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirmar envío" description="Se enviará un correo real a cada destinatario. Revisá la lista antes de confirmar."
        footer={<><Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>Cancelar</Button><Button size="sm" isLoading={busy} onClick={send}>Enviar ahora</Button></>}>
        <ul className="space-y-1 text-xs text-slate-300">
          {sendChosen.map((d) => <li key={d.id}>{supplierName(d.supplier_id)} → <span className="text-white">{d.recipient_email}</span></li>)}
        </ul>
      </Modal>
    </div>
  );
}
