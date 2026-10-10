'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import {
  applyRawMaterial,
  bottomDiverges,
  DEFAULT_CUSTOMS_PERCENT,
  DEFAULT_FINANCIAL_PERCENT,
  readRawMaterial,
  type RawMaterialPatch,
} from '@/lib/cost/raw-material';
import type {
  CostInputSource,
  CostSheetVersion,
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
type SummaryCurrency = 'USD' | 'PYG' | 'BOTH';
type ActiveInputCurrency = 'USD' | 'PYG';

function emptyInput(sku: string): IndustrialProductCostInput {
  return {
    sku,
    paper_formula: {
      cif_price_ton_usd: 0,
      customs_dispatch_percent: DEFAULT_CUSTOMS_PERCENT,
      financial_cost_percent: DEFAULT_FINANCIAL_PERCENT,
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
      customs_dispatch_percent: DEFAULT_CUSTOMS_PERCENT,
      financial_cost_percent: DEFAULT_FINANCIAL_PERCENT,
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
    operational_process_enabled: false,
    packaging_process_enabled: false,
    process_operational_cost_per_thousand_usd: 0,
    process_packaging_cost_per_thousand_usd: 0,
    batch_size: 0,
    currency_mode: 'BOTH',
    input_currency: 'USD',
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
  secondaryText,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  emptyWhenZero?: boolean;
  secondaryText?: string;
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
      {secondaryText && (
        <span className="text-[11px] font-mono text-slate-400 mt-0.5 block">{secondaryText}</span>
      )}
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  suffix,
  tone,
  secondaryText,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: 'rose' | 'emerald';
  secondaryText?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-300">
      <span>{label}</span>
      <span className="flex min-h-11 items-center rounded-md border border-slate-800 bg-[#10141b]">
        <span
          className={`min-w-0 flex-1 truncate px-3 py-2.5 font-mono text-sm tabular-nums ${
            tone === 'rose'
              ? 'text-rose-300'
              : tone === 'emerald'
              ? 'text-emerald-300'
              : 'text-slate-100'
          }`}
        >
          {value}
        </span>
        {suffix && <span className="shrink-0 px-3 text-[11px] font-normal text-slate-500">{suffix}</span>}
      </span>
      {secondaryText && (
        <span className="text-[11px] font-mono text-slate-400 mt-0.5 block">{secondaryText}</span>
      )}
    </div>
  );
}

function rubricConfig(input: IndustrialProductCostInput, key: CostV1RubricKey): CostV1RubricConfig {
  return { ...rubricDefaults[key], ...input.rubrics?.[key] };
}

function RubricCard({
  title,
  config,
  impactUsd,
  impactPyg,
  summaryCurrency,
  fxRate,
  onEnabledChange,
  onSourceChange,
  headerExtra,
  children,
}: {
  title: string;
  config: CostV1RubricConfig;
  impactUsd: number;
  impactPyg?: number;
  summaryCurrency: SummaryCurrency;
  fxRate: number | null;
  onEnabledChange: (enabled: boolean) => void;
  onSourceChange?: (source: CostInputSource) => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border p-4 sm:p-5 ${
        config.enabled
          ? 'border-slate-700/90 bg-[#141820]'
          : 'border-slate-800 bg-[#10141b] opacity-75'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-slate-800 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
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
            {config.source === 'PROCESS' && (
              <span className="rounded bg-brand-500/20 border border-brand-500/40 px-2 py-0.5 text-[10px] font-bold text-brand-300">
                PROCESOS
              </span>
            )}
            {headerExtra}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Impacto unitario
          </div>
          <div
            className={`mt-1 whitespace-nowrap font-mono text-base sm:text-lg font-semibold tabular-nums ${
              config.enabled ? 'text-emerald-300' : 'text-slate-500'
            }`}
          >
            {summaryCurrency === 'PYG' && fxRate !== null && impactPyg !== undefined ? (
              <span>Gs. {impactPyg.toLocaleString('es-PY')}<span className="ml-1 text-xs font-normal text-slate-500">/u</span></span>
            ) : (
              <span>${impactUsd.toFixed(5)}<span className="ml-1 text-xs font-normal text-slate-500">/u</span></span>
            )}
          </div>
          {summaryCurrency === 'BOTH' && fxRate !== null && impactPyg !== undefined && (
            <div className="text-[11px] font-mono text-slate-400">
              Gs. {impactPyg.toLocaleString('es-PY')} /u
            </div>
          )}
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
  const [summaryCurrency, setSummaryCurrency] = useState<SummaryCurrency>('BOTH');
  const [inputCurrency, setInputCurrency] = useState<ActiveInputCurrency>('USD');
  const [loading, setLoading] = useState(true);
  const [officialSheet, setOfficialSheet] = useState<CostSheetVersion | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING_DRAFT' | 'SAVED_DRAFT' | 'ERROR'>('IDLE');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentInputRef = useRef<IndustrialProductCostInput | null>(null);
  const skuRef = useRef(sku);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Keep refs up to date
  useEffect(() => {
    skuRef.current = sku;
  }, [sku]);

  useEffect(() => {
    currentInputRef.current = input;
  }, [input]);

  // Keep inputCurrency in sync when user explicitly switches to single currency mode
  useEffect(() => {
    if (summaryCurrency === 'USD') setInputCurrency('USD');
    else if (summaryCurrency === 'PYG' && fxRate !== null) setInputCurrency('PYG');
  }, [summaryCurrency, fxRate]);

  // Core persistence function with concurrent write protection
  const persist = async (
    targetInput: IndustrialProductCostInput,
    publishOfficial = false
  ) => {
    // Prevent cross-SKU race conditions
    if (targetInput.sku !== skuRef.current) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const currentReqId = ++requestIdRef.current;
    if (publishOfficial) setPublishing(true);
    else setSaveStatus('SAVING_DRAFT');

    try {
      const response = await fetch('/api/cost/industrial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: targetInput, publishOfficial }),
        signal: abortController.signal,
      });
      const data = await response.json();

      if (currentReqId !== requestIdRef.current) return;
      if (targetInput.sku !== skuRef.current) return;

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Error al persistir');
      }

      setConfigured(Boolean(data.configured));
      setMissing(data.missing_configuration || []);

      if (publishOfficial) {
        setOfficialSheet(data.sheet || null);
        setFeedback('✓ Hoja oficial publicada y activada con éxito en Cost Intelligence.');
        setSaveStatus('IDLE');
        if (data.breakdown && onCostUpdated) {
          onCostUpdated(data.breakdown.true_unit_cost_usd);
        }
      } else {
        setSaveStatus('SAVED_DRAFT');
        setFeedback(null);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Stale in-flight request aborted
      }
      if (currentReqId !== requestIdRef.current) return;
      setSaveStatus('ERROR');
      setFeedback(error instanceof Error ? error.message : 'Error al guardar configuración');
    } finally {
      if (publishOfficial) setPublishing(false);
    }
  };

  const triggerAutosave = (nextInput: IndustrialProductCostInput, isImmediate = false) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (isImmediate) {
      void persist(nextInput, false);
    } else {
      setSaveStatus('SAVING_DRAFT');
      debounceTimerRef.current = setTimeout(() => {
        void persist(nextInput, false);
      }, 600);
    }
  };

  const loadSku = async (targetSku: string) => {
    if (!targetSku) return;
    setLoading(true);
    setFeedback(null);
    setSaveStatus('IDLE');

    try {
      const response = await fetch(`/api/cost/industrial?sku=${encodeURIComponent(targetSku)}`);
      const data = await response.json();
      if (response.ok) {
        const loadedInput = data.input || emptyInput(targetSku);
        setInput(loadedInput);
        setConfigured(Boolean(data.configured));
        setMissing(data.breakdown?.missing_configuration || []);
        setOfficialSheet(data.officialSheet || null);
        if (loadedInput.currency_mode) {
          setSummaryCurrency(loadedInput.currency_mode);
        }
        if (loadedInput.input_currency) {
          setInputCurrency(loadedInput.input_currency);
        }
      } else {
        setInput(null);
        setConfigured(false);
        setMissing([]);
        setOfficialSheet(null);
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
    ])
      .then(([skuData, fxData]) => {
        if (!active) return;
        const activeSkus = (skuData.skus || skuData.products || []) as ProductAttribute[];
        setSkus(activeSkus);
        setProducts((skuData.products || []) as Product[]);
        const rate = typeof fxData.costingRate === 'number' && fxData.costingRate > 0 ? fxData.costingRate : null;
        setFxRate(rate);

        const selected = activeSkus.some((candidate) => candidate.sku === (initialSku || sku))
          ? initialSku || sku
          : activeSkus[0]?.sku || '';
        setSku(selected);
        if (selected) void loadSku(selected);
        else setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setFeedback('No se pudo cargar el Maestro de Productos & SKUs.');
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSku]);

  const breakdown = useMemo(() => {
    if (!input) return null;
    return IndustrialCostEngine.calculateCost({
      ...input,
      currency_mode: summaryCurrency,
      fx_rate_applied: fxRate ?? undefined,
    });
  }, [input, summaryCurrency, fxRate]);

  const updateInput = (updates: Partial<IndustrialProductCostInput>, isImmediate = false) => {
    setInput((current) => {
      if (!current) return current;
      const next: IndustrialProductCostInput = {
        ...current,
        ...updates,
        currency_mode: summaryCurrency,
        input_currency: inputCurrency,
        fx_rate_applied: fxRate ?? undefined,
      };
      triggerAutosave(next, isImmediate);
      return next;
    });
  };

  const updateRubric = (key: CostV1RubricKey, updates: Partial<CostV1RubricConfig>) => {
    setInput((current) => {
      if (!current) return current;
      const next: IndustrialProductCostInput = {
        ...current,
        rubrics: {
          ...current.rubrics,
          [key]: { ...current.rubrics?.[key], ...updates },
        },
      };
      triggerAutosave(next, true); // Immediate autosave on toggle
      return next;
    });
  };

  const updateRaw = (patch: RawMaterialPatch, isImmediate = false) => {
    setInput((current) => {
      if (!current) return current;
      const next = applyRawMaterial(current, {
        ...patch,
        fxRate: fxRate ?? 1,
        originalCurrency: inputCurrency,
      });
      triggerAutosave(next, isImmediate);
      return next;
    });
  };

  const updateBottomFormula = (
    updates: Partial<NonNullable<IndustrialProductCostInput['bottom_formula']>>,
    isImmediate = false
  ) => {
    const currentBottom = input?.bottom_formula || emptyInput(sku).bottom_formula!;
    updateInput({ bottom_formula: { ...currentBottom, ...updates } }, isImmediate);
  };

  const toggleOperationalProcess = async (enabled: boolean) => {
    if (!input) return;
    if (enabled) {
      // 1. Immediately toggle the switch state ON so UI reacts instantly
      updateInput(
        {
          operational_process_enabled: true,
        },
        true
      );
      try {
        const batchUnits = input.batch_size && input.batch_size > 0 ? input.batch_size : 100000;
        const res = await fetch(
          `/api/cost/processes/calculate?sku=${encodeURIComponent(sku)}&good_units_produced=${batchUnits}`
        );
        const data = await res.json();
        if (data.success && data.calculation && Number(data.calculation.operational_total_usd_per_thousand) > 0) {
          updateInput(
            {
              operational_process_enabled: true,
              process_operational_cost_per_thousand_usd: Number(data.calculation.operational_total_usd_per_thousand),
              process_calculation_detail: data.calculation,
              process_snapshot_id: data.calculation.snapshot_id || undefined,
            },
            true
          );
          setFeedback('✓ Cálculo de Procesos activado para Costos Operativos.');
        } else {
          setFeedback('Cálculo de Procesos activado. Podés configurar los parámetros de planta en Costos → Procesos.');
        }
      } catch (err) {
        console.error('Error fetching process calculation', err);
        setFeedback('Cálculo de Procesos activado (sincronización pendiente).');
      }
    } else {
      updateInput(
        {
          operational_process_enabled: false,
        },
        true
      );
      setFeedback('Cálculo manual activado para Costos Operativos.');
    }
  };

  const togglePackagingProcess = async (enabled: boolean) => {
    if (!input) return;
    if (enabled) {
      // 1. Immediately toggle the switch state ON so UI reacts instantly
      updateInput(
        {
          packaging_process_enabled: true,
        },
        true
      );
      try {
        const batchUnits = input.batch_size && input.batch_size > 0 ? input.batch_size : 100000;
        const res = await fetch(
          `/api/cost/processes/calculate?sku=${encodeURIComponent(sku)}&good_units_produced=${batchUnits}`
        );
        const data = await res.json();
        if (data.success && data.calculation && Number(data.calculation.packaging_total_usd_per_thousand) > 0) {
          updateInput(
            {
              packaging_process_enabled: true,
              process_packaging_cost_per_thousand_usd: Number(data.calculation.packaging_total_usd_per_thousand),
              process_calculation_detail: data.calculation,
              process_snapshot_id: data.calculation.snapshot_id || undefined,
            },
            true
          );
          setFeedback('✓ Cálculo de Procesos activado para Embalaje.');
        } else {
          setFeedback('Cálculo de Procesos activado. Podés registrar sesiones de empaque en Costos → Procesos.');
        }
      } catch (err) {
        console.error('Error fetching process calculation', err);
        setFeedback('Cálculo de Embalaje activado (sincronización pendiente).');
      }
    } else {
      updateInput(
        {
          packaging_process_enabled: false,
        },
        true
      );
      setFeedback('Cálculo manual activado para Embalaje.');
    }
  };

  // Monetary field helpers (USD <-> Gs.)
  const getMonetaryValue = (usdVal: number, originalVal?: number): number => {
    if (inputCurrency === 'PYG') {
      if (originalVal !== undefined && Number.isFinite(originalVal)) return originalVal;
      return fxRate !== null && fxRate > 0 ? Math.round(usdVal * fxRate) : 0;
    }
    return usdVal;
  };

  const getMonetarySuffix = (baseSuffix: 't' | '1000' | 'u' | 'lote'): string => {
    if (inputCurrency === 'PYG') {
      switch (baseSuffix) {
        case 't':
          return 'Gs./t';
        case '1000':
          return 'Gs./1.000';
        case 'u':
          return 'Gs./u';
        case 'lote':
          return 'Gs./lote';
      }
    }
    switch (baseSuffix) {
      case 't':
        return 'USD/t';
      case '1000':
        return 'USD/1.000';
      case 'u':
        return 'USD/u';
      case 'lote':
        return 'USD/lote';
    }
  };

  const getSecondaryEquivalence = (usdVal: number): string | undefined => {
    if (summaryCurrency !== 'BOTH' || fxRate === null) return undefined;
    if (inputCurrency === 'USD') {
      return `≈ Gs. ${Math.round(usdVal * fxRate).toLocaleString('es-PY')}`;
    }
    return `≈ $${usdVal.toFixed(2)} USD`;
  };

  const handleMonetaryChange = (
    val: number,
    setter: (usdValue: number, originalValue: number) => void
  ) => {
    if (inputCurrency === 'PYG') {
      const usdEquivalent = fxRate !== null && fxRate > 0 ? Number((val / fxRate).toFixed(6)) : 0;
      setter(usdEquivalent, val);
    } else {
      setter(val, val);
    }
  };

  const handleSkuChange = async (newSku: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSaveStatus('IDLE');
    setSku(newSku);
    skuRef.current = newSku;
    void loadSku(newSku);
  };

  if (!sku && !loading) {
    return (
      <div className="rounded-lg border border-amber-800/70 bg-amber-950/20 p-5 text-sm text-amber-200">
        No hay SKUs activos en el Maestro de Productos & SKUs.
      </div>
    );
  }

  const selectedAttribute = skus.find((candidate) => candidate.sku === sku);
  const selectedProduct = products.find((product) => product.id === selectedAttribute?.product_id);
  const wallLabel =
    selectedAttribute?.wall_type === 'single'
      ? 'Pared simple'
      : selectedAttribute?.wall_type === 'double'
      ? 'Pared doble'
      : 'N/A';
  const sizeLabel = selectedAttribute?.size_oz
    ? `${selectedAttribute.size_oz} oz`
    : selectedAttribute?.size_ml
    ? `${selectedAttribute.size_ml} ml`
    : 'Tamaño no especificado';

  const rawConfig = input ? rubricConfig(input, 'raw_material') : rubricDefaults.raw_material;
  const printingConfig = input ? rubricConfig(input, 'printing_die_cut') : rubricDefaults.printing_die_cut;
  const operationalConfig = input ? rubricConfig(input, 'operational') : rubricDefaults.operational;
  const scrapConfig = input ? rubricConfig(input, 'scrap') : rubricDefaults.scrap;
  const depreciationConfig = input ? rubricConfig(input, 'depreciation') : rubricDefaults.depreciation;
  const packagingConfig = input ? rubricConfig(input, 'packaging') : rubricDefaults.packaging;
  const bottomFormula = input?.bottom_formula || emptyInput(sku).bottom_formula!;
  const emptyValues = !configured;
  const raw = readRawMaterial(input ?? emptyInput(sku));
  const bottomDivergent = input ? bottomDiverges(input) : false;

  const rubricValuesUsd: Record<CostV1RubricKey, number> = {
    raw_material: breakdown?.rubrics?.find((r) => r.key === 'raw_material')?.impact_usd_per_unit || 0,
    printing_die_cut: breakdown?.rubrics?.find((r) => r.key === 'printing_die_cut')?.impact_usd_per_unit || 0,
    operational: breakdown?.rubrics?.find((r) => r.key === 'operational')?.impact_usd_per_unit || 0,
    scrap: breakdown?.rubrics?.find((r) => r.key === 'scrap')?.impact_usd_per_unit || 0,
    depreciation: breakdown?.rubrics?.find((r) => r.key === 'depreciation')?.impact_usd_per_unit || 0,
    packaging: breakdown?.rubrics?.find((r) => r.key === 'packaging')?.impact_usd_per_unit || 0,
  };

  const rubricValuesPyg: Record<CostV1RubricKey, number> = {
    raw_material: fxRate ? Math.round(rubricValuesUsd.raw_material * fxRate) : 0,
    printing_die_cut: fxRate ? Math.round(rubricValuesUsd.printing_die_cut * fxRate) : 0,
    operational: fxRate ? Math.round(rubricValuesUsd.operational * fxRate) : 0,
    scrap: fxRate ? Math.round(rubricValuesUsd.scrap * fxRate) : 0,
    depreciation: fxRate ? Math.round(rubricValuesUsd.depreciation * fxRate) : 0,
    packaging: fxRate ? Math.round(rubricValuesUsd.packaging * fxRate) : 0,
  };

  return (
    <div className="space-y-5 [zoom:0.9] origin-top">
      {/* Header with SKU Selector and Status */}
      <header className="rounded-xl border border-slate-800 bg-[#141820] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-500/30 bg-brand-950/50 text-brand-300">
              <Calculator className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Hoja de costo
              </div>
              <h1 className="mt-1 break-all text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {sku}
              </h1>
              <p className="mt-1.5 text-xs text-slate-400">
                {selectedProduct?.name || 'Familia no especificada'}{' '}
                <span className="mx-1.5 text-slate-600">·</span>
                {wallLabel} <span className="mx-1.5 text-slate-600">·</span>
                {sizeLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            {/* Draft Autosave Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-[#0c0f14] text-xs">
              {saveStatus === 'SAVING_DRAFT' ? (
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
                  <span>Guardando borrador…</span>
                </span>
              ) : saveStatus === 'SAVED_DRAFT' ? (
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Borrador guardado</span>
                </span>
              ) : saveStatus === 'ERROR' ? (
                <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Error al guardar</span>
                </span>
              ) : (
                <span className="text-slate-400 text-[11px]">Borrador sincronizado</span>
              )}
            </div>

            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-[#0c0f14] py-1 pl-3 pr-2 text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wide">SKU</span>
              <select
                value={sku}
                disabled={loading}
                onChange={(event) => void handleSkuChange(event.target.value)}
                className="max-w-[min(15rem,55vw)] bg-transparent py-1.5 font-mono text-sm text-white outline-none disabled:opacity-50"
                aria-label="Seleccionar SKU"
              >
                {skus.map((candidate) => (
                  <option key={candidate.sku} value={candidate.sku} className="bg-[#141820]">
                    {candidate.sku}
                  </option>
                ))}
              </select>
            </label>

            <Badge variant={configured ? 'success' : 'warning'} size="md" className="px-2.5 py-1">
              {configured ? 'CONFIGURADO' : 'SIN CONFIGURAR'}
            </Badge>
          </div>
        </div>
      </header>

      {/* Warning when unconfigured */}
      {!configured && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3.5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold tracking-wide text-amber-200">SIN CONFIGURAR</span>
                <span className="text-xs text-amber-100/70">
                  Completá los datos requeridos para calcular el True Cost.
                </span>
              </div>
              {missing.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {missing.slice(0, 4).map((item) => (
                    <span
                      key={item}
                      className="rounded border border-amber-900/80 bg-black/15 px-2 py-1 text-[11px] text-amber-100/80"
                    >
                      {item}
                    </span>
                  ))}
                  {missing.length > 4 && (
                    <details className="group text-[11px] text-amber-200">
                      <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-1 py-1 hover:text-white">
                        Ver detalles <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                      </summary>
                      <ul className="mt-1 space-y-1 pl-3">
                        {missing.slice(4).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-xs sm:text-sm ${
            feedback.startsWith('✓')
              ? 'border-emerald-700 bg-emerald-950/30 text-emerald-200'
              : 'border-slate-700 bg-[#10141b] text-slate-200'
          }`}
          role="status"
        >
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-[#141820] p-8 text-center text-sm text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-brand-400 mb-2" />
          Cargando hoja de costo…
        </div>
      ) : (
        input &&
        breakdown && (
          <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
            {/* RIGHT COLUMN: Resumen de Costos Sticky */}
            <aside
              aria-label="Resumen de costos"
              className="min-w-0 space-y-4 xl:col-start-2 xl:row-start-1 xl:sticky xl:top-4"
            >
              {/* TRUE COST TOTAL Highlighted Card */}
              <article className="niu-kpi relative overflow-hidden rounded-xl border-2 border-brand-500/50 bg-[#161c26] p-5 shadow-lg">
                <span className="absolute inset-x-0 top-0 h-1 bg-brand-500" />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-300">
                    TRUE COST TOTAL
                  </span>
                  {officialSheet && (
                    <Badge variant="success" size="sm">
                      HOJA OFICIAL v{officialSheet.version}
                    </Badge>
                  )}
                </div>

                {/* Primary Figure */}
                <div className="mt-3">
                  {configured ? (
                    summaryCurrency === 'PYG' && fxRate !== null ? (
                      <div>
                        <div className="whitespace-nowrap font-mono text-2xl sm:text-3xl font-extrabold tabular-nums text-white">
                          Gs. {Math.round(breakdown.true_unit_cost_usd * fxRate).toLocaleString('es-PY')}
                          <span className="text-xs font-normal text-slate-400 ml-1.5">/ unidad</span>
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-400">
                          ${breakdown.true_unit_cost_usd.toFixed(5)} USD / unidad
                        </div>
                      </div>
                    ) : summaryCurrency === 'USD' ? (
                      <div>
                        <div className="whitespace-nowrap font-mono text-2xl sm:text-3xl font-extrabold tabular-nums text-white">
                          ${breakdown.true_unit_cost_usd.toFixed(5)}
                          <span className="text-xs font-normal text-slate-400 ml-1.5">/ unidad</span>
                        </div>
                        {fxRate !== null && (
                          <div className="mt-1 font-mono text-xs text-slate-400">
                            Gs. {Math.round(breakdown.true_unit_cost_usd * fxRate).toLocaleString('es-PY')} / unidad
                          </div>
                        )}
                      </div>
                    ) : (
                      // BOTH
                      <div>
                        <div className="whitespace-nowrap font-mono text-2xl sm:text-3xl font-extrabold tabular-nums text-white">
                          {fxRate !== null
                            ? `Gs. ${Math.round(breakdown.true_unit_cost_usd * fxRate).toLocaleString('es-PY')}`
                            : `$${breakdown.true_unit_cost_usd.toFixed(5)}`}
                          <span className="text-xs font-normal text-slate-400 ml-1.5">/ unidad</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between font-mono text-xs text-slate-300">
                          <span>${breakdown.true_unit_cost_usd.toFixed(5)} USD/u</span>
                          {fxRate !== null && (
                            <span className="text-[10px] text-slate-500 font-sans">
                              (FX: Gs. {fxRate.toLocaleString('es-PY')})
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="text-amber-400 font-bold text-lg">Cálculo pendiente</div>
                  )}
                </div>

                <div className="mt-2 text-[11px] text-slate-400">
                  {configured ? 'Costo unitario industrial total consolidado' : 'Faltan parámetros indispensables'}
                </div>
              </article>

              {/* DESGLOSE POR RUBRO */}
              <article className="niu-kpi rounded-xl border border-slate-800 bg-[#141820] p-4 sm:p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    DESGLOSE POR RUBRO
                  </h3>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                    {summaryCurrency === 'PYG' ? 'Gs. / u' : summaryCurrency === 'USD' ? 'USD / u' : 'Ambos'}
                  </span>
                </div>

                <div className="divide-y divide-slate-800/80">
                  {[
                    { key: 'raw_material', label: 'Materia prima', usd: rubricValuesUsd.raw_material, pyg: rubricValuesPyg.raw_material, enabled: rawConfig.enabled },
                    { key: 'printing_die_cut', label: 'Impresión + troquelado', usd: rubricValuesUsd.printing_die_cut, pyg: rubricValuesPyg.printing_die_cut, enabled: printingConfig.enabled },
                    { key: 'operational', label: 'Costos operativos', usd: rubricValuesUsd.operational, pyg: rubricValuesPyg.operational, enabled: operationalConfig.enabled },
                    { key: 'scrap', label: 'Merma', usd: rubricValuesUsd.scrap, pyg: rubricValuesPyg.scrap, enabled: scrapConfig.enabled },
                    { key: 'depreciation', label: 'Depreciación', usd: rubricValuesUsd.depreciation, pyg: rubricValuesPyg.depreciation, enabled: depreciationConfig.enabled },
                    { key: 'packaging', label: 'Embalaje', usd: rubricValuesUsd.packaging, pyg: rubricValuesPyg.packaging, enabled: packagingConfig.enabled },
                  ].map((rubric) => (
                    <div
                      key={rubric.key}
                      className={`flex min-w-0 items-center justify-between gap-3 py-2.5 text-xs ${
                        rubric.enabled ? 'text-slate-200' : 'text-slate-500 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-medium truncate">{rubric.label}</span>
                        {!rubric.enabled && (
                          <span className="text-[10px] text-slate-500 font-mono">(OFF)</span>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end font-mono font-semibold tabular-nums text-slate-100 text-xs sm:text-sm">
                        {summaryCurrency === 'PYG' && fxRate !== null ? (
                          <span>Gs. {rubric.pyg.toLocaleString('es-PY')}<span className="text-[10px] text-slate-400 font-normal ml-0.5">/u</span></span>
                        ) : summaryCurrency === 'USD' ? (
                          <span>${rubric.usd.toFixed(5)}<span className="text-[10px] text-slate-400 font-normal ml-0.5">/u</span></span>
                        ) : (
                          <>
                            <span>${rubric.usd.toFixed(5)}<span className="text-[10px] text-slate-400 font-normal ml-0.5">/u</span></span>
                            {fxRate !== null && (
                              <span className="text-[10px] font-normal text-slate-400">
                                Gs. {rubric.pyg.toLocaleString('es-PY')} /u
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              {/* TOTAL DEL LOTE */}
              <article className="niu-kpi rounded-xl border border-slate-800 bg-[#141820] p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">Total del lote</span>
                  <div className="text-right font-mono font-bold tabular-nums text-white text-sm sm:text-base">
                    {summaryCurrency === 'PYG' && fxRate !== null ? (
                      <span>Gs. {Math.round(breakdown.batch_total_cost_usd * fxRate).toLocaleString('es-PY')}</span>
                    ) : (
                      <span>
                        ${breakdown.batch_total_cost_usd.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        USD
                      </span>
                    )}
                    {summaryCurrency === 'BOTH' && fxRate !== null && (
                      <span className="block text-xs font-normal text-slate-400 mt-0.5">
                        Gs. {Math.round(breakdown.batch_total_cost_usd * fxRate).toLocaleString('es-PY')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Lote de {input.batch_size.toLocaleString('es-PY')} unidades
                </div>
              </article>

              {/* Action Buttons: Publicar Hoja Oficial */}
              <div className="space-y-2 pt-1">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => void persist(input, true)}
                  disabled={publishing || !configured}
                  className="min-h-12 w-full justify-center font-bold uppercase tracking-wider text-xs shadow-md"
                >
                  {publishing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Publicando…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Send className="h-4 w-4" /> Publicar Hoja Oficial
                    </span>
                  )}
                </Button>

                <p className="text-[11px] text-slate-500 text-center">
                  Los cambios se guardan automáticamente como borrador. Publicar oficial actualiza el True Cost en el OS.
                </p>
              </div>

              {marketBenchmarkUSD && marketBenchmarkUSD > 0 && (
                <div className="px-1 text-xs text-slate-500">
                  Benchmark de mercado:{' '}
                  <span className="font-mono text-slate-300 font-semibold">${marketBenchmarkUSD.toFixed(4)} USD/u</span>
                </div>
              )}
            </aside>

            {/* LEFT COLUMN: Main Form Inputs */}
            <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
              {/* Parámetros de cotización */}
              <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-[#11161d] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <h2 className="text-sm font-bold text-white">Parámetros de cotización</h2>
                  <p className="mt-1 text-xs text-slate-500">Volumen base utilizado para el cálculo del lote</p>
                </div>
                <div className="w-full sm:max-w-xs">
                  <NumberField
                    label="Tamaño de lote"
                    suffix="unidades"
                    value={input.batch_size}
                    emptyWhenZero={emptyValues}
                    onChange={(value) => updateInput({ batch_size: value })}
                  />
                </div>
              </section>

              {/* CARD 1: MATERIA PRIMA */}
              <section aria-labelledby="raw-material-heading">
                <div className="mb-3">
                  <h2 id="raw-material-heading" className="text-sm font-bold uppercase tracking-[0.12em] text-white">
                    Materia prima
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Costo del papel importado; de ahí se desprenden el cuerpo y el fondo
                  </p>
                </div>

                <RubricCard
                  title="Materia prima"
                  config={rawConfig}
                  impactUsd={rubricValuesUsd.raw_material}
                  impactPyg={rubricValuesPyg.raw_material}
                  summaryCurrency={summaryCurrency}
                  fxRate={fxRate}
                  onEnabledChange={(enabled) => updateRubric('raw_material', { enabled })}
                  onSourceChange={(source) => updateRubric('raw_material', { source })}
                  headerExtra={
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Currency Switcher (USD | Gs. | Ambos) */}
                      <div
                        role="group"
                        aria-label="Selector de Moneda"
                        title={fxRate !== null ? `Tipo de cambio oficial: Gs. ${fxRate.toLocaleString('es-PY')} / USD` : undefined}
                        className="inline-flex min-h-8 items-stretch rounded-md border border-slate-700 bg-[#0c0f14] p-0.5"
                      >
                        {(
                          [
                            ['USD', 'USD'],
                            ['PYG', 'Gs.'],
                            ['BOTH', 'Ambos'],
                          ] as const
                        ).map(([currency, label]) => (
                          <button
                            key={currency}
                            type="button"
                            aria-pressed={summaryCurrency === currency}
                            disabled={currency !== 'USD' && fxRate === null}
                            title={currency !== 'USD' && fxRate === null ? 'Cotización USD/guaraní no disponible' : undefined}
                            onClick={() => {
                              setSummaryCurrency(currency);
                              updateInput({ currency_mode: currency }, true);
                            }}
                            className={`rounded px-2.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              summaryCurrency === currency
                                ? 'bg-brand-500 text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* When BOTH is selected, specify which currency is active for input editing */}
                      {summaryCurrency === 'BOTH' && fxRate !== null && (
                        <div className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-[#0a0d12] px-2 py-1 text-[10px]">
                          <span className="text-slate-500 uppercase tracking-wider">Editando en:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setInputCurrency('USD');
                              updateInput({ input_currency: 'USD' }, true);
                            }}
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              inputCurrency === 'USD' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            USD
                          </button>
                          <span className="text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              setInputCurrency('PYG');
                              updateInput({ input_currency: 'PYG' }, true);
                            }}
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              inputCurrency === 'PYG' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Gs.
                          </button>
                        </div>
                      )}

                      {/* MÉTODO DE IMPRESIÓN (OFFSET / FLEXO) - Neon green highlight */}
                      <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-[#07130e] px-2.5 py-1 shadow-sm">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                          MÉTODO DE IMPRESIÓN:
                        </span>
                        <select
                          value={input.paper_formula.printing_method}
                          onChange={(e) =>
                            updateInput(
                              {
                                paper_formula: {
                                  ...input.paper_formula,
                                  printing_method: e.target.value as 'OFFSET' | 'FLEXO',
                                },
                              },
                              true
                            )
                          }
                          className="bg-transparent text-xs font-bold text-emerald-300 outline-none cursor-pointer"
                          aria-label="Método de impresión"
                        >
                          <option value="OFFSET" className="bg-[#141820] text-white">
                            OFFSET · pliego
                          </option>
                          <option value="FLEXO" className="bg-[#141820] text-white">
                            FLEXO · bobina
                          </option>
                        </select>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-5">
                    {/* 1. SECCIÓN: Costo del papel */}
                    <section className="rounded-lg border border-slate-800 bg-[#10141b] p-4 sm:p-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-100">
                            Costo del papel
                          </h3>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Importación · de acá salen el costo del cuerpo y del fondo
                          </p>
                        </div>
                      </div>

                      {/* BLOQUE DESTACADO: COSTO DEL PAPEL PUESTO EN PLANTA */}
                      <div className="niu-kpi rounded-xl border border-brand-500/40 bg-[#0a0e16] p-4 sm:p-5 shadow-inner">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-300">
                          COSTO DEL PAPEL PUESTO EN PLANTA
                        </div>
                        <div className="mt-2 flex flex-wrap items-baseline gap-3">
                          <span className="font-mono text-2xl sm:text-3xl font-extrabold tabular-nums text-white">
                            {summaryCurrency === 'PYG' && fxRate !== null
                              ? `Gs. ${Math.round(raw.landedUsd * fxRate).toLocaleString('es-PY')} / tonelada`
                              : `$${raw.landedUsd.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })} USD / tonelada`}
                          </span>
                          {fxRate !== null && (
                            <span className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-slate-400">
                              {summaryCurrency === 'PYG'
                                ? `($${raw.landedUsd.toFixed(2)} USD/t)`
                                : `(Gs. ${Math.round(raw.landedUsd * fxRate).toLocaleString('es-PY')} /t)`}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          FOB + Flete + Despacho ({raw.customsPercent}%) + Costo Financiero ({raw.financialPercent}%)
                        </div>
                      </div>

                      {/* Inputs de Importación */}
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <NumberField
                          label="FOB"
                          suffix={getMonetarySuffix('t')}
                          value={getMonetaryValue(raw.fob, input.currency_meta?.fob_price_ton_original)}
                          emptyWhenZero={emptyValues}
                          secondaryText={getSecondaryEquivalence(raw.fob)}
                          onChange={(val) =>
                            handleMonetaryChange(val, (usdVal, origVal) => {
                              updateRaw({
                                fob: usdVal,
                                originalFob: origVal,
                                originalCurrency: inputCurrency,
                              });
                            })
                          }
                        />
                        <NumberField
                          label="Flete"
                          suffix={getMonetarySuffix('t')}
                          value={getMonetaryValue(raw.freight, input.currency_meta?.freight_ton_original)}
                          emptyWhenZero={emptyValues}
                          secondaryText={getSecondaryEquivalence(raw.freight)}
                          onChange={(val) =>
                            handleMonetaryChange(val, (usdVal, origVal) => {
                              updateRaw({
                                freight: usdVal,
                                originalFreight: origVal,
                                originalCurrency: inputCurrency,
                              });
                            })
                          }
                        />
                        <ReadOnlyField
                          label="CIF (FOB + flete)"
                          suffix={getMonetarySuffix('t')}
                          value={
                            raw.cif > 0
                              ? inputCurrency === 'PYG' && fxRate !== null
                                ? Math.round(raw.cif * fxRate).toLocaleString('es-PY')
                                : raw.cif.toFixed(2)
                              : '—'
                          }
                          secondaryText={raw.cif > 0 ? getSecondaryEquivalence(raw.cif) : undefined}
                        />
                        <NumberField
                          label="Despacho"
                          suffix="% s/CIF"
                          value={raw.customsPercent}
                          onChange={(val) => updateRaw({ customsPercent: val })}
                        />
                        <NumberField
                          label="Costo del dinero"
                          suffix="% s/CIF"
                          value={raw.financialPercent}
                          onChange={(val) => updateRaw({ financialPercent: val })}
                        />
                      </div>
                    </section>

                    {/* TRAZABILIDAD Y AUDITORÍA DE MATERIA PRIMA (Explica de dónde sale el costo) */}
                    <div className="rounded-xl border border-slate-800 bg-[#0c1017] p-4 text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-brand-400" />
                          <h4 className="font-bold uppercase tracking-wider text-slate-200 text-xs">
                            COSTO DE MATERIA PRIMA POR UNIDAD
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowTrace(!showTrace)}
                          className="text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1"
                        >
                          {showTrace ? 'Ocultar cálculo detallado' : 'Ver cálculo detallado'}
                          {showTrace ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3 pt-1">
                        <div className="rounded-lg bg-[#141820] p-3 border border-slate-800">
                          <span className="text-[11px] text-slate-400 block mb-1">Papel cuerpo:</span>
                          {breakdown.cost_paper_cone_status === 'COMPLETE' ? (
                            <div>
                              <div className="font-mono font-bold text-white text-base">
                                {summaryCurrency === 'PYG' && fxRate !== null
                                  ? `Gs. ${Math.round(breakdown.cost_paper_cone_usd * fxRate).toLocaleString('es-PY')} /u`
                                  : `$${breakdown.cost_paper_cone_usd.toFixed(5)} /u`}
                              </div>
                              {summaryCurrency === 'BOTH' && fxRate !== null && (
                                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                  ${breakdown.cost_paper_cone_usd.toFixed(5)} USD /u
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-amber-400 font-semibold text-xs">
                              ⚠️ INCOMPLETO
                              {breakdown.cost_paper_cone_missing && (
                                <span className="block text-[10px] text-amber-300/80 font-normal mt-0.5">
                                  Falta: {breakdown.cost_paper_cone_missing.join(', ')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="rounded-lg bg-[#141820] p-3 border border-slate-800">
                          <span className="text-[11px] text-slate-400 block mb-1">Papel fondo:</span>
                          {breakdown.cost_bottom_status === 'COMPLETE' ? (
                            <div>
                              <div className="font-mono font-bold text-white text-base">
                                {summaryCurrency === 'PYG' && fxRate !== null
                                  ? `Gs. ${Math.round(breakdown.cost_bottom_usd * fxRate).toLocaleString('es-PY')} /u`
                                  : `$${breakdown.cost_bottom_usd.toFixed(5)} /u`}
                              </div>
                              {summaryCurrency === 'BOTH' && fxRate !== null && (
                                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                  ${breakdown.cost_bottom_usd.toFixed(5)} USD /u
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-amber-400 font-semibold text-xs">
                              ⚠️ INCOMPLETO
                              {breakdown.cost_bottom_missing && (
                                <span className="block text-[10px] text-amber-300/80 font-normal mt-0.5">
                                  Falta: {breakdown.cost_bottom_missing.join(', ')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="rounded-lg bg-[#141820] p-3 border border-slate-800">
                          <span className="text-[11px] text-slate-400 block mb-1">TOTAL MATERIA PRIMA:</span>
                          {breakdown.cost_raw_material_status === 'COMPLETE' ? (
                            <div>
                              <div className="font-mono font-bold text-emerald-300 text-base">
                                {summaryCurrency === 'PYG' && fxRate !== null
                                  ? `Gs. ${Math.round((breakdown.cost_paper_cone_usd + breakdown.cost_bottom_usd) * fxRate).toLocaleString('es-PY')} /u`
                                  : `$${(breakdown.cost_paper_cone_usd + breakdown.cost_bottom_usd).toFixed(5)} /u`}
                              </div>
                              {summaryCurrency === 'BOTH' && fxRate !== null && (
                                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                  ${(breakdown.cost_paper_cone_usd + breakdown.cost_bottom_usd).toFixed(5)} USD /u
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-amber-400 font-semibold text-xs">
                              ⚠️ INCOMPLETO
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Detailed Trace */}
                      {showTrace && (
                        <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-2">
                          <div className="font-mono">
                            <strong>Papel cuerpo:</strong>{' '}
                            {input.paper_formula.printing_method === 'OFFSET' ? (
                              <span>
                                Pliego {input.paper_formula.sheet_width_mm}x{input.paper_formula.sheet_height_mm}mm, GSM total{' '}
                                {(input.paper_formula.gsm || 0) + (input.paper_formula.coating_gsm || 0)} →{' '}
                                {breakdown.price_per_sheet_usd ? `$${breakdown.price_per_sheet_usd.toFixed(4)}/pliego` : '—'} ÷{' '}
                                {input.paper_formula.units_per_sheet} u/pliego ={' '}
                                <strong className="text-white">${breakdown.cost_paper_cone_usd.toFixed(5)} USD/u</strong>
                                {fxRate !== null && (
                                  <span className="text-slate-300">
                                    {' '}
                                    (Gs. {Math.round(breakdown.cost_paper_cone_usd * fxRate).toLocaleString('es-PY')}/u)
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span>
                                Bobina {input.paper_formula.web_width_mm}mm, GSM total{' '}
                                {(input.paper_formula.gsm || 0) + (input.paper_formula.coating_gsm || 0)} →{' '}
                                {breakdown.price_per_linear_meter_usd ? `$${breakdown.price_per_linear_meter_usd.toFixed(4)}/m` : '—'} ÷{' '}
                                {input.paper_formula.units_per_linear_meter} u/m ={' '}
                                <strong className="text-white">${breakdown.cost_paper_cone_usd.toFixed(5)} USD/u</strong>
                              </span>
                            )}
                          </div>

                          <div className="font-mono">
                            <strong>Papel fondo:</strong>{' '}
                            <span>
                              Costo fondo por m²:{' '}
                              {breakdown.cost_bottom_m2_usd ? `$${breakdown.cost_bottom_m2_usd.toFixed(4)}/m²` : '—'} ÷{' '}
                              {bottomFormula.units_per_m2 || 'N/A'} u/m² ={' '}
                              <strong className="text-white">${breakdown.cost_bottom_usd.toFixed(5)} USD/u</strong>
                              {fxRate !== null && (
                                <span className="text-slate-300">
                                  {' '}
                                  (Gs. {Math.round(breakdown.cost_bottom_usd * fxRate).toLocaleString('es-PY')}/u)
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. Papel cuerpo y fondo: dimensiones y rendimiento */}
                    <div className="grid gap-4 xl:grid-cols-2">
                      {/* Papel Cuerpo */}
                      <section className="rounded-lg border border-slate-800 bg-[#10141b] p-4 sm:p-5">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-100">
                              Papel cuerpo
                            </h3>
                            <p className="mt-1 text-[11px] text-slate-500">
                              Cono · gramaje y rendimiento según{' '}
                              <span className="font-semibold text-emerald-400">
                                {input.paper_formula.printing_method === 'OFFSET' ? 'OFFSET' : 'FLEXO'}
                              </span>
                            </p>
                          </div>
                          <span className="font-mono text-xs text-slate-400">
                            ${breakdown.cost_paper_cone_usd.toFixed(5)} /u
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <NumberField
                            label="Gramaje"
                            suffix="gsm"
                            value={input.paper_formula.gsm}
                            emptyWhenZero={emptyValues}
                            onChange={(value) =>
                              updateInput({
                                paper_formula: { ...input.paper_formula, gsm: value },
                              })
                            }
                          />
                          <NumberField
                            label="Coating"
                            suffix="gsm"
                            value={input.paper_formula.coating_gsm || 0}
                            emptyWhenZero={emptyValues}
                            onChange={(value) =>
                              updateInput({
                                paper_formula: { ...input.paper_formula, coating_gsm: value },
                              })
                            }
                          />
                          {input.paper_formula.printing_method === 'OFFSET' ? (
                            <>
                              <NumberField
                                label="Ancho pliego"
                                suffix="mm"
                                value={input.paper_formula.sheet_width_mm || 0}
                                emptyWhenZero={emptyValues}
                                onChange={(value) =>
                                  updateInput({
                                    paper_formula: { ...input.paper_formula, sheet_width_mm: value },
                                  })
                                }
                              />
                              <NumberField
                                label="Largo pliego"
                                suffix="mm"
                                value={input.paper_formula.sheet_height_mm || 0}
                                emptyWhenZero={emptyValues}
                                onChange={(value) =>
                                  updateInput({
                                    paper_formula: { ...input.paper_formula, sheet_height_mm: value },
                                  })
                                }
                              />
                              <NumberField
                                label="Unidades por pliego"
                                suffix="u/pliego"
                                value={input.paper_formula.units_per_sheet || 0}
                                emptyWhenZero={emptyValues}
                                onChange={(value) =>
                                  updateInput({
                                    paper_formula: { ...input.paper_formula, units_per_sheet: value },
                                  })
                                }
                              />
                            </>
                          ) : (
                            <>
                              <NumberField
                                label="Ancho bobina"
                                suffix="mm"
                                value={input.paper_formula.web_width_mm || 0}
                                emptyWhenZero={emptyValues}
                                onChange={(value) =>
                                  updateInput({
                                    paper_formula: { ...input.paper_formula, web_width_mm: value },
                                  })
                                }
                              />
                              <NumberField
                                label="Unidades por metro"
                                suffix="u/m"
                                value={input.paper_formula.units_per_linear_meter || 0}
                                emptyWhenZero={emptyValues}
                                onChange={(value) =>
                                  updateInput({
                                    paper_formula: { ...input.paper_formula, units_per_linear_meter: value },
                                  })
                                }
                              />
                            </>
                          )}
                        </div>
                      </section>

                      {/* Papel Fondo */}
                      <section className="rounded-lg border border-slate-800 bg-[#10141b] p-4 sm:p-5">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-100">
                              Fondo
                            </h3>
                            <p className="mt-1 text-[11px] text-slate-500">
                              Papel de fondo · cálculo por m² o rendimiento
                            </p>
                          </div>
                          <span className="font-mono text-xs text-slate-400">
                            ${breakdown.cost_bottom_usd.toFixed(5)} /u
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <NumberField
                            label="Gramaje"
                            suffix="gsm"
                            value={bottomFormula.gsm || 0}
                            emptyWhenZero={emptyValues}
                            onChange={(value) => updateBottomFormula({ gsm: value })}
                          />
                          <NumberField
                            label="Coating"
                            suffix="gsm"
                            value={bottomFormula.coating_gsm || 0}
                            emptyWhenZero={emptyValues}
                            onChange={(value) => updateBottomFormula({ coating_gsm: value })}
                          />
                          <NumberField
                            label="Unidades por m²"
                            suffix="u/m²"
                            value={bottomFormula.units_per_m2 || 0}
                            emptyWhenZero={emptyValues}
                            onChange={(value) => updateBottomFormula({ units_per_m2: value })}
                          />
                        </div>
                        {bottomDivergent && (
                          <p className="mt-3 rounded-md border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200">
                            Esta hoja guardó para el fondo un costo distinto (CIF {bottomFormula.cif_price_ton_usd.toFixed(2)} USD/t). Se mantiene tal cual hasta que edites el costo del papel: ahí se unifica con el de arriba.
                          </p>
                        )}
                      </section>
                    </div>
                  </div>
                </RubricCard>
              </section>

              {/* CARD 2: COSTOS DIRECTOS */}
              <section aria-labelledby="direct-cost-heading">
                <div className="mb-3">
                  <h2 id="direct-cost-heading" className="text-sm font-bold uppercase tracking-[0.12em] text-white">
                    Costos directos
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Cada rubro conserva su fuente, estado e impacto independiente
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Impresión y troquelado */}
                  <RubricCard
                    title="Impresión + troquelado"
                    config={printingConfig}
                    impactUsd={rubricValuesUsd.printing_die_cut}
                    impactPyg={rubricValuesPyg.printing_die_cut}
                    summaryCurrency={summaryCurrency}
                    fxRate={fxRate}
                    onEnabledChange={(enabled) => updateRubric('printing_die_cut', { enabled })}
                    onSourceChange={(source) => updateRubric('printing_die_cut', { source })}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-300">
                        <span>Método de cotización</span>
                        <select
                          value={input.printing_cost_mode}
                          onChange={(event) =>
                            updateInput(
                              {
                                printing_cost_mode: event.target.value as IndustrialProductCostInput['printing_cost_mode'],
                              },
                              true
                            )
                          }
                          className="min-h-11 rounded-md border border-slate-700 bg-[#0c0f14] px-3 text-sm text-white outline-none focus:border-brand-500/70"
                        >
                          <option value="PER_THOUSAND">Por 1.000 unidades</option>
                          <option value="PER_UNIT">Por unidad</option>
                          <option value="TOTAL_BATCH">Por lote total</option>
                        </select>
                      </label>
                      <NumberField
                        label="Valor cotizado"
                        suffix={getMonetarySuffix(
                          input.printing_cost_mode === 'PER_UNIT'
                            ? 'u'
                            : input.printing_cost_mode === 'TOTAL_BATCH'
                            ? 'lote'
                            : '1000'
                        )}
                        value={getMonetaryValue(
                          input.quoted_printing_rate_usd,
                          input.currency_meta?.quoted_printing_rate_original
                        )}
                        emptyWhenZero={emptyValues}
                        secondaryText={getSecondaryEquivalence(input.quoted_printing_rate_usd)}
                        onChange={(val) =>
                          handleMonetaryChange(val, (usdVal, origVal) => {
                            updateInput({
                              quoted_printing_rate_usd: usdVal,
                              currency_meta: {
                                ...input.currency_meta,
                                quoted_printing_rate_original: origVal,
                                currency: inputCurrency,
                                fx_rate: fxRate || 1,
                              },
                            });
                          })
                        }
                      />
                    </div>
                  </RubricCard>

                  {/* Costos operativos */}
                  <RubricCard
                    title="Costos operativos"
                    config={operationalConfig}
                    impactUsd={rubricValuesUsd.operational}
                    impactPyg={rubricValuesPyg.operational}
                    summaryCurrency={summaryCurrency}
                    fxRate={fxRate}
                    onEnabledChange={(enabled) => updateRubric('operational', { enabled })}
                    onSourceChange={(source) => updateRubric('operational', { source })}
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#10141b] p-3.5">
                        <div>
                          <div className="text-xs font-semibold text-slate-200">Usar cálculo de Procesos</div>
                          <div className="text-[11px] text-slate-400">
                            {input.operational_process_enabled
                              ? 'Cálculo activo desde Procesos Industriales (Formado, Electricidad, Operadores y Calidad)'
                              : `Cálculo manual ingresado en ${inputCurrency === 'PYG' ? 'Gs. / 1.000' : 'USD / 1.000'}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleOperationalProcess(false)}
                            className={`text-xs font-mono font-semibold transition-colors cursor-pointer ${!input.operational_process_enabled ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            OFF
                          </button>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(input.operational_process_enabled)}
                            onClick={() => toggleOperationalProcess(!input.operational_process_enabled)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${input.operational_process_enabled ? 'bg-brand-600' : 'bg-slate-700'}`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${input.operational_process_enabled ? 'translate-x-5' : 'translate-x-0'}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleOperationalProcess(true)}
                            className={`text-xs font-mono font-semibold transition-colors cursor-pointer ${input.operational_process_enabled ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            ON
                          </button>
                        </div>
                      </div>

                      {!input.operational_process_enabled ? (
                        <NumberField
                          label="Costo operativo manual"
                          suffix={getMonetarySuffix('1000')}
                          value={getMonetaryValue(
                            input.operational_cost_per_thousand_usd,
                            input.currency_meta?.operational_cost_per_thousand_original
                          )}
                          emptyWhenZero={emptyValues}
                          secondaryText={getSecondaryEquivalence(input.operational_cost_per_thousand_usd)}
                          onChange={(val) =>
                            handleMonetaryChange(val, (usdVal, origVal) => {
                              updateInput({
                                operational_cost_per_thousand_usd: usdVal,
                                currency_meta: {
                                  ...input.currency_meta,
                                  operational_cost_per_thousand_original: origVal,
                                  currency: inputCurrency,
                                  fx_rate: fxRate || 1,
                                },
                              });
                            })
                          }
                        />
                      ) : (
                        <div className="rounded-lg border border-brand-900/40 bg-brand-950/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-300">Formado + Operadores + Energía + Calidad</span>
                            <span className="rounded bg-brand-500/20 border border-brand-500/40 px-2 py-0.5 text-[10px] font-bold text-brand-300">PROCESOS</span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 text-xs">
                            <div className="rounded bg-black/30 p-2.5">
                              <div className="text-[11px] text-slate-400">Costo operativo calculado</div>
                              <div className="mt-1 font-mono text-base font-bold text-white">
                                {summaryCurrency === 'PYG' && fxRate !== null ? (
                                  <span>Gs. {Math.round((input.process_operational_cost_per_thousand_usd || 0) * fxRate).toLocaleString('es-PY')} <span className="text-xs font-normal text-slate-400">/1.000</span></span>
                                ) : (
                                  <span>${(input.process_operational_cost_per_thousand_usd || 0).toFixed(4)} <span className="text-xs font-normal text-slate-400">USD/1.000</span></span>
                                )}
                              </div>
                              <div className="text-[11px] text-emerald-400 font-mono">
                                {summaryCurrency === 'PYG' && fxRate !== null ? (
                                  <span>Gs. {Math.round(((input.process_operational_cost_per_thousand_usd || 0) / 1000) * fxRate).toLocaleString('es-PY')} /u</span>
                                ) : (
                                  <span>${((input.process_operational_cost_per_thousand_usd || 0) / 1000).toFixed(5)} /u</span>
                                )}
                              </div>
                              {summaryCurrency === 'BOTH' && fxRate !== null && (
                                <div className="mt-1 text-[11px] font-mono text-slate-400">
                                  Gs. {Math.round((input.process_operational_cost_per_thousand_usd || 0) * fxRate).toLocaleString('es-PY')} /1.000
                                </div>
                              )}
                            </div>
                            <div className="rounded bg-black/30 p-2.5">
                              <div className="text-[11px] text-slate-400">Origen &amp; Prorrateo</div>
                              <div className="mt-1 text-xs text-slate-300 font-mono">
                                {input.process_calculation_detail?.status === 'COMPLETE'
                                  ? `Base: ${(input.process_calculation_detail.good_units_basis || 0).toLocaleString('es-PY')} u`
                                  : 'Pendiente de parametrización en Procesos'}
                              </div>
                              <a
                                href="/cost/processes"
                                className="mt-1 inline-block text-[11px] text-brand-400 hover:text-brand-300 underline"
                              >
                                Configurar en Procesos &rarr;
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </RubricCard>

                  {/* Merma */}
                  <RubricCard
                    title="Merma"
                    config={scrapConfig}
                    impactUsd={rubricValuesUsd.scrap}
                    impactPyg={rubricValuesPyg.scrap}
                    summaryCurrency={summaryCurrency}
                    fxRate={fxRate}
                    onEnabledChange={(enabled) => updateRubric('scrap', { enabled })}
                    onSourceChange={(source) => updateRubric('scrap', { source })}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NumberField
                        label="Merma"
                        suffix="%"
                        value={input.scrap_rate_percent}
                        emptyWhenZero={emptyValues}
                        onChange={(value) => updateInput({ scrap_rate_percent: value })}
                      />
                      <ReadOnlyField
                        label="Impacto sobre materia prima"
                        suffix={getMonetarySuffix('u')}
                        value={
                          summaryCurrency === 'PYG' && fxRate !== null
                            ? `Gs. ${Math.round(breakdown.cost_scrap_usd * fxRate).toLocaleString('es-PY')}`
                            : `$${breakdown.cost_scrap_usd.toFixed(5)}`
                        }
                        secondaryText={getSecondaryEquivalence(breakdown.cost_scrap_usd)}
                        tone="rose"
                      />
                    </div>
                  </RubricCard>

                  {/* Depreciación */}
                  <RubricCard
                    title="Depreciación"
                    config={depreciationConfig}
                    impactUsd={rubricValuesUsd.depreciation}
                    impactPyg={rubricValuesPyg.depreciation}
                    summaryCurrency={summaryCurrency}
                    fxRate={fxRate}
                    onEnabledChange={(enabled) => updateRubric('depreciation', { enabled })}
                    onSourceChange={(source) => updateRubric('depreciation', { source })}
                  >
                    <NumberField
                      label="Costo de depreciación"
                      suffix={getMonetarySuffix('1000')}
                      value={getMonetaryValue(
                        input.machine_depreciation_per_thousand_usd,
                        input.currency_meta?.machine_depreciation_per_thousand_original
                      )}
                      emptyWhenZero={emptyValues}
                      secondaryText={getSecondaryEquivalence(input.machine_depreciation_per_thousand_usd)}
                      onChange={(val) =>
                        handleMonetaryChange(val, (usdVal, origVal) => {
                          updateInput({
                            machine_depreciation_per_thousand_usd: usdVal,
                            currency_meta: {
                              ...input.currency_meta,
                              machine_depreciation_per_thousand_original: origVal,
                              currency: inputCurrency,
                              fx_rate: fxRate || 1,
                            },
                          });
                        })
                      }
                    />
                  </RubricCard>

                  {/* Embalaje */}
                  <RubricCard
                    title="Embalaje"
                    config={packagingConfig}
                    impactUsd={rubricValuesUsd.packaging}
                    impactPyg={rubricValuesPyg.packaging}
                    summaryCurrency={summaryCurrency}
                    fxRate={fxRate}
                    onEnabledChange={(enabled) => updateRubric('packaging', { enabled })}
                    onSourceChange={(source) => updateRubric('packaging', { source })}
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-[#10141b] p-3.5">
                        <div>
                          <div className="text-xs font-semibold text-slate-200">Usar cálculo de Procesos</div>
                          <div className="text-[11px] text-slate-400">
                            {input.packaging_process_enabled
                              ? 'Cálculo activo desde Procesos Industriales (Mano de obra aprobada + Materiales)'
                              : `Cálculo manual ingresado en ${inputCurrency === 'PYG' ? 'Gs. / 1.000' : 'USD / 1.000'}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePackagingProcess(false)}
                            className={`text-xs font-mono font-semibold transition-colors cursor-pointer ${!input.packaging_process_enabled ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            OFF
                          </button>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(input.packaging_process_enabled)}
                            onClick={() => togglePackagingProcess(!input.packaging_process_enabled)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${input.packaging_process_enabled ? 'bg-brand-600' : 'bg-slate-700'}`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${input.packaging_process_enabled ? 'translate-x-5' : 'translate-x-0'}`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePackagingProcess(true)}
                            className={`text-xs font-mono font-semibold transition-colors cursor-pointer ${input.packaging_process_enabled ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            ON
                          </button>
                        </div>
                      </div>

                      {!input.packaging_process_enabled ? (
                        <NumberField
                          label="Costo de embalaje manual"
                          suffix={getMonetarySuffix('1000')}
                          value={getMonetaryValue(
                            input.packaging_cost_per_thousand_usd,
                            input.currency_meta?.packaging_cost_per_thousand_original
                          )}
                          emptyWhenZero={emptyValues}
                          secondaryText={getSecondaryEquivalence(input.packaging_cost_per_thousand_usd)}
                          onChange={(val) =>
                            handleMonetaryChange(val, (usdVal, origVal) => {
                              updateInput({
                                packaging_cost_per_thousand_usd: usdVal,
                                currency_meta: {
                                  ...input.currency_meta,
                                  packaging_cost_per_thousand_original: origVal,
                                  currency: inputCurrency,
                                  fx_rate: fxRate || 1,
                                },
                              });
                            })
                          }
                        />
                      ) : (
                        <div className="rounded-lg border border-brand-900/40 bg-brand-950/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-brand-300">MO Empaque (cronómetro aprobado) + Materiales</span>
                            <span className="rounded bg-brand-500/20 border border-brand-500/40 px-2 py-0.5 text-[10px] font-bold text-brand-300">PROCESOS</span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 text-xs">
                            <div className="rounded bg-black/30 p-2.5">
                              <div className="text-[11px] text-slate-400">Costo embalaje calculado</div>
                              <div className="mt-1 font-mono text-base font-bold text-white">
                                {summaryCurrency === 'PYG' && fxRate !== null ? (
                                  <span>Gs. {Math.round((input.process_packaging_cost_per_thousand_usd || 0) * fxRate).toLocaleString('es-PY')} <span className="text-xs font-normal text-slate-400">/1.000</span></span>
                                ) : (
                                  <span>${(input.process_packaging_cost_per_thousand_usd || 0).toFixed(4)} <span className="text-xs font-normal text-slate-400">USD/1.000</span></span>
                                )}
                              </div>
                              <div className="text-[11px] text-emerald-400 font-mono">
                                {summaryCurrency === 'PYG' && fxRate !== null ? (
                                  <span>Gs. {Math.round(((input.process_packaging_cost_per_thousand_usd || 0) / 1000) * fxRate).toLocaleString('es-PY')} /u</span>
                                ) : (
                                  <span>${((input.process_packaging_cost_per_thousand_usd || 0) / 1000).toFixed(5)} /u</span>
                                )}
                              </div>
                              {summaryCurrency === 'BOTH' && fxRate !== null && (
                                <div className="mt-1 text-[11px] font-mono text-slate-400">
                                  Gs. {Math.round((input.process_packaging_cost_per_thousand_usd || 0) * fxRate).toLocaleString('es-PY')} /1.000
                                </div>
                              )}
                            </div>
                            <div className="rounded bg-black/30 p-2.5">
                              <div className="text-[11px] text-slate-400">Origen &amp; Prorrateo</div>
                              <div className="mt-1 text-xs text-slate-300 font-mono">
                                {input.process_calculation_detail?.status === 'COMPLETE'
                                  ? `Base: ${(input.process_calculation_detail.good_units_basis || 0).toLocaleString('es-PY')} u`
                                  : 'Pendiente de parametrización en Procesos'}
                              </div>
                              <a
                                href="/cost/processes"
                                className="mt-1 inline-block text-[11px] text-brand-400 hover:text-brand-300 underline"
                              >
                                Configurar en Procesos &rarr;
                              </a>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </RubricCard>
                </div>
              </section>
            </div>
          </div>
        )
      )}
    </div>
  );
}
