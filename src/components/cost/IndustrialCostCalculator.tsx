'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calculator, CheckCircle2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import type {
  CostInputSource,
  CostV1RubricKey,
  IndustrialProductCostInput,
  ProductAttribute,
} from '@/types';

interface Props {
  initialSku?: string;
  marketBenchmarkUSD?: number;
  onCostUpdated?: (unitCost: number) => void;
}

const rubricLabels: Record<CostV1RubricKey, string> = {
  raw_material: 'A. Materia prima',
  printing_die_cut: 'B. Impresión + troquelado',
  operational: 'C. Costos operativos',
  scrap: 'D. Merma',
  depreciation: 'E. Depreciación',
  packaging: 'F. Embalaje',
};

const sourceOptions: CostInputSource[] = ['MANUAL', 'FORMULA', 'QUOTE'];

function emptyInput(sku: string): IndustrialProductCostInput {
  return {
    sku,
    paper_formula: {
      cif_price_ton_usd: 0,
      customs_dispatch_percent: 0,
      financial_cost_percent: 0,
      printing_method: 'OFFSET',
      sheet_width_mm: 0,
      sheet_height_mm: 0,
      gsm: 0,
      coating_gsm: 0,
      units_per_sheet: 0,
      web_width_mm: 0,
      units_per_linear_meter: 0,
      paper_yield_units_per_ton: 0,
    },
    bottom_formula: {
      cif_price_ton_usd: 0,
      customs_dispatch_percent: 0,
      financial_cost_percent: 0,
      gsm: 0,
      coating_gsm: 0,
      sheet_width_mm: 0,
      sheet_height_mm: 0,
      units_per_m2: 0,
    },
    bottom_paper_cost_ton_usd: 0,
    bottom_yield_units_per_ton: 0,
    printing_cost_mode: 'PER_THOUSAND',
    quoted_printing_rate_usd: 0,
    operational_cost_per_thousand_usd: 0,
    machine_depreciation_per_thousand_usd: 0,
    scrap_rate_percent: 0,
    packaging_cost_per_thousand_usd: 0,
    batch_size: 0,
    rubrics: {
      raw_material: { enabled: true, source: 'FORMULA', unit: 'PER_UNIT' },
      printing_die_cut: { enabled: true, source: 'QUOTE', unit: 'PER_1000' },
      operational: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
      scrap: { enabled: true, source: 'MANUAL', unit: 'PERCENT' },
      depreciation: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
      packaging: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
    },
  };
}

function inputNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function Field({ label, value, onChange, suffix }: { label: string; value: number; onChange: (value: number) => void; suffix?: string }) {
  return (
    <label className="block text-[11px] text-slate-400">
      <span className="mb-1 block">{label}</span>
      <span className="flex items-center rounded border border-slate-700 bg-[#0c0f14]">
        <input
          type="number"
          step="any"
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => onChange(inputNumber(event.target.value))}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs font-mono text-white outline-none"
        />
        {suffix && <span className="pr-2 text-[10px] text-slate-500">{suffix}</span>}
      </span>
    </label>
  );
}

export function IndustrialCostCalculator({ initialSku, marketBenchmarkUSD, onCostUpdated }: Props) {
  const [skus, setSkus] = useState<ProductAttribute[]>([]);
  const [sku, setSku] = useState(initialSku || '');
  const [input, setInput] = useState<IndustrialProductCostInput | null>(null);
  const [configured, setConfigured] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadSku = async (targetSku: string) => {
    if (!targetSku) return;
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/cost/industrial?sku=${encodeURIComponent(targetSku)}`);
      const data = await response.json();
      if (response.ok) {
        setInput(data.input || emptyInput(targetSku));
        setConfigured(Boolean(data.configured));
        setMissing(data.breakdown?.missing_configuration || []);
      } else {
        setInput(null);
        setConfigured(false);
        setMissing([]);
        setFeedback(data.error || 'No se pudo cargar el SKU.');
      }
    } catch {
      setInput(null);
      setFeedback('No se pudo cargar la configuración del SKU.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/cost/skus').then((response) => response.json()),
      fetch('/api/fx').then((response) => response.json()).catch(() => ({})),
    ]).then(([skuData, fxData]) => {
      if (!active) return;
      const activeSkus = (skuData.skus || []) as ProductAttribute[];
      setSkus(activeSkus);
      setFxRate(typeof fxData.costingRate === 'number' ? fxData.costingRate : null);
      const selected = activeSkus.some((candidate) => candidate.sku === (initialSku || sku))
        ? (initialSku || sku)
        : activeSkus[0]?.sku || '';
      setSku(selected);
      if (selected) void loadSku(selected);
      else setLoading(false);
    }).catch(() => {
      if (active) {
        setLoading(false);
        setFeedback('No se pudo cargar el Maestro de Productos & SKUs.');
      }
    });
    return () => { active = false; };
    // The initial selection is intentionally resolved once from the SKU master.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSku]);

  const breakdown = useMemo(
    () => (input ? IndustrialCostEngine.calculateCost(input) : null),
    [input]
  );

  const updateInput = (updates: Partial<IndustrialProductCostInput>) => {
    setInput((current) => current ? { ...current, ...updates } : current);
  };

  const updateRubric = (key: CostV1RubricKey, updates: Partial<NonNullable<IndustrialProductCostInput['rubrics']>[CostV1RubricKey]>) => {
    setInput((current) => current ? {
      ...current,
      rubrics: {
        ...current.rubrics,
        [key]: { ...current.rubrics?.[key], ...updates },
      },
    } : current);
  };

  const save = async () => {
    if (!input) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/cost/industrial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar');
      setConfigured(Boolean(data.configured));
      setMissing(data.missing_configuration || []);
      setFeedback(data.configured ? 'Configuración V1 guardada en Supabase.' : 'Guardado como borrador: faltan datos para calcular el True Cost.');
      if (data.breakdown && onCostUpdated) onCostUpdated(data.breakdown.true_unit_cost_usd);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  if (!sku && !loading) {
    return (
      <div className="rounded border border-amber-800/70 bg-amber-950/20 p-5 text-sm text-amber-200">
        No hay SKUs activos en el Maestro de Productos & SKUs.
      </div>
    );
  }

  const rubricValues: Record<CostV1RubricKey, number> = {
    raw_material: breakdown?.cost_paper_cone_usd ? breakdown.cost_paper_cone_usd + breakdown.cost_bottom_usd : 0,
    printing_die_cut: breakdown?.cost_printing_diecut_usd || 0,
    operational: breakdown?.cost_operational_usd || 0,
    scrap: breakdown?.cost_scrap_usd || 0,
    depreciation: breakdown?.cost_depreciation_usd || 0,
    packaging: breakdown?.cost_packaging_usd || 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#141820] p-4">
        <div className="flex items-center gap-3">
          <Calculator className="h-5 w-5 text-brand-400" />
          <div>
            <div className="text-sm font-bold text-white">Cost Intelligence V1 · Hoja parametrizable</div>
            <div className="text-[11px] text-slate-500">Fuente única: Maestro de Productos & SKUs · persistencia real por tenant</div>
          </div>
        </div>
        <select
          value={sku}
          onChange={(event) => { setSku(event.target.value); void loadSku(event.target.value); }}
          className="rounded border border-slate-700 bg-[#0c0f14] px-2.5 py-1.5 text-xs font-mono text-white"
        >
          {skus.map((candidate) => <option key={candidate.sku} value={candidate.sku}>{candidate.sku}</option>)}
        </select>
      </div>

      {!configured && (
        <div className="flex items-start gap-3 rounded border border-amber-800/70 bg-amber-950/20 p-4 text-xs text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <div className="font-semibold">SIN CONFIGURAR · {sku}</div>
            <div className="mt-1 text-amber-200/80">No se fabrican valores de reemplazo. Completá los seis rubros y guardá la hoja.</div>
            {missing.length > 0 && <div className="mt-2 font-mono text-[11px]">Faltan: {missing.join(' · ')}</div>}
          </div>
        </div>
      )}

      {feedback && <div className="rounded border border-slate-700 bg-[#10141b] p-3 text-xs text-slate-200">{feedback}</div>}

      {loading ? <div className="rounded border border-slate-800 bg-[#141820] p-5 text-xs text-slate-400">Cargando hoja de costo…</div> : input && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(rubricLabels) as CostV1RubricKey[]).map((key) => {
              const config = input.rubrics?.[key] || { enabled: true, source: 'MANUAL' as CostInputSource, unit: key === 'scrap' ? 'PERCENT' as const : 'PER_1000' as const };
              return (
                <div key={key} className={`rounded border p-4 ${config.enabled ? 'border-slate-700 bg-[#141820]' : 'border-slate-800 bg-[#0f1218] opacity-70'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-white">
                      <input type="checkbox" checked={config.enabled} onChange={(event) => updateRubric(key, { enabled: event.target.checked })} />
                      {rubricLabels[key]}
                    </label>
                    <Badge variant={config.enabled ? 'success' : 'neutral'} size="sm">{config.enabled ? 'ON' : 'OFF'}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                    <select value={config.source} onChange={(event) => updateRubric(key, { source: event.target.value as CostInputSource })} className="rounded border border-slate-700 bg-[#0c0f14] px-1.5 py-1 text-[10px] text-slate-300">
                      {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
                    </select>
                    <span>{config.unit}</span>
                    <span className="font-mono text-sm text-emerald-400">${rubricValues[key].toFixed(5)} /u</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className="space-y-4 rounded-lg border border-slate-800 bg-[#141820] p-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div><h3 className="text-xs font-bold uppercase tracking-wider text-white">A. Materia prima</h3><p className="text-[11px] text-slate-500">Cuerpo/cono + fondo · fórmula OFFSET/FLEXO y rendimiento manual</p></div>
                <span className="font-mono text-sm text-emerald-400">${rubricValues.raw_material.toFixed(5)} /u</span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label="CIF cuerpo" suffix="USD/t" value={input.paper_formula.cif_price_ton_usd} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, cif_price_ton_usd: value } })} />
                <Field label="Despacho" suffix="%" value={input.paper_formula.customs_dispatch_percent || 0} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, customs_dispatch_percent: value } })} />
                <Field label="Financiero" suffix="%" value={input.paper_formula.financial_cost_percent || 0} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, financial_cost_percent: value } })} />
                <Field label="Gramaje cuerpo" suffix="gsm" value={input.paper_formula.gsm} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, gsm: value } })} />
                <Field label="Coating cuerpo" suffix="gsm" value={input.paper_formula.coating_gsm || 0} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, coating_gsm: value } })} />
                <Field label="Rendimiento directo" suffix="u/t" value={input.paper_formula.paper_yield_units_per_ton} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, paper_yield_units_per_ton: value } })} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={input.paper_formula.printing_method} onChange={(event) => updateInput({ paper_formula: { ...input.paper_formula, printing_method: event.target.value as 'OFFSET' | 'FLEXO' } })} className="rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white">
                  <option value="OFFSET">OFFSET · pliego</option><option value="FLEXO">FLEXO · metro lineal</option>
                </select>
                <Field label="Ancho pliego/bobina" suffix="mm" value={input.paper_formula.sheet_width_mm || input.paper_formula.web_width_mm || 0} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, sheet_width_mm: value, web_width_mm: value } })} />
                <Field label="Largo pliego" suffix="mm" value={input.paper_formula.sheet_height_mm || 0} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, sheet_height_mm: value } })} />
                <Field label="u/pliego o u/m" suffix="u" value={input.paper_formula.units_per_sheet || input.paper_formula.units_per_linear_meter || 0} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, units_per_sheet: value, units_per_linear_meter: value } })} />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Field label="CIF fondo" suffix="USD/t" value={input.bottom_formula?.cif_price_ton_usd || input.bottom_paper_cost_ton_usd} onChange={(value) => updateInput({ bottom_paper_cost_ton_usd: value, bottom_formula: { ...(input.bottom_formula || emptyInput(sku).bottom_formula!), cif_price_ton_usd: value } })} />
                <Field label="Gramaje fondo" suffix="gsm" value={input.bottom_formula?.gsm || 0} onChange={(value) => updateInput({ bottom_formula: { ...(input.bottom_formula || emptyInput(sku).bottom_formula!), gsm: value } })} />
                <Field label="Coating fondo" suffix="gsm" value={input.bottom_formula?.coating_gsm || 0} onChange={(value) => updateInput({ bottom_formula: { ...(input.bottom_formula || emptyInput(sku).bottom_formula!), coating_gsm: value } })} />
                <Field label="Rendimiento fondo" suffix="u/t" value={input.bottom_yield_units_per_ton} onChange={(value) => updateInput({ bottom_yield_units_per_ton: value })} />
                <Field label="u/m² fondo" suffix="u" value={input.bottom_formula?.units_per_m2 || 0} onChange={(value) => updateInput({ bottom_formula: { ...(input.bottom_formula || emptyInput(sku).bottom_formula!), units_per_m2: value } })} />
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-slate-800 bg-[#141820] p-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3"><div><h3 className="text-xs font-bold uppercase tracking-wider text-white">B–F. Rubros directos</h3><p className="text-[11px] text-slate-500">Cada variable modifica únicamente su rubro.</p></div><span className="font-mono text-sm text-white">${breakdown?.true_unit_cost_usd.toFixed(5) || '0.00000'} /u</span></div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[11px] text-slate-400">Método de cotización impresión + troquelado<select value={input.printing_cost_mode} onChange={(event) => updateInput({ printing_cost_mode: event.target.value as IndustrialProductCostInput['printing_cost_mode'] })} className="mt-1 w-full rounded border border-slate-700 bg-[#0c0f14] px-2 py-1.5 text-xs text-white"><option value="PER_THOUSAND">USD / 1.000</option><option value="PER_UNIT">USD / unidad</option><option value="TOTAL_BATCH">USD lote total</option></select></label>
                <Field label="Impresión + troquelado" suffix={input.printing_cost_mode === 'PER_UNIT' ? 'USD/u' : input.printing_cost_mode === 'TOTAL_BATCH' ? 'USD/lote' : 'USD/1.000'} value={input.quoted_printing_rate_usd} onChange={(value) => updateInput({ quoted_printing_rate_usd: value })} />
                <Field label="Costos operativos" suffix="USD/1.000" value={input.operational_cost_per_thousand_usd} onChange={(value) => updateInput({ operational_cost_per_thousand_usd: value })} />
                <Field label="Merma" suffix="% MP" value={input.scrap_rate_percent} onChange={(value) => updateInput({ scrap_rate_percent: value })} />
                <Field label="Depreciación" suffix="USD/1.000" value={input.machine_depreciation_per_thousand_usd} onChange={(value) => updateInput({ machine_depreciation_per_thousand_usd: value })} />
                <Field label="Embalaje" suffix="USD/1.000" value={input.packaging_cost_per_thousand_usd} onChange={(value) => updateInput({ packaging_cost_per_thousand_usd: value })} />
                <Field label="Tamaño de lote" suffix="unidades" value={input.batch_size} onChange={(value) => updateInput({ batch_size: value })} />
              </div>
              <div className="rounded border border-slate-800 bg-[#0c0f14] p-3 text-[11px] text-slate-400">Merma aplicada a MP: <span className="font-mono text-rose-300">${(breakdown?.cost_scrap_usd || 0).toFixed(5)} /u</span>. La depreciación y el embalaje son independientes.</div>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#141820] p-4">
            <div className="text-xs text-slate-400">True Cost: <span className="font-mono font-bold text-white">${breakdown?.true_unit_cost_usd.toFixed(5) || '0.00000'} USD/u</span> · Lote: <span className="font-mono text-slate-200">${breakdown?.batch_total_cost_usd.toLocaleString() || '0.00'} USD</span>{fxRate && <span className="ml-2 text-slate-500">FX Gs. {fxRate.toLocaleString('es-PY')}</span>}</div>
            <Button variant="primary" size="sm" onClick={save} disabled={saving || !input}><Save className="mr-1.5 h-3.5 w-3.5" />{saving ? 'Guardando…' : 'Guardar hoja de costo'}</Button>
          </div>

          {configured && <div className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Hoja activa y trazable en seis rubros.</div>}
          {marketBenchmarkUSD && marketBenchmarkUSD > 0 && breakdown && <div className="text-[11px] text-slate-500">Benchmark real disponible: ${marketBenchmarkUSD.toFixed(4)} USD/u.</div>}
        </>
      )}
    </div>
  );
}
