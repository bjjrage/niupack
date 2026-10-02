'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calculator, CheckCircle2, ChevronDown, Save } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import type {
  CostInputSource,
  CostV1RubricConfig,
  CostV1RubricKey,
  IndustrialProductCostInput,
  Product,
  ProductAttribute,
} from '@/types';

interface Props {
  initialSku?: string;
  marketBenchmarkUSD?: number;
  onCostUpdated?: (unitCost: number) => void;
}

const rubricLabels: Record<CostV1RubricKey, string> = {
  raw_material: 'Materia prima',
  printing_die_cut: 'Impresión + troquelado',
  operational: 'Costos operativos',
  scrap: 'Merma',
  depreciation: 'Depreciación',
  packaging: 'Embalaje',
};

const rubricDefaults: Record<CostV1RubricKey, CostV1RubricConfig> = {
  raw_material: { enabled: true, source: 'FORMULA', unit: 'PER_UNIT' },
  printing_die_cut: { enabled: true, source: 'QUOTE', unit: 'PER_1000' },
  operational: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
  scrap: { enabled: true, source: 'MANUAL', unit: 'PERCENT' },
  depreciation: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
  packaging: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
};

const sourceOptions: CostInputSource[] = ['MANUAL', 'FORMULA', 'QUOTE'];
const unitLabels: Record<CostV1RubricConfig['unit'], string> = {
  PER_UNIT: 'USD / unidad',
  PER_1000: 'USD / 1.000',
  TOTAL_BATCH: 'USD / lote',
  PERCENT: '% sobre MP',
};

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

function NumberField({
  label,
  value,
  onChange,
  suffix,
  emptyWhenZero = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  emptyWhenZero?: boolean;
}) {
  const displayValue = emptyWhenZero && value === 0 ? '' : Number.isFinite(value) ? value : '';

  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-300">
      <span>{label}</span>
      <span className="flex min-h-11 items-center rounded-md border border-slate-700 bg-[#0c0f14] transition-colors focus-within:border-brand-500/70 focus-within:ring-1 focus-within:ring-brand-500/30">
        <input
          type="number"
          step="any"
          value={displayValue}
          placeholder={emptyWhenZero ? 'Sin configurar' : undefined}
          onChange={(event) => onChange(inputNumber(event.target.value))}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-mono tabular-nums text-white outline-none placeholder:font-sans placeholder:text-xs placeholder:text-slate-600"
        />
        {suffix && <span className="shrink-0 px-3 text-[11px] font-normal text-slate-500">{suffix}</span>}
      </span>
    </label>
  );
}

function rubricConfig(input: IndustrialProductCostInput, key: CostV1RubricKey): CostV1RubricConfig {
  return { ...rubricDefaults[key], ...input.rubrics?.[key] };
}

function RubricCard({
  title,
  config,
  impact,
  unitLabel,
  onEnabledChange,
  onSourceChange,
  children,
}: {
  title: string;
  config: CostV1RubricConfig;
  impact: number;
  unitLabel?: string;
  onEnabledChange: (enabled: boolean) => void;
  onSourceChange: (source: CostInputSource) => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-xl border p-4 sm:p-5 ${config.enabled ? 'border-slate-700/90 bg-[#141820]' : 'border-slate-800 bg-[#10141a] opacity-75'}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-slate-700 bg-[#0c0f14] px-2.5 text-[11px] font-semibold tracking-wide text-slate-200">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) => onEnabledChange(event.target.checked)}
                aria-label={`${config.enabled ? 'Desactivar' : 'Activar'} ${title}`}
                className="h-3.5 w-3.5 accent-brand-500"
              />
              <span>{config.enabled ? 'ACTIVO' : 'INACTIVO'}</span>
            </label>
            <select
              value={config.source}
              onChange={(event) => onSourceChange(event.target.value as CostInputSource)}
              aria-label={`Fuente de ${title}`}
              className="min-h-8 rounded-md border border-slate-700 bg-[#0c0f14] px-2.5 text-[11px] font-semibold text-slate-300 outline-none focus:border-brand-500/70"
            >
              {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Impacto USD / u</div>
          <div className={`mt-1 whitespace-nowrap font-mono text-lg font-semibold tabular-nums ${config.enabled ? 'text-emerald-300' : 'text-slate-500'}`}>
            ${impact.toFixed(5)}<span className="ml-1 text-xs font-normal text-slate-500">/u</span>
          </div>
          <div className="text-[10px] text-slate-500">{unitLabel || unitLabels[config.unit]}</div>
        </div>
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

export function IndustrialCostCalculator({ initialSku, marketBenchmarkUSD, onCostUpdated }: Props) {
  const [skus, setSkus] = useState<ProductAttribute[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
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
      setProducts((skuData.products || []) as Product[]);
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

  const updateRubric = (key: CostV1RubricKey, updates: Partial<CostV1RubricConfig>) => {
    setInput((current) => current ? {
      ...current,
      rubrics: {
        ...current.rubrics,
        [key]: { ...current.rubrics?.[key], ...updates },
      },
    } : current);
  };

  const updateBottomFormula = (updates: Partial<NonNullable<IndustrialProductCostInput['bottom_formula']>>) => {
    const currentBottom = input?.bottom_formula || emptyInput(sku).bottom_formula!;
    updateInput({ bottom_formula: { ...currentBottom, ...updates } });
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
      <div style={{ zoom: 0.8, width: '125%' }} className="rounded-lg border border-amber-800/70 bg-amber-950/20 p-5 text-sm text-amber-200">
        No hay SKUs activos en el Maestro de Productos & SKUs.
      </div>
    );
  }

  const selectedAttribute = skus.find((candidate) => candidate.sku === sku);
  const selectedProduct = products.find((product) => product.id === selectedAttribute?.product_id);
  const wallLabel = selectedAttribute?.wall_type === 'single'
    ? 'Pared simple'
    : selectedAttribute?.wall_type === 'double'
      ? 'Pared doble'
      : 'N/A';
  const sizeLabel = selectedAttribute?.size_oz
    ? `${selectedAttribute.size_oz} oz`
    : selectedAttribute?.size_ml
      ? `${selectedAttribute.size_ml} ml`
      : 'Tamaño no especificado';

  const rubricValues: Record<CostV1RubricKey, number> = {
    raw_material: breakdown?.rubrics?.find((rubric) => rubric.key === 'raw_material')?.impact_usd_per_unit || 0,
    printing_die_cut: breakdown?.rubrics?.find((rubric) => rubric.key === 'printing_die_cut')?.impact_usd_per_unit || 0,
    operational: breakdown?.rubrics?.find((rubric) => rubric.key === 'operational')?.impact_usd_per_unit || 0,
    scrap: breakdown?.rubrics?.find((rubric) => rubric.key === 'scrap')?.impact_usd_per_unit || 0,
    depreciation: breakdown?.rubrics?.find((rubric) => rubric.key === 'depreciation')?.impact_usd_per_unit || 0,
    packaging: breakdown?.rubrics?.find((rubric) => rubric.key === 'packaging')?.impact_usd_per_unit || 0,
  };

  const rawConfig = input ? rubricConfig(input, 'raw_material') : rubricDefaults.raw_material;
  const printingConfig = input ? rubricConfig(input, 'printing_die_cut') : rubricDefaults.printing_die_cut;
  const operationalConfig = input ? rubricConfig(input, 'operational') : rubricDefaults.operational;
  const scrapConfig = input ? rubricConfig(input, 'scrap') : rubricDefaults.scrap;
  const depreciationConfig = input ? rubricConfig(input, 'depreciation') : rubricDefaults.depreciation;
  const packagingConfig = input ? rubricConfig(input, 'packaging') : rubricDefaults.packaging;
  const paperFormula = input?.paper_formula;
  const bottomFormula = input?.bottom_formula || emptyInput(sku).bottom_formula!;
  const emptyValues = !configured;

  return (
    <div style={{ zoom: 0.8, width: '125%' }} className="space-y-6">
      <header className="rounded-xl border border-slate-800 bg-[#141820] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-500/30 bg-brand-950/50 text-brand-300">
              <Calculator className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Hoja de costo</div>
              <h1 className="mt-1 break-all text-2xl font-bold tracking-tight text-white sm:text-3xl">{sku}</h1>
              <p className="mt-2 text-sm text-slate-400">
                {selectedProduct?.name || 'Familia no especificada'} <span className="mx-1.5 text-slate-600">·</span>
                {wallLabel} <span className="mx-1.5 text-slate-600">·</span>{sizeLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-[#0c0f14] py-1 pl-3 pr-2 text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wide">SKU</span>
              <select
                value={sku}
                disabled={loading}
                onChange={(event) => { setSku(event.target.value); void loadSku(event.target.value); }}
                className="max-w-[min(15rem,55vw)] bg-transparent py-1.5 font-mono text-sm text-white outline-none disabled:opacity-50"
                aria-label="Seleccionar SKU"
              >
                {skus.map((candidate) => <option key={candidate.sku} value={candidate.sku}>{candidate.sku}</option>)}
              </select>
            </label>
            <Badge variant={configured ? 'success' : 'warning'} size="md" className="px-2.5 py-1">
              {configured ? 'CONFIGURADO' : 'SIN CONFIGURAR'}
            </Badge>
          </div>
        </div>
      </header>

      {!configured && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold tracking-wide text-amber-200">SIN CONFIGURAR</span>
                <span className="text-xs text-amber-100/70">Completá los datos requeridos para activar el True Cost.</span>
              </div>
              {missing.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {missing.slice(0, 4).map((item) => (
                    <span key={item} className="rounded border border-amber-900/80 bg-black/15 px-2 py-1 text-[11px] text-amber-100/80">{item}</span>
                  ))}
                  {missing.length > 4 && (
                    <details className="group text-[11px] text-amber-200">
                      <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-1 py-1 hover:text-white">
                        Ver detalles <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                      </summary>
                      <ul className="mt-1 space-y-1 pl-3">
                        {missing.slice(4).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div className="rounded-lg border border-slate-700 bg-[#10141b] px-4 py-3 text-sm text-slate-200" role="status">
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-[#141820] p-5 text-sm text-slate-400">Cargando hoja de costo…</div>
      ) : input && breakdown && (
        <>
          <section aria-label="Resumen de costos">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">Resumen de costos</h2>
                <p className="mt-1 text-xs text-slate-500">Impacto unitario según el breakdown actual</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <article className="relative overflow-hidden rounded-xl border border-brand-500/40 bg-[#191b22] p-4 shadow-sm sm:p-5">
                <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-500" />
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-200">True Cost</div>
                <div className="mt-2 whitespace-nowrap font-mono text-xl font-bold tabular-nums text-white sm:text-2xl">
                  {configured ? `$${breakdown.true_unit_cost_usd.toFixed(5)}` : 'Pendiente'}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">{configured ? 'USD / unidad' : 'Faltan datos requeridos'}</div>
                {configured && fxRate !== null && (
                  <div className="mt-2 font-mono text-xs tabular-nums text-slate-300">Gs. {(breakdown.true_unit_cost_usd * fxRate).toLocaleString('es-PY', { maximumFractionDigits: 0 })} /u</div>
                )}
              </article>
              {[
                { label: 'Materia prima', value: rubricValues.raw_material },
                { label: 'Impresión + troquelado', value: rubricValues.printing_die_cut },
                { label: 'Costos operativos', value: rubricValues.operational },
                { label: 'Merma', value: rubricValues.scrap },
                { label: 'Otros', value: rubricValues.depreciation + rubricValues.packaging, hint: 'Depreciación + embalaje' },
              ].map((metric) => (
                <article key={metric.label} className="min-w-0 rounded-xl border border-slate-800 bg-[#141820] p-4 sm:p-5">
                  <div className="min-h-7 text-[10px] font-bold uppercase leading-4 tracking-[0.1em] text-slate-400">{metric.label}</div>
                  <div className="mt-2 whitespace-nowrap font-mono text-lg font-semibold tabular-nums text-slate-100 sm:text-xl">${metric.value.toFixed(5)}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{metric.hint || 'USD / unidad'}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#11161d] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-bold text-white">Parámetros de cotización</h2>
              <p className="mt-1 text-xs text-slate-500">Volumen usado por el cálculo del lote</p>
            </div>
            <div className="w-full sm:max-w-xs">
              <NumberField label="Tamaño de lote" suffix="unidades" value={input.batch_size} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ batch_size: value })} />
            </div>
          </section>

          <section aria-labelledby="raw-material-heading">
            <div className="mb-3">
              <h2 id="raw-material-heading" className="text-sm font-bold uppercase tracking-[0.12em] text-white">Materia prima</h2>
              <p className="mt-1 text-xs text-slate-500">Papel cuerpo y fondo, organizados por material</p>
            </div>
            <RubricCard
              title="Materia prima"
              config={rawConfig}
              impact={rubricValues.raw_material}
              onEnabledChange={(enabled) => updateRubric('raw_material', { enabled })}
              onSourceChange={(source) => updateRubric('raw_material', { source })}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-lg border border-slate-800 bg-[#10141a] p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-100">Papel cuerpo</h3>
                      <p className="mt-1 text-[11px] text-slate-500">Cono · precio, gramaje y rendimiento</p>
                    </div>
                    <span className="font-mono text-xs text-slate-400">${breakdown.cost_paper_cone_usd.toFixed(5)} /u</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField label="CIF cuerpo" suffix="USD/t" value={input.paper_formula.cif_price_ton_usd} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, cif_price_ton_usd: value } })} />
                    <NumberField label="Gramaje" suffix="gsm" value={input.paper_formula.gsm} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, gsm: value } })} />
                    <NumberField label="Coating" suffix="gsm" value={input.paper_formula.coating_gsm || 0} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, coating_gsm: value } })} />
                    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-300">
                      <span>Método de impresión</span>
                      <select
                        value={input.paper_formula.printing_method}
                        onChange={(event) => updateInput({ paper_formula: { ...input.paper_formula, printing_method: event.target.value as 'OFFSET' | 'FLEXO' } })}
                        className="min-h-11 rounded-md border border-slate-700 bg-[#0c0f14] px-3 text-sm font-semibold text-white outline-none focus:border-brand-500/70"
                      >
                        <option value="OFFSET">OFFSET · pliego</option>
                        <option value="FLEXO">FLEXO · bobina</option>
                      </select>
                    </label>
                    {input.paper_formula.printing_method === 'OFFSET' ? (
                      <>
                        <NumberField label="Ancho pliego" suffix="mm" value={input.paper_formula.sheet_width_mm || 0} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, sheet_width_mm: value } })} />
                        <NumberField label="Largo pliego" suffix="mm" value={input.paper_formula.sheet_height_mm || 0} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, sheet_height_mm: value } })} />
                        <NumberField label="Unidades por pliego" suffix="u/pliego" value={input.paper_formula.units_per_sheet || 0} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, units_per_sheet: value } })} />
                      </>
                    ) : (
                      <>
                        <NumberField label="Ancho bobina" suffix="mm" value={input.paper_formula.web_width_mm || 0} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, web_width_mm: value } })} />
                        <NumberField label="Unidades por metro" suffix="u/m" value={input.paper_formula.units_per_linear_meter || 0} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, units_per_linear_meter: value } })} />
                      </>
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-800 bg-[#10141a] p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-100">Fondo</h3>
                      <p className="mt-1 text-[11px] text-slate-500">Papel de fondo · cálculo por m² o rendimiento</p>
                    </div>
                    <span className="font-mono text-xs text-slate-400">${breakdown.cost_bottom_usd.toFixed(5)} /u</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField label="CIF fondo" suffix="USD/t" value={bottomFormula.cif_price_ton_usd || input.bottom_paper_cost_ton_usd} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ bottom_paper_cost_ton_usd: value, bottom_formula: { ...bottomFormula, cif_price_ton_usd: value } })} />
                    <NumberField label="Gramaje" suffix="gsm" value={bottomFormula.gsm || 0} emptyWhenZero={emptyValues} onChange={(value) => updateBottomFormula({ gsm: value })} />
                    <NumberField label="Coating" suffix="gsm" value={bottomFormula.coating_gsm || 0} emptyWhenZero={emptyValues} onChange={(value) => updateBottomFormula({ coating_gsm: value })} />
                    <NumberField label="Unidades por m²" suffix="u/m²" value={bottomFormula.units_per_m2 || 0} emptyWhenZero={emptyValues} onChange={(value) => updateBottomFormula({ units_per_m2: value })} />
                  </div>
                </section>
              </div>

              <details className="group mt-4 rounded-lg border border-slate-800 bg-[#10141a]">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-300 hover:text-white [&::-webkit-details-marker]:hidden">
                  Parámetros avanzados de materia prima
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-4 border-t border-slate-800 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  <NumberField label="Despacho cuerpo" suffix="%" value={input.paper_formula.customs_dispatch_percent || 0} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, customs_dispatch_percent: value } })} />
                  <NumberField label="Financiero cuerpo" suffix="%" value={input.paper_formula.financial_cost_percent || 0} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, financial_cost_percent: value } })} />
                  <NumberField label="Rendimiento directo cuerpo" suffix="u/t" value={input.paper_formula.paper_yield_units_per_ton} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ paper_formula: { ...input.paper_formula, paper_yield_units_per_ton: value } })} />
                  <NumberField label="Despacho fondo" suffix="%" value={bottomFormula.customs_dispatch_percent || 0} emptyWhenZero={emptyValues} onChange={(value) => updateBottomFormula({ customs_dispatch_percent: value })} />
                  <NumberField label="Financiero fondo" suffix="%" value={bottomFormula.financial_cost_percent || 0} emptyWhenZero={emptyValues} onChange={(value) => updateBottomFormula({ financial_cost_percent: value })} />
                  <NumberField label="Rendimiento directo fondo" suffix="u/t" value={input.bottom_yield_units_per_ton} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ bottom_yield_units_per_ton: value })} />
                  <NumberField label="Ancho pliego fondo" suffix="mm" value={bottomFormula.sheet_width_mm || 0} emptyWhenZero={emptyValues} onChange={(value) => updateBottomFormula({ sheet_width_mm: value })} />
                  <NumberField label="Largo pliego fondo" suffix="mm" value={bottomFormula.sheet_height_mm || 0} emptyWhenZero={emptyValues} onChange={(value) => updateBottomFormula({ sheet_height_mm: value })} />
                  <NumberField label="Unidades por pliego fondo" suffix="u/pliego" value={bottomFormula.units_per_sheet || 0} emptyWhenZero={emptyValues} onChange={(value) => updateBottomFormula({ units_per_sheet: value })} />
                </div>
              </details>
            </RubricCard>
          </section>

          <section aria-labelledby="direct-cost-heading">
            <div className="mb-3">
              <h2 id="direct-cost-heading" className="text-sm font-bold uppercase tracking-[0.12em] text-white">Costos directos</h2>
              <p className="mt-1 text-xs text-slate-500">Cada rubro conserva su fuente, estado e impacto independiente</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <RubricCard
                title="Impresión + troquelado"
                config={printingConfig}
                impact={rubricValues.printing_die_cut}
                unitLabel={input.printing_cost_mode === 'PER_UNIT' ? 'USD / unidad' : input.printing_cost_mode === 'TOTAL_BATCH' ? 'USD / lote' : 'USD / 1.000'}
                onEnabledChange={(enabled) => updateRubric('printing_die_cut', { enabled })}
                onSourceChange={(source) => updateRubric('printing_die_cut', { source })}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-300">
                    <span>Método de cotización</span>
                    <select
                      value={input.printing_cost_mode}
                      onChange={(event) => updateInput({ printing_cost_mode: event.target.value as IndustrialProductCostInput['printing_cost_mode'] })}
                      className="min-h-11 rounded-md border border-slate-700 bg-[#0c0f14] px-3 text-sm text-white outline-none focus:border-brand-500/70"
                    >
                      <option value="PER_THOUSAND">USD / 1.000</option>
                      <option value="PER_UNIT">USD / unidad</option>
                      <option value="TOTAL_BATCH">USD lote total</option>
                    </select>
                  </label>
                  <NumberField
                    label="Valor cotizado"
                    suffix={input.printing_cost_mode === 'PER_UNIT' ? 'USD/u' : input.printing_cost_mode === 'TOTAL_BATCH' ? 'USD/lote' : 'USD/1.000'}
                    value={input.quoted_printing_rate_usd}
                    emptyWhenZero={emptyValues}
                    onChange={(value) => updateInput({ quoted_printing_rate_usd: value })}
                  />
                </div>
              </RubricCard>

              <RubricCard
                title="Costos operativos"
                config={operationalConfig}
                impact={rubricValues.operational}
                onEnabledChange={(enabled) => updateRubric('operational', { enabled })}
                onSourceChange={(source) => updateRubric('operational', { source })}
              >
                <NumberField label="Costo operativo" suffix="USD/1.000" value={input.operational_cost_per_thousand_usd} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ operational_cost_per_thousand_usd: value })} />
              </RubricCard>

              <RubricCard
                title="Merma"
                config={scrapConfig}
                impact={rubricValues.scrap}
                unitLabel="% sobre materia prima"
                onEnabledChange={(enabled) => updateRubric('scrap', { enabled })}
                onSourceChange={(source) => updateRubric('scrap', { source })}
              >
                <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                  <NumberField label="Merma" suffix="%" value={input.scrap_rate_percent} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ scrap_rate_percent: value })} />
                  <div className="rounded-md border border-slate-800 bg-[#0c0f14] px-3 py-2.5">
                    <div className="text-[11px] text-slate-500">Impacto sobre materia prima</div>
                    <div className="mt-1 font-mono text-sm tabular-nums text-rose-300">${breakdown.cost_scrap_usd.toFixed(5)} /u</div>
                  </div>
                </div>
              </RubricCard>

              <RubricCard
                title="Depreciación"
                config={depreciationConfig}
                impact={rubricValues.depreciation}
                onEnabledChange={(enabled) => updateRubric('depreciation', { enabled })}
                onSourceChange={(source) => updateRubric('depreciation', { source })}
              >
                <NumberField label="Costo de depreciación" suffix="USD/1.000" value={input.machine_depreciation_per_thousand_usd} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ machine_depreciation_per_thousand_usd: value })} />
              </RubricCard>

              <RubricCard
                title="Embalaje"
                config={packagingConfig}
                impact={rubricValues.packaging}
                onEnabledChange={(enabled) => updateRubric('packaging', { enabled })}
                onSourceChange={(source) => updateRubric('packaging', { source })}
              >
                <NumberField label="Costo de embalaje" suffix="USD/1.000" value={input.packaging_cost_per_thousand_usd} emptyWhenZero={emptyValues} onChange={(value) => updateInput({ packaging_cost_per_thousand_usd: value })} />
              </RubricCard>
            </div>
          </section>

          <footer className="rounded-xl border border-brand-500/40 bg-[#171a21] p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200">True Cost final</div>
                {configured ? (
                  <>
                    <div className="mt-2 font-mono text-3xl font-bold tracking-tight tabular-nums text-white sm:text-4xl">${breakdown.true_unit_cost_usd.toFixed(5)} <span className="text-base font-medium text-slate-400">USD / unidad</span></div>
                    {fxRate !== null && <div className="mt-1 font-mono text-sm tabular-nums text-slate-300">Gs. {(breakdown.true_unit_cost_usd * fxRate).toLocaleString('es-PY', { maximumFractionDigits: 0 })} / unidad</div>}
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">
                      <span>Lote: <strong className="font-mono font-semibold text-slate-200">${breakdown.batch_total_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</strong></span>
                      <span>{input.batch_size.toLocaleString('es-PY')} unidades</span>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-lg font-semibold text-amber-200">Pendiente de configuración</div>
                )}
              </div>
              <Button variant="primary" size="md" onClick={save} disabled={saving || !input} className="min-h-11 shrink-0 px-5 font-bold uppercase tracking-wide">
                <Save className="h-4 w-4" />{saving ? 'Guardando…' : 'Guardar hoja de costo'}
              </Button>
            </div>
          </footer>

          {configured && <div className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Hoja activa y trazable en seis rubros.</div>}
          {marketBenchmarkUSD && marketBenchmarkUSD > 0 && <div className="text-xs text-slate-500">Benchmark real disponible: <span className="font-mono">${marketBenchmarkUSD.toFixed(4)} USD/u</span>.</div>}
        </>
      )}
    </div>
  );
}
