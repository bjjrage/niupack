'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  HelpCircle,
  Loader2,
  PackageCheck,
  RefreshCw,
  Sparkles,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type {
  DatasetType,
  IngestionCockpitSummary,
  TargetLifecycle,
  UnresolvedGroup,
} from '@/lib/crm/ingestion/types';

interface CommercialDataImporterProps {
  open: boolean;
  targetLifecycle: TargetLifecycle;
  onClose: () => void;
  onImported?: () => void;
}

type TabKey = 'resumen' | 'pendientes' | 'errores' | 'muestra';

export function CommercialDataImporter({
  open,
  targetLifecycle,
  onClose,
  onImported,
}: CommercialDataImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState<{ current: number; total: number } | null>(null);
  const [commitResult, setCommitResult] = useState<{
    companies: number;
    purchases: number;
    duplicates: number;
  } | null>(null);
  const [summary, setSummary] = useState<IngestionCockpitSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('resumen');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Group resolution state
  const [selectedSkus, setSelectedSkus] = useState<Record<string, string>>({});
  const [resolvingGroup, setResolvingGroup] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAll = () => {
    setFile(null);
    setLoading(false);
    setCommitting(false);
    setCommitProgress(null);
    setCommitResult(null);
    setSummary(null);
    setActiveTab('resumen');
    setErrorMessage(null);
    setSelectedSkus({});
    setResolvingGroup(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = async () => {
    if (summary && summary.status !== 'COMPLETED' && !commitResult) {
      try {
        await fetch(`/api/crm/ingestion/jobs/${summary.job_id}/cancel`, { method: 'POST' });
      } catch {
        // ignore cancel network failure on close
      }
    }
    resetAll();
    onClose();
  };

  const handleFileChange = async (selected: File) => {
    setFile(selected);
    setErrorMessage(null);
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append('file', selected);
      fd.append('target_lifecycle', targetLifecycle);

      const res = await fetch('/api/crm/ingestion/upload', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Error al procesar archivo' }));
        throw new Error(errData.error || 'Error al procesar archivo');
      }

      const data: IngestionCockpitSummary = await res.json();
      setSummary(data);

      if (data.unresolved_product_groups.length > 0) {
        setActiveTab('pendientes');
      } else {
        setActiveTab('resumen');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al procesar archivo');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveGroup = async (group: UnresolvedGroup, targetSku: string) => {
    if (!summary || !targetSku) return;
    setResolvingGroup(group.raw_value);

    try {
      const res = await fetch(`/api/crm/ingestion/jobs/${summary.job_id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_product: group.raw_value,
          target_sku: targetSku,
          save_alias: true,
        }),
      });

      if (!res.ok) throw new Error('Error al resolver producto');

      const updatedSummary: IngestionCockpitSummary = await res.json();
      setSummary(updatedSummary);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al asignar SKU');
    } finally {
      setResolvingGroup(null);
    }
  };

  const handleCommit = async () => {
    if (!summary) return;
    setCommitting(true);
    setErrorMessage(null);

    const batchSize = 500;
    const totalBatches = Math.max(1, Math.ceil(summary.total_movements / batchSize));

    let totalCompanies = 0;
    let totalPurchases = 0;
    let totalDuplicates = 0;

    try {
      for (let i = 0; i < totalBatches; i++) {
        setCommitProgress({ current: i + 1, total: totalBatches });

        const res = await fetch(`/api/crm/ingestion/jobs/${summary.job_id}/commit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch_size: batchSize,
            batch_index: i,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Error en lote' }));
          throw new Error(err.error || `Error en lote ${i + 1}`);
        }

        const batchRes = await res.json();
        totalCompanies += batchRes.inserted_companies || 0;
        totalPurchases += batchRes.inserted_purchases || 0;
        totalDuplicates += batchRes.duplicate_purchases || 0;
      }

      setCommitResult({
        companies: totalCompanies,
        purchases: totalPurchases,
        duplicates: totalDuplicates,
      });

      onImported?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al confirmar importación');
    } finally {
      setCommitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-800 bg-[#0c0f14] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Ingestión Comercial Unificada
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Destino:</span>
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                    targetLifecycle === 'CUSTOMER'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-blue-500/10 text-blue-400'
                  }`}
                >
                  {targetLifecycle === 'CUSTOMER' ? 'Clientes actuales' : 'Clientes potenciales'}
                </span>
                {summary && (
                  <>
                    <span>•</span>
                    <span className="text-slate-300">{summary.filename}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {errorMessage && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Banner */}
          {commitResult && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-400" />
              <h3 className="text-lg font-semibold text-white">
                ¡Importación completada con éxito!
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                Se procesaron los movimientos y se conciliaron con el CRM y el historial de compras.
              </p>
              <div className="mx-auto mt-4 flex max-w-md justify-center gap-6 rounded-lg border border-emerald-500/20 bg-emerald-950/20 py-3 text-sm">
                <div>
                  <span className="block text-xl font-bold text-emerald-400">
                    {commitResult.companies}
                  </span>
                  <span className="text-xs text-slate-400">Cuentas creadas</span>
                </div>
                <div>
                  <span className="block text-xl font-bold text-emerald-400">
                    {commitResult.purchases}
                  </span>
                  <span className="text-xs text-slate-400">Movimientos guardados</span>
                </div>
                <div>
                  <span className="block text-xl font-bold text-slate-400">
                    {commitResult.duplicates}
                  </span>
                  <span className="text-xs text-slate-400">Duplicados omitidos</span>
                </div>
              </div>
              <Button
                variant="primary"
                size="md"
                className="mt-6"
                onClick={handleClose}
              >
                Cerrar y ver cuentas
              </Button>
            </div>
          )}

          {/* Upload Area */}
          {!summary && !commitResult && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700 p-12 text-center hover:border-slate-500">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                id="commercial-ingestion-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileChange(f);
                }}
              />
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400">
                <Upload className="h-7 w-7" />
              </div>
              <h3 className="text-base font-medium text-white">
                Seleccioná o arrastrá el archivo comercial
              </h3>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                Podés subir listados de clientes (cuentas/contactos) o una base transaccional completa (ventas, pedidos, facturas).
                La IA interpretará el formato y el motor determinístico conciliará los datos.
              </p>
              <Button
                variant="primary"
                size="md"
                className="mt-6"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analizando archivo con IA...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Seleccionar Excel o CSV
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Staged Cockpit */}
          {summary && !commitResult && (
            <div className="space-y-6">
              {/* KPIs Bar */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <div className="rounded-xl border border-slate-800 bg-[#12161f] p-3 text-center">
                  <span className="block text-xl font-bold text-white">
                    {summary.total_movements}
                  </span>
                  <span className="text-xs text-slate-400">Filas Totales</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#12161f] p-3 text-center">
                  <span className="block text-xl font-bold text-blue-400">
                    {summary.unique_clients_count}
                  </span>
                  <span className="text-xs text-slate-400">Clientes Únicos</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#12161f] p-3 text-center">
                  <span className="block text-xl font-bold text-emerald-400">
                    {summary.resolved_cups_count}
                  </span>
                  <span className="text-xs text-slate-400">Vasos Conciliados</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#12161f] p-3 text-center">
                  <span className="block text-xl font-bold text-amber-400">
                    {summary.resolved_non_cups_count}
                  </span>
                  <span className="text-xs text-slate-400">No Vasos (Otros)</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#12161f] p-3 text-center">
                  <span className="block text-xl font-bold text-purple-400">
                    {summary.unresolved_products_count}
                  </span>
                  <span className="text-xs text-slate-400">Sin SKU</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#12161f] p-3 text-center">
                  <span
                    className={`block text-xl font-bold ${
                      summary.invalid_rows_count > 0 ? 'text-rose-400' : 'text-slate-500'
                    }`}
                  >
                    {summary.invalid_rows_count}
                  </span>
                  <span className="text-xs text-slate-400">Filas Inválidas</span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-slate-800">
                <button
                  onClick={() => setActiveTab('resumen')}
                  className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'resumen'
                      ? 'border-brand-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Resumen de Estructura
                </button>
                <button
                  onClick={() => setActiveTab('pendientes')}
                  className={`relative border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'pendientes'
                      ? 'border-brand-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Pendientes de SKU
                  {summary.unresolved_product_groups.length > 0 && (
                    <span className="ml-2 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-300">
                      {summary.unresolved_product_groups.length}
                    </span>
                  )}
                </button>
                {summary.invalid_rows_count > 0 && (
                  <button
                    onClick={() => setActiveTab('errores')}
                    className={`relative border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === 'errores'
                        ? 'border-brand-500 text-white'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Errores
                    <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">
                      {summary.invalid_rows_count}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('muestra')}
                  className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'muestra'
                      ? 'border-brand-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Muestra de Filas (50)
                </button>
              </div>

              {/* Tab: RESUMEN */}
              {activeTab === 'resumen' && (
                <div className="space-y-4 rounded-xl border border-slate-800 bg-[#10141d] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-brand-400" />
                      <span className="text-sm font-semibold text-white">
                        Detección Automática por IA:
                      </span>
                      <span className="rounded bg-brand-500/20 px-2 py-0.5 text-xs font-medium text-brand-300">
                        {summary.dataset_type}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Hoja: <span className="font-semibold text-white">{summary.sheet_name}</span> |
                      Fila cabecera: <span className="font-semibold text-white">#{summary.header_row_index + 1}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Mapeo de Columnas Detectado:
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(summary.mapping).map(([field, colIdx]) => {
                        if (colIdx == null) return null;
                        const colName = summary.columns[colIdx] || `Columna ${colIdx + 1}`;
                        return (
                          <div
                            key={field}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300"
                          >
                            <span className="font-mono text-brand-400">{field}:</span>
                            <span className="text-white">{colName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: PENDIENTES */}
              {activeTab === 'pendientes' && (
                <div className="space-y-3">
                  {summary.unresolved_product_groups.length === 0 ? (
                    <div className="rounded-xl border border-slate-800 p-8 text-center text-sm text-slate-400">
                      <PackageCheck className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
                      Todos los productos están conciliados con el Maestro de SKUs.
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-400">
                        Los siguientes productos históricos no tienen coincidencia exacta en el Maestro de SKUs.
                        Asigná el SKU correspondiente para resolver todos los movimientos de esa descripción en un solo paso:
                      </p>
                      {summary.unresolved_product_groups.map((group) => {
                        const currentSelect = selectedSkus[group.raw_value] || '';
                        const isResolving = resolvingGroup === group.raw_value;

                        return (
                          <div
                            key={group.raw_value}
                            className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-[#11151f] p-4 sm:flex-row sm:items-center"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white">
                                  {group.raw_value}
                                </span>
                                <span className="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">
                                  {group.occurrences} movimientos
                                </span>
                              </div>
                              <span className="text-xs text-slate-500">
                                Sin SKU en Maestro
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                value={currentSelect}
                                onChange={(e) =>
                                  setSelectedSkus((prev) => ({
                                    ...prev,
                                    [group.raw_value]: e.target.value,
                                  }))
                                }
                                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
                              >
                                <option value="">Seleccionar SKU Maestro...</option>
                                {group.candidates.map((cand) => (
                                  <option key={cand.sku} value={cand.sku}>
                                    {cand.sku} — {cand.name}
                                  </option>
                                ))}
                              </select>

                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={!currentSelect || isResolving}
                                onClick={() => handleResolveGroup(group, currentSelect)}
                              >
                                {isResolving ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  'Asignar a todos'
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* Tab: ERRORES */}
              {activeTab === 'errores' && (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="px-4 py-2">Fila #</th>
                        <th className="px-4 py-2">Motivo del Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {summary.errors_summary.map((err) => (
                        <tr key={err.row_index} className="hover:bg-slate-800/40">
                          <td className="px-4 py-2 font-mono text-slate-400">
                            #{err.row_index + 1}
                          </td>
                          <td className="px-4 py-2 text-rose-400">{err.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab: MUESTRA */}
              {activeTab === 'muestra' && (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Cliente</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Producto / Descripción</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2 text-right">Cantidad</th>
                        <th className="px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {summary.sample_rows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-800/30">
                          <td className="px-3 py-1.5 font-mono text-slate-500">
                            {r.row_index as number + 1}
                          </td>
                          <td className="px-3 py-1.5 font-medium text-white">
                            {(r.cliente as string) || '—'}
                          </td>
                          <td className="px-3 py-1.5 text-slate-400">
                            {(r.fecha as string) || '—'}
                          </td>
                          <td className="px-3 py-1.5 text-slate-300">
                            {(r.producto as string) || '—'}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-brand-300">
                            {(r.sku as string) || '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right text-white">
                            {r.cantidad != null ? Number(r.cantidad).toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-1.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                r.status === 'READY'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : r.status === 'PRODUCT_UNRESOLVED'
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {r.status as string}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
          <Button variant="ghost" size="md" onClick={handleClose} disabled={committing}>
            Cancelar
          </Button>

          {summary && !commitResult && (
            <div className="flex items-center gap-3">
              {commitProgress && (
                <span className="text-xs text-slate-400">
                  Guardando lote {commitProgress.current} de {commitProgress.total}...
                </span>
              )}
              <Button
                variant="primary"
                size="md"
                disabled={committing || summary.unresolved_products_count > 0}
                onClick={handleCommit}
              >
                {committing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando lotes...
                  </>
                ) : (
                  <>
                    <PackageCheck className="mr-2 h-4 w-4" />
                    Confirmar e Importar ({summary.resolved_cups_count + summary.resolved_non_cups_count || summary.total_movements} filas)
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
