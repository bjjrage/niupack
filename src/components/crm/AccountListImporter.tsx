'use client';

import { useState } from 'react';
import { Upload, SlidersHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CANONICAL_FIELDS, type CanonicalField, type ColumnMapping } from '@/lib/crm/account-import-schema';

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

interface AccountPreviewData {
  sheet_name: string;
  sheet_names: string[];
  header_row_index: number;
  columns: string[];
  mapping: ColumnMapping;
  confidence: Partial<Record<CanonicalField, number | null>> | null;
  llm_inferred: boolean;
  rows: PreviewRow[];
  total_rows: number;
  valid_rows_count: number;
  error_rows_count: number;
}

const FIELD_LABELS: Record<CanonicalField, { label: string; required?: boolean }> = {
  company_name: { label: 'Empresa / Razón Social', required: true },
  contact_name: { label: 'Contacto / Responsable' },
  phone: { label: 'Teléfono / Celular / WhatsApp' },
  email: { label: 'Correo Electrónico' },
  country_code: { label: 'País' },
  city: { label: 'Ciudad' },
  tax_id: { label: 'RUC / Tax ID / CUIT' },
  website: { label: 'Sitio Web' },
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
  const [preview, setPreview] = useState<AccountPreviewData | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [selectedHeaderRow, setSelectedHeaderRow] = useState<number>(0);
  const [currentMapping, setCurrentMapping] = useState<ColumnMapping>({
    company_name: null,
    contact_name: null,
    phone: null,
    email: null,
    country_code: null,
    city: null,
    tax_id: null,
    website: null,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMappingEditor, setShowMappingEditor] = useState(true);

  const isCustomers = lifecycleStage === 'CUSTOMER';
  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];

  async function makeInitialPreview() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/crm/accounts/import/preview', { method: 'POST', body: form });
      const data: AccountPreviewData = await res.json();
      if (!res.ok) {
        throw new Error((data as unknown as { error?: string }).error || 'No se pudo leer el archivo.');
      }
      setPreview(data);
      setSelectedSheet(data.sheet_name);
      setSelectedHeaderRow(data.header_row_index);
      setCurrentMapping(data.mapping);
      setShowMappingEditor(!data.llm_inferred || data.mapping.company_name === null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar el archivo.');
    } finally {
      setBusy(false);
    }
  }

  async function reprocessWithOverrides(overrides: {
    sheetName?: string;
    headerRowIndex?: number;
    mapping?: ColumnMapping;
  }) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const targetSheet = overrides.sheetName ?? selectedSheet;
      const targetHeaderRow = overrides.headerRowIndex ?? selectedHeaderRow;
      const targetMapping = overrides.mapping ?? currentMapping;

      form.append('sheet_name', targetSheet);
      form.append('header_row_index', String(targetHeaderRow));
      form.append('mapping', JSON.stringify(targetMapping));

      const res = await fetch('/api/crm/accounts/import/preview', { method: 'POST', body: form });
      const data: AccountPreviewData = await res.json();
      if (!res.ok) {
        throw new Error((data as unknown as { error?: string }).error || 'Error al actualizar preview.');
      }
      setPreview(data);
      setSelectedSheet(data.sheet_name);
      setSelectedHeaderRow(data.header_row_index);
      setCurrentMapping(data.mapping);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la vista previa.');
    } finally {
      setBusy(false);
    }
  }

  function handleFieldMappingChange(field: CanonicalField, value: string) {
    const colIdx = value === '' ? null : parseInt(value, 10);
    const updated = { ...currentMapping, [field]: isNaN(Number(colIdx)) ? null : colIdx };
    setCurrentMapping(updated);
    void reprocessWithOverrides({ mapping: updated });
  }

  function handleSheetChange(newSheet: string) {
    setSelectedSheet(newSheet);
    setSelectedHeaderRow(0);
    const resetMapping: ColumnMapping = {
      company_name: null,
      contact_name: null,
      phone: null,
      email: null,
      country_code: null,
      city: null,
      tax_id: null,
      website: null,
    };
    setCurrentMapping(resetMapping);
    void reprocessWithOverrides({ sheetName: newSheet, headerRowIndex: 0, mapping: resetMapping });
  }

  function handleHeaderRowChange(newIndex: number) {
    setSelectedHeaderRow(newIndex);
    void reprocessWithOverrides({ headerRowIndex: newIndex });
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
        {!preview && (
          <>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-[#0c0f14] px-4 py-5 hover:border-slate-600">
              <Upload className="h-5 w-5 text-brand-400" />
              <span className="min-w-0 flex-1 text-sm text-slate-300">
                {file ? file.name : 'Elegir archivo .xlsx, .xls o .csv'}
              </span>
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
              El asistente interpretará automáticamente la hoja y las columnas. Solo Empresa es obligatoria para crear la cuenta.
            </p>

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                disabled={!file || busy}
                isLoading={busy}
                onClick={() => void makeInitialPreview()}
              >
                Revisar archivo
              </Button>
            </div>
          </>
        )}

        {preview && (
          <>
            {/* Banner de estado de interpretación */}
            {preview.llm_inferred && currentMapping.company_name !== null ? (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-900/60 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold text-emerald-100">Interpretamos tu archivo así:</span> Hoja{' '}
                  <strong className="text-white">{selectedSheet}</strong> · Fila de encabezados{' '}
                  <strong className="text-white">{selectedHeaderRow + 1}</strong>. Podés ajustar las columnas abajo si es necesario.
                </div>
                <button
                  type="button"
                  onClick={() => setShowMappingEditor(!showMappingEditor)}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  {showMappingEditor ? 'Ocultar mapeo' : 'Editar mapeo'}
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-amber-900/60 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold text-amber-100">
                    No pudimos interpretar automáticamente las columnas.
                  </span>{' '}
                  Seleccioná cómo corresponde cada una a continuación.
                </div>
              </div>
            )}

            {/* Controles Multi-sheet y Encabezado */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-800 bg-[#0c0f14] px-4 py-2 text-xs">
              {preview.sheet_names.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Hoja:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    {preview.sheet_names.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-slate-400">Fila encabezados:</span>
                <select
                  value={selectedHeaderRow}
                  onChange={(e) => handleHeaderRowChange(Number(e.target.value))}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 focus:outline-none focus:border-brand-500"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((rowIdx) => (
                    <option key={rowIdx} value={rowIdx}>
                      Fila {rowIdx + 1}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ml-auto text-slate-400">
                {preview.rows.length} filas · <strong className="text-white">{validRows.length}</strong> válidas
                {preview.rows.length !== validRows.length && (
                  <span className="text-amber-400"> · {preview.rows.length - validRows.length} con errores</span>
                )}
              </div>
            </div>

            {/* Editor de mapeo manual */}
            {showMappingEditor && (
              <div className="rounded-xl border border-slate-800 bg-[#12161f] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Mapeo de columnas a campos
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {currentMapping.company_name === null && (
                      <span className="text-amber-400 font-medium">Empresa es requerida</span>
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
                  {CANONICAL_FIELDS.map((field) => {
                    const info = FIELD_LABELS[field];
                    const val = currentMapping[field];
                    return (
                      <div key={field} className="space-y-1">
                        <label className="block text-[11px] text-slate-300">
                          {info.label} {info.required && <span className="text-red-400">*</span>}
                        </label>
                        <select
                          value={val !== null && val !== undefined ? String(val) : ''}
                          onChange={(e) => handleFieldMappingChange(field, e.target.value)}
                          className={`w-full rounded border px-2 py-1 text-xs focus:outline-none ${
                            info.required && val === null
                              ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                              : 'border-slate-700 bg-slate-900 text-slate-200 focus:border-brand-500'
                          }`}
                        >
                          <option value="">(Sin columna)</option>
                          {preview.columns.map((colName, idx) => (
                            <option key={idx} value={String(idx)}>
                              Col {idx + 1}: {colName}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vista previa de las filas procesadas */}
            <div className="max-h-60 overflow-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="sticky top-0 bg-[#141820] text-slate-400">
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

            {/* Acciones finales */}
            {!result ? (
              <div className="flex justify-between gap-3">
                <Button variant="ghost" size="md" onClick={() => setPreview(null)}>
                  Cambiar archivo
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={validRows.length === 0 || currentMapping.company_name === null || busy}
                  isLoading={busy}
                  onClick={() => void commit()}
                >
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

        {error && (
          <p className="rounded-lg border border-red-900/60 bg-red-500/5 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

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
