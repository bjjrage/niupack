'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface PreviewRow {
  index: number;
  raw: Record<string, string>;
  cliente?: string | null;
  fecha?: string | null;
  producto?: string | null;
  cantidad?: number | null;
  company_id?: string | null;
  company_candidates?: Array<{ id: string; name: string }> | null;
  sku?: string | null;
  product_name?: string | null;
  sku_candidates?: Array<{ sku: string; name: string }> | null;
  errors: string[];
}

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
  const [preview, setPreview] = useState<{ columns: string[]; mapping: Record<string, string>; rows: PreviewRow[] } | null>(null);
  const [overrides, setOverrides] = useState<Record<number, { company_id?: string; sku?: string }>>({});
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; duplicates: number; errors: Array<{ index: number; error: string }> } | null>(null);

  async function doPreview() {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/crm/purchases/import/preview', { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'PREVIEW_FAILED');
      setPreview(body);
      setOverrides({});
    } catch (e) {
      setMsg(e instanceof Error ? `No se pudo leer el archivo (${e.message}).` : 'No se pudo leer el archivo.');
    } finally {
      setBusy(false);
    }
  }

  async function doCommit() {
    if (!preview) return;
    setBusy(true);
    setMsg(null);
    try {
      const rows = [];
      const saveAliases: Array<{ kind: 'customer' | 'product'; alias: string; target: string }> = [];
      for (const r of preview.rows) {
        const ov = overrides[r.index] ?? {};
        const company_id = ov.company_id ?? r.company_id;
        const sku = ov.sku ?? r.sku;
        if (!company_id || !sku || !r.fecha || !((r.cantidad ?? 0) > 0)) continue;
        if (ov.company_id && ov.company_id !== r.company_id && r.cliente && remember) {
          saveAliases.push({ kind: 'customer', alias: r.cliente, target: ov.company_id });
        }
        if (ov.sku && ov.sku !== r.sku && r.producto && remember) {
          saveAliases.push({ kind: 'product', alias: r.producto, target: ov.sku });
        }
        rows.push({
          company_id,
          purchase_date: r.fecha,
          sku,
          product_name: r.producto ?? sku,
          quantity: r.cantidad!,
        });
      }
      if (rows.length === 0) throw new Error('EMPTY_SELECTION');
      const res = await fetch('/api/crm/purchases/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, saveAliases }),
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

  const resolvable = preview?.rows.filter((r) => (overrides[r.index]?.company_id ?? r.company_id) && (overrides[r.index]?.sku ?? r.sku) && r.fecha && (r.cantidad ?? 0) > 0).length ?? 0;

  return (
    <Modal isOpen={open} onClose={onClose} title="Importar compras" description="Excel o CSV: vista previa, conciliación y confirmación." maxWidth="2xl">
      {!preview ? (
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-[#0c0f14] p-4 hover:border-slate-500">
            <Upload className="h-5 w-5 shrink-0 text-brand-400" />
            <span className="text-xs text-slate-300">{file ? file.name : 'Elegir archivo .xlsx o .csv (Cliente, Fecha, Producto, Cantidad)'}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {msg && <p className="text-[11px] text-amber-400">{msg}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" size="sm" disabled={!file || busy} onClick={() => void doPreview()}>
              {busy ? 'Leyendo…' : 'Vista previa'}
            </Button>
          </div>
        </div>
      ) : result ? (
        <div className="space-y-2 text-xs">
          <p className="text-slate-200">Importadas: <strong className="tabular-nums">{result.inserted}</strong> · Duplicadas omitidas: <strong className="tabular-nums">{result.duplicates}</strong> · Errores: <strong className="tabular-nums">{result.errors.length}</strong></p>
          {result.errors.slice(0, 10).map((e) => (
            <p key={e.index} className="text-[11px] text-amber-400">Fila {e.index + 1}: {e.error}</p>
          ))}
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-500">
            {preview.rows.length} filas · {resolvable} listas para importar · columnas detectadas: {Object.entries(preview.mapping).map(([k, v]) => `${k}→${v}`).join(', ') || '—'}
          </p>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Recordar mis selecciones para próximas importaciones
          </label>
          {msg && <p className="text-[11px] text-amber-400">{msg}</p>}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {preview.rows.slice(0, 150).map((r) => {
              const ov = overrides[r.index] ?? {};
              const companyId = ov.company_id ?? r.company_id ?? '';
              const sku = ov.sku ?? r.sku ?? '';
              const ok = companyId && sku && r.fecha && r.cantidad! > 0;
              return (
                <div key={r.index} className={`rounded border p-2.5 ${ok ? 'border-slate-800 bg-[#0c0f14]' : 'border-amber-900/50 bg-amber-950/10'}`}>
                  <p className="truncate text-xs text-slate-200">
                    {r.cliente || '—'} · {r.producto || '—'} · <span className="tabular-nums">{r.cantidad ?? '—'}</span> · {r.fecha || '—'}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <select
                      value={companyId}
                      onChange={(e) => setOverrides((o) => ({ ...o, [r.index]: { ...o[r.index], company_id: e.target.value || undefined } }))}
                      className="rounded border border-slate-700 bg-[#141820] px-2 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">Cliente…</option>
                      {(r.company_candidates ?? []).map((c) => <option key={c.id} value={c.id}>★ {c.name}</option>)}
                      {companies.filter((c) => !(r.company_candidates ?? []).some((x) => x.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input
                      value={sku}
                      onChange={(e) => setOverrides((o) => ({ ...o, [r.index]: { ...o[r.index], sku: e.target.value || undefined } }))}
                      placeholder="SKU"
                      list={`skus-${r.index}`}
                      className="rounded border border-slate-700 bg-[#141820] px-2 py-1.5 font-mono text-xs text-white focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                  {(r.sku_candidates ?? []).length > 0 && !ov.sku && (
                    <p className="mt-1 text-[10px] text-slate-500">Sugerencias: {(r.sku_candidates ?? []).map((s) => s.sku).join(', ')}</p>
                  )}
                  {r.errors.length > 0 && <p className="mt-1 text-[10px] text-amber-400">{r.errors.join(' · ')}</p>}
                  {r.errors.length === 0 && ok && <p className="mt-1 text-[10px] text-emerald-500"><Badge variant="success" size="sm">LISTA</Badge></p>}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => { setPreview(null); setResult(null); }}>Volver</Button>
            <Button variant="primary" size="sm" disabled={busy || resolvable === 0} onClick={() => void doCommit()}>
              {busy ? 'Importando…' : `Confirmar (${resolvable})`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
