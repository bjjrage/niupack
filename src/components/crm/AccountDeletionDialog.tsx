'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { AccountDeletionInspection, AccountDeletionPreview, BlockedAccount, BulkAccountDeletionResult } from '@/lib/crm/account-deletion';

const dependencyLabels: Record<string, string> = {
  purchases: 'Compras', opportunities: 'Oportunidades', conversations: 'Conversaciones',
  leads: 'Leads', tasks: 'Tareas', activities: 'Actividades', aliases: 'Aliases',
  staged_rows: 'Filas de importación', campaign_recipients: 'Destinatarios de campañas',
  shared_contacts: 'Contactos compartidos', other: 'Otras relaciones',
};

function DependencyList({ account }: { account: BlockedAccount }) {
  return (
    <li className="rounded-lg border border-amber-900/50 p-3">
      <p className="font-medium text-slate-100">{account.name}</p>
      <p className="mt-1 text-xs text-amber-300">
        {Object.entries(account.dependencies).filter(([, n]) => n > 0)
          .map(([key, n]) => `${dependencyLabels[key] ?? key}: ${n}`).join(' · ')}
      </p>
    </li>
  );
}

export function AccountDeletionDialog({ ids, name, onClose, onDeleted }: {
  ids: string[];
  name?: string;
  onClose: () => void;
  onDeleted: (result: BulkAccountDeletionResult) => void;
}) {
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null);
  const [result, setResult] = useState<BulkAccountDeletionResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/crm/accounts/bulk-delete/preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ company_ids: ids }), signal: abort.signal,
        });
        if (!response.ok) throw new Error('PREVIEW_FAILED');
        setPreview(await response.json());
      } catch {
        if (!abort.signal.aborted) setError('No se pudo verificar la seguridad de estas cuentas. Cerrá e intentá nuevamente.');
      }
    })();
    return () => abort.abort();
  }, [ids]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, []);

  async function confirmDeletion() {
    if (!preview?.deletable_ids.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const single = Boolean(name) && ids.length === 1;
      const response = await fetch(single ? `/api/crm/accounts/${ids[0]}` : '/api/crm/accounts/bulk-delete', {
        method: single ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' },
        ...(single ? {} : { body: JSON.stringify({ company_ids: preview.deletable_ids }) }),
      });
      let deletion: BulkAccountDeletionResult;
      if (single) {
        const account = await response.json() as AccountDeletionInspection & { error?: string };
        if (!response.ok && response.status !== 409 && response.status !== 404) throw new Error('DELETE_FAILED');
        deletion = {
          requested: 1, deleted: account.deleted ? 1 : 0, blocked: response.status === 409 ? 1 : 0,
          not_found: response.status === 404 ? 1 : 0, deleted_contacts: account.deleted_contacts ?? 0,
          deleted_ids: account.deleted ? [ids[0]] : [], not_found_ids: response.status === 404 ? [ids[0]] : [],
          blocked_accounts: response.status === 409 ? [{ id: ids[0], name: account.name, reason: 'ACCOUNT_HAS_BUSINESS_DATA', dependencies: account.dependencies, references: account.references }] : [],
          failed_accounts: [],
        };
      } else {
        if (!response.ok) throw new Error('DELETE_FAILED');
        deletion = await response.json();
      }
      setResult(deletion);
      onDeleted(deletion);
    } catch {
      setError('No se pudo completar la eliminación. Actualizá la lista y verificá nuevamente antes de reintentar.');
    } finally { busyRef.current = false; setBusy(false); }
  }

  const blocked = [...new Map([...(preview?.blocked_accounts ?? []), ...(result?.blocked_accounts ?? [])].map((a) => [a.id, a])).values()];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="account-delete-title" tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-slate-700 bg-[#141820] text-sm text-slate-300 shadow-2xl focus:outline-none">
        <div className="border-b border-slate-800 p-5">
          <h2 id="account-delete-title" className="text-lg font-semibold text-white">{name ? 'Eliminar cuenta' : 'Eliminar cuentas seleccionadas'}</h2>
          {name && <p className="mt-2 font-medium text-white">{name}</p>}
          <p className="mt-2 text-xs">Se verificará que no tenga historial comercial que deba preservarse.</p>
        </div>
        <div className="space-y-4 overflow-y-auto p-5" aria-live="polite">
          {error && <p role="alert" className="text-red-300">{error}</p>}
          {!preview && !error && <p>Verificando dependencias…</p>}
          {preview && !result && <>
            <p>{preview.requested} seleccionadas · <strong className="text-white">{preview.deletable} eliminables</strong> · {preview.blocked} bloqueadas</p>
            <p>Contactos que se eliminarán: <strong className="text-white">{preview.contacts_to_delete}</strong></p>
            {preview.not_found > 0 && <p>{preview.not_found} cuentas ya no existen o no están disponibles.</p>}
            {preview.deletable > 0 && <p className="text-xs">La eliminación es permanente. Se volverá a verificar la seguridad al confirmar.</p>}
          </>}
          {result && <>
            <p className="font-medium text-white">{result.deleted} cuentas eliminadas · {result.deleted_contacts} contactos eliminados</p>
            {result.not_found > 0 && <p>{result.not_found} cuentas ya no estaban disponibles.</p>}
            {result.failed_accounts.length > 0 && <p role="alert" className="text-red-300">No se pudieron eliminar {result.failed_accounts.length} cuentas. Su cleanup se revirtió; permanecen intactas.</p>}
          </>}
          {blocked.length > 0 && <>
            <p className="text-amber-300">{name ? 'No se puede eliminar esta cuenta porque contiene historial comercial o relaciones que deben preservarse.' : `Las ${blocked.length} bloqueadas permanecerán intactas.`}</p>
            <ul className="space-y-2">{blocked.map((account) => <DependencyList key={account.id} account={account} />)}</ul>
          </>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
          <Button variant="secondary" disabled={busy} onClick={onClose}>{result ? 'Cerrar' : 'Cancelar'}</Button>
          {!result && <Button variant="danger" disabled={!preview?.deletable || Boolean(error)} isLoading={busy} onClick={() => void confirmDeletion()}>
            {name ? 'Eliminar' : `Eliminar ${preview?.deletable ?? 0} cuentas`}
          </Button>}
        </div>
      </div>
    </div>
  );
}
