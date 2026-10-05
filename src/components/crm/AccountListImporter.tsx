'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

type Stage = 'CUSTOMER' | 'PROSPECT';

type PreviewRow = {
  index: number;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  country_code: string | null;
  city: string | null;
  tax_id: string | null;
  website: string | null;
  errors: string[];
};

type ImportResult = {
  created: number;
  updated: number;
  keptCustomers: number;
  contactsCreated: number;
  contactsUpdated: number;
  errors: Array<{ index: number; error: string }>;
};

export function AccountListImporter({
  open,
  lifecycleStage,
  onClose,
  onImported,
}: {
  open: boolean;
  lifecycleStage: Stage;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ columns: string[]; mapping: Record<string, string | null>; rows: PreviewRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCustomers = lifecycleStage === 'CUSTOMER';
  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];

  async function makePreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/crm/accounts/import/preview', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PREVIEW_FAILED');
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview || validRows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/crm/accounts/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lifecycleStage, rows: validRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'IMPORT_FAILED');
      setResult(data);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar.');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    onClose();
  }

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title={isCustomers ? 'Importar clientes actuales' : 'Importar clientes potenciales'}
      description={
        isCustomers
          ? 'Empresas que hoy ya son clientes de NIUPACK.'
          : 'Empresas nuevas que queremos prospectar. Cargar historial de compras no las convierte en clientes actuales.'
      }
      maxWidth="2xl"
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-[#0c0f14] px-4 py-5 hover:border-slate-600">
          <Upload className="h-5 w-5 text-brand-400" />
          <span className="min-w-0 flex-1 text-sm text-slate-300">{file ? file.name : 'Elegir archivo .xlsx, .xls o .csv'}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
              setError(null);
            }}
          />
        </label>

        <p className="text-xs text-slate-500">
          Columnas reconocidas: Empresa/Cliente, Contacto, Teléfono/WhatsApp, Email, País, Ciudad, RUC y Web. Solo Empresa es obligatoria.
        </p>

        {!preview && (
          <div className="flex justify-end">
            <Button variant="primary" size="md" disabled={!file || busy} isLoading={busy} onClick={() => void makePreview()}>
              Revisar archivo
            </Button>
          </div>
        )}

        {preview && (
          <>
            <div className="rounded-lg border border-slate-800 bg-[#0c0f14] px-4 py-3 text-sm text-slate-300">
              {preview.rows.length} filas · <strong className="text-white">{validRows.length}</strong> válidas
              {preview.rows.length !== validRows.length && (
                <span className="text-amber-400"> · {preview.rows.length - validRows.length} con errores</span>
              )}
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="sticky top-0 bg-[#141820] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Empresa</th>
                    <th className="px-3 py-2">Contacto</th>
                    <th className="px-3 py-2">Teléfono</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {preview.rows.slice(0, 100).map((r) => (
                    <tr key={r.index}>
                      <td className="px-3 py-2 text-slate-200">{r.company_name || '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{r.contact_name || '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{r.phone || '—'}</td>
                      <td className="px-3 py-2 text-slate-400">{r.email || '—'}</td>
                      <td className={`px-3 py-2 ${r.errors.length ? 'text-red-400' : 'text-emerald-400'}`}>
                        {r.errors.length ? r.errors.join(', ') : 'Lista'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!result ? (
              <div className="flex justify-between gap-3">
                <Button variant="ghost" size="md" onClick={() => setPreview(null)}>
                  Cambiar archivo
                </Button>
                <Button variant="primary" size="md" disabled={validRows.length === 0 || busy} isLoading={busy} onClick={() => void commit()}>
                  Importar {validRows.length}
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-900/60 bg-emerald-500/5 px-4 py-3 text-sm text-slate-200">
                Creadas: <strong>{result.created}</strong> · Actualizadas: <strong>{result.updated}</strong> · Contactos nuevos:{' '}
                <strong>{result.contactsCreated}</strong>
                {result.keptCustomers > 0 && (
                  <span> · {result.keptCustomers} ya eran clientes actuales y no fueron bajados a potenciales</span>
                )}
                {result.errors.length > 0 && <span className="text-amber-400"> · {result.errors.length} errores</span>}
              </div>
            )}
          </>
        )}

        {error && <p className="rounded-lg border border-red-900/60 bg-red-500/5 px-3 py-2 text-sm text-red-300">{error}</p>}
        {result && (
          <div className="flex justify-end">
            <Button variant="primary" size="md" onClick={close}>
              Cerrar
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
