'use client';

import { useState } from 'react';
import { Upload, CheckCircle2, AlertTriangle, Filter, Layers, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  PURCHASE_CANONICAL_FIELDS,
  type PurchaseCanonicalField,
} from '@/lib/crm/account-import-schema';
import type { PurchaseImportRow, PurchasePreviewResult } from '@/lib/crm/purchase-service';

const PURCHASE_FIELD_LABELS: Record<PurchaseCanonicalField, string> = {
  customer_name: 'Cliente / Empresa *',
  tax_id: 'RUC / Tax ID',
  purchase_date: 'Fecha de Compra *',
  product_description: 'Producto / Descripción *',
  sku: 'Código SKU',
  quantity: 'Cantidad *',
  document_number: 'Nº Factura / Doc',
  line_number: 'Nº Línea / Item',
  unit_price: 'Precio Unitario',
  total_value: 'Total / Importe',
  currency: 'Moneda',
};

export function PurchaseImporter({
  open,
  onClose,
  companies,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  companies: Array<{ id: string; name: string }>;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PurchasePreviewResult | null>(null);
  const [activeTab, setActiveTab] = useState<'PENDIENTES' | 'RESUELTOS' | 'OMITIDOS' | 'MAPEO'>('RESUELTOS');
  const [pendingResolutions, setPendingResolutions] = useState<Record<string, string>>({});
  const [rememberAliases, setRememberAliases] = useState(true);
  const [showMapping, setShowMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    inserted: number;
    duplicates: number;
    errors: Array<{ index: number; error: string }>;
  } | null>(null);

  async function doInitialPreview() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/crm/purchases/import/preview', { method: 'POST', body: form });
      const body: PurchasePreviewResult = await res.json();
      if (!res.ok) {
        throw new Error((body as unknown as { error?: string }).error || 'No se pudo leer el archivo.');
      }
      setPreview(body);
      setPendingResolutions({});
      if (body.unresolved_products_count > 0) {
        setActiveTab('PENDIENTES');
      } else {
        setActiveTab('RESUELTOS');
      }
    } catch (e) {
      setMsg(e instanceof Error ? `No se pudo leer el archivo (${e.message}).` : 'No se pudo leer el archivo.');
    } finally {
      setBusy(false);
    }
  }

  async function reprocessPreview(overrides: {
    sheetName?: string;
    headerRowIndex?: number;
    mapping?: Record<string, number | null>;
    resolutions?: Record<string, string>;
  }) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (overrides.sheetName ?? preview?.sheet_name) {
        form.append('sheet_name', overrides.sheetName ?? preview!.sheet_name);
      }
      if (overrides.headerRowIndex != null || preview?.header_row_index != null) {
        form.append('header_row_index', String(overrides.headerRowIndex ?? preview!.header_row_index));
      }
      if (overrides.mapping ?? preview?.mapping) {
        form.append('mapping', JSON.stringify(overrides.mapping ?? preview!.mapping));
      }
      const resolutions = overrides.resolutions ?? pendingResolutions;
      form.append('pending_resolutions', JSON.stringify(resolutions));

      const res = await fetch('/api/crm/purchases/import/preview', { method: 'POST', body: form });
      const body: PurchasePreviewResult = await res.json();
      if (!res.ok) {
        throw new Error((body as unknown as { error?: string }).error || 'Error al actualizar preview.');
      }
      setPreview(body);
      if (body.unresolved_products_count === 0 && activeTab === 'PENDIENTES') {
        setActiveTab('RESUELTOS');
      }
    } catch (e) {
      setMsg(e instanceof Error ? `Error al actualizar: ${e.message}` : 'Error al actualizar.');
    } finally {
      setBusy(false);
    }
  }

  function handleResolutionChange(desc: string, chosenSku: string) {
    const updated = { ...pendingResolutions, [desc]: chosenSku };
    setPendingResolutions(updated);
    void reprocessPreview({ resolutions: updated });
  }

  function handleFieldMappingChange(field: string, colIdxStr: string) {
    if (!preview) return;
    const colIdx = colIdxStr === '' ? null : parseInt(colIdxStr, 10);
    const updatedMapping = { ...preview.mapping, [field]: isNaN(Number(colIdx)) ? null : colIdx };
    void reprocessPreview({ mapping: updatedMapping });
  }

  async function doCommit() {
    if (!preview) return;
    setBusy(true);
    setMsg(null);
    try {
      const resolvedRows = preview.rows.filter(
        (r) => r.status === 'RESOLVED_CUP' && r.company_id && r.sku && r.fecha && (r.cantidad ?? 0) > 0,
      );

      if (resolvedRows.length === 0) {
        throw new Error('No hay movimientos de vasos válidos para importar.');
      }

      const rowsToCommit = resolvedRows.map((r) => ({
        company_id: r.company_id!,
        purchase_date: r.fecha!,
        sku: r.sku!,
        product_name: r.producto ?? r.sku!,
        quantity: r.cantidad!,
        unit_price: r.unit_price ?? null,
        total_value: r.total_value ?? null,
        currency: r.currency ?? 'USD',
        document_number: r.document_number ?? null,
        line_number: r.line_number ?? null,
      }));

      const saveAliases: Array<{ kind: 'customer' | 'product'; alias: string; target: string }> = [];
      if (rememberAliases) {
        for (const [desc, targetSku] of Object.entries(pendingResolutions)) {
          if (desc && targetSku) {
            saveAliases.push({ kind: 'product', alias: desc, target: targetSku });
          }
        }
      }

      const res = await fetch('/api/crm/purchases/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToCommit, saveAliases }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'COMMIT_FAILED');
      setResult(body);
      onImported();
    } catch (e) {
      setMsg(e instanceof Error ? `No se pudo importar (${e.message}).` : 'No se pudo importar.');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setPendingResolutions({});
    setMsg(null);
    onClose();
  }

  const resolvedList = preview?.rows.filter((r) => r.status === 'RESOLVED_CUP') ?? [];
  const ignoredList = preview?.rows.filter((r) => r.status === 'IGNORED_NON_CUP') ?? [];

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title="Importar historial de compras (Vasos)"
      description="Carga histórica granular para calcular cadencia de compra por Cliente × SKU."
      maxWidth="2xl"
    >
      {!preview ? (
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-[#0c0f14] p-5 hover:border-slate-500">
            <Upload className="h-5 w-5 shrink-0 text-brand-400" />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-slate-200 block truncate">
                {file ? file.name : 'Elegir archivo .xlsx, .xls o .csv (Facturación / Histórico)'}
              </span>
              <span className="text-[11px] text-slate-500 block">
                La IA interpretará la estructura del archivo y conciliará contra el Maestro de Productos.
              </span>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {msg && <p className="text-xs text-amber-400">{msg}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={close}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!file || busy}
              isLoading={busy}
              onClick={() => void doInitialPreview()}
            >
              Vista previa
            </Button>
          </div>
        </div>
      ) : result ? (
        <div className="space-y-3 text-xs">
          <div className="rounded-xl border border-emerald-900/60 bg-emerald-500/10 p-4 text-slate-200 space-y-1">
            <p className="font-semibold text-emerald-300">¡Historial importado exitosamente!</p>
            <p>
              Movimientos registrados: <strong className="text-white">{result.inserted}</strong> · Duplicados omitidos:{' '}
              <strong className="text-white">{result.duplicates}</strong> · Errores:{' '}
              <strong className="text-white">{result.errors.length}</strong>
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={close}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header Info */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2 text-xs">
            <div>
              <span className="text-slate-400">Archivo: </span>
              <span className="font-medium text-slate-200">{file?.name}</span>
            </div>
            <div className="flex items-center gap-3">
              {preview.sheet_names.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Hoja:</span>
                  <select
                    value={preview.sheet_name}
                    onChange={(e) => void reprocessPreview({ sheetName: e.target.value })}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-200"
                  >
                    {preview.sheet_names.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowMapping(!showMapping)}
                className="flex items-center gap-1 text-[11px] text-brand-400 hover:underline"
              >
                <SlidersHorizontal className="h-3 w-3" />
                {showMapping ? 'Ocultar columnas' : 'Mapeo columnas'}
              </button>
            </div>
          </div>

          {/* Resumen KPI Operativo */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6 text-center text-xs">
            <div className="rounded-lg border border-slate-800 bg-[#12161f] p-2">
              <span className="block text-[10px] text-slate-400">Movimientos</span>
              <strong className="text-sm font-semibold text-white">{preview.total_movements}</strong>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#12161f] p-2">
              <span className="block text-[10px] text-slate-400">Clientes únicos</span>
              <strong className="text-sm font-semibold text-white">{preview.unique_clients_count}</strong>
            </div>
            <div className="rounded-lg border border-emerald-900/40 bg-emerald-500/10 p-2">
              <span className="block text-[10px] text-emerald-400">Vasos conciliados</span>
              <strong className="text-sm font-semibold text-emerald-300">{preview.resolved_cups_count}</strong>
            </div>
            <div className="rounded-lg border border-amber-900/40 bg-amber-500/10 p-2">
              <span className="block text-[10px] text-amber-400">Sin resolver</span>
              <strong className="text-sm font-semibold text-amber-300">{preview.unresolved_products_count}</strong>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#12161f] p-2">
              <span className="block text-[10px] text-slate-400">No vasos omitidos</span>
              <strong className="text-sm font-semibold text-slate-300">{preview.ignored_non_cups_count}</strong>
            </div>
            <div className="rounded-lg border border-red-900/40 bg-red-500/10 p-2">
              <span className="block text-[10px] text-red-400">Inválidos</span>
              <strong className="text-sm font-semibold text-red-300">{preview.invalid_rows_count}</strong>
            </div>
          </div>

          {/* Editor de mapeo si está desplegado */}
          {showMapping && (
            <div className="rounded-lg border border-slate-800 bg-[#10141d] p-3 text-xs space-y-2">
              <h4 className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider">
                Mapeo de Columnas
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PURCHASE_CANONICAL_FIELDS.map((f) => (
                  <div key={f} className="space-y-0.5">
                    <label className="text-[10px] text-slate-400 block">{PURCHASE_FIELD_LABELS[f]}</label>
                    <select
                      value={preview.mapping[f] != null ? String(preview.mapping[f]) : ''}
                      onChange={(e) => handleFieldMappingChange(f, e.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs text-slate-200"
                    >
                      <option value="">(Sin columna)</option>
                      {preview.columns.map((c, i) => (
                        <option key={i} value={String(i)}>
                          Col {i + 1}: {c}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs Operativos */}
          <div className="flex items-center gap-2 border-b border-slate-800 text-xs">
            {preview.unresolved_groups.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('PENDIENTES')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-medium transition-colors ${
                  activeTab === 'PENDIENTES'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Pendientes ({preview.unresolved_groups.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('RESUELTOS')}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-medium transition-colors ${
                activeTab === 'RESUELTOS'
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Vasos Listos ({preview.resolved_cups_count})
            </button>
            {preview.ignored_non_cups_count > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('OMITIDOS')}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 font-medium transition-colors ${
                  activeTab === 'OMITIDOS'
                    ? 'border-slate-400 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                No Vasos Omitidos ({preview.ignored_non_cups_count})
              </button>
            )}
          </div>

          {/* Contenido según tab */}
          {activeTab === 'PENDIENTES' && (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              <p className="text-[11px] text-slate-400">
                Seleccioná el SKU de vaso correspondiente para cada descripción no resuelta. Se aplicará a todos los movimientos que la compartan.
              </p>
              {preview.unresolved_groups.map((group) => (
                <div
                  key={group.description}
                  className="rounded-lg border border-amber-900/50 bg-amber-950/15 p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-200 truncate">{group.description}</p>
                    <span className="text-[10px] text-amber-400">{group.count} movimientos</span>
                  </div>
                  <div className="w-full sm:w-64">
                    <select
                      value={pendingResolutions[group.description] ?? ''}
                      onChange={(e) => handleResolutionChange(group.description, e.target.value)}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-brand-500"
                    >
                      <option value="">Seleccionar SKU Maestro...</option>
                      {group.candidates.map((c) => (
                        <option key={c.sku} value={c.sku}>
                          {c.sku} ({c.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              <label className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                <input
                  type="checkbox"
                  checked={rememberAliases}
                  onChange={(e) => setRememberAliases(e.target.checked)}
                />
                Guardar asociaciones como alias para futuras importaciones
              </label>
            </div>
          )}

          {activeTab === 'RESUELTOS' && (
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-800 text-xs">
              <table className="w-full min-w-[600px] text-left">
                <thead className="sticky top-0 bg-[#141820] text-slate-400">
                  <tr>
                    <th className="px-2.5 py-1.5">Cliente</th>
                    <th className="px-2.5 py-1.5">Fecha</th>
                    <th className="px-2.5 py-1.5">SKU Conciliado</th>
                    <th className="px-2.5 py-1.5 text-right">Cantidad</th>
                    <th className="px-2.5 py-1.5">Doc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {resolvedList.slice(0, 100).map((r) => (
                    <tr key={r.index}>
                      <td className="px-2.5 py-1 text-slate-200 truncate max-w-[180px]">{r.cliente}</td>
                      <td className="px-2.5 py-1 text-slate-400 font-mono text-[11px]">{r.fecha}</td>
                      <td className="px-2.5 py-1 text-emerald-400 font-mono text-[11px]">{r.sku}</td>
                      <td className="px-2.5 py-1 text-slate-200 text-right tabular-nums">
                        {r.cantidad?.toLocaleString()}
                      </td>
                      <td className="px-2.5 py-1 text-slate-400 text-[11px]">{r.document_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'OMITIDOS' && (
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-800 text-xs">
              <table className="w-full min-w-[600px] text-left">
                <thead className="sticky top-0 bg-[#141820] text-slate-400">
                  <tr>
                    <th className="px-2.5 py-1.5">Producto Original</th>
                    <th className="px-2.5 py-1.5">SKU Detectado</th>
                    <th className="px-2.5 py-1.5">Categoría</th>
                    <th className="px-2.5 py-1.5">Razón de Omisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {ignoredList.slice(0, 100).map((r) => (
                    <tr key={r.index}>
                      <td className="px-2.5 py-1 text-slate-300">{r.producto || '—'}</td>
                      <td className="px-2.5 py-1 text-slate-400 font-mono text-[11px]">{r.sku || '—'}</td>
                      <td className="px-2.5 py-1 text-slate-400">{r.product_category || 'general'}</td>
                      <td className="px-2.5 py-1 text-amber-400/80 text-[11px]">No pertenece a vasos (V1)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {msg && <p className="text-xs text-amber-400">{msg}</p>}

          {/* Footer Actions */}
          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPreview(null);
                setPendingResolutions({});
              }}
            >
              Cambiar archivo
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || preview.resolved_cups_count === 0}
              isLoading={busy}
              onClick={() => void doCommit()}
            >
              {busy ? 'Importando…' : `Importar ${preview.resolved_cups_count} vasos`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
