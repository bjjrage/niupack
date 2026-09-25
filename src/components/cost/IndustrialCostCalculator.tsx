'use client';

import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Save,
  CheckCircle2,
  RefreshCw,
  Layers,
  DollarSign,
  TrendingUp,
  Percent,
  Package,
  Wrench,
  Scissors,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { PricingEngine } from '@/lib/engines/pricing-engine';
import {
  IndustrialProductCostInput,
  IndustrialCostBreakdown,
  PricingStrategyResult,
} from '@/types';

interface Props {
  initialSku?: string;
  marketBenchmarkUSD?: number;
  onCostUpdated?: (unitCost: number) => void;
}

export function IndustrialCostCalculator({
  initialSku = 'CUP-12OZ-SW',
  marketBenchmarkUSD = 0.0495,
  onCostUpdated,
}: Props) {
  const [sku, setSku] = useState(initialSku);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // Form State
  const [cifPriceTon, setCifPriceTon] = useState<number>(1250);
  const [customsDispatchPercent, setCustomsDispatchPercent] = useState<number>(13);
  const [financialCostPercent, setFinancialCostPercent] = useState<number>(6);
  const [printingMethod, setPrintingMethod] = useState<'OFFSET' | 'FLEXO'>('OFFSET');
  
  // Offset fields
  const [sheetWidthMM, setSheetWidthMM] = useState<number>(700);
  const [sheetHeightMM, setSheetHeightMM] = useState<number>(1000);
  const [gsm, setGsm] = useState<number>(260);
  const [coatingGsm, setCoatingGsm] = useState<number>(18);
  const [unitsPerSheet, setUnitsPerSheet] = useState<number>(11);

  // Flexo fields
  const [webWidthMM, setWebWidthMM] = useState<number>(850);
  const [unitsPerLinearMeter, setUnitsPerLinearMeter] = useState<number>(16);

  // Yield direct
  const [paperYieldUnitsPerTon, setPaperYieldUnitsPerTon] = useState<number>(56500);

  // Culito (Fondo)
  const [bottomPaperCostTon, setBottomPaperCostTon] = useState<number>(1350);
  const [bottomYieldUnitsPerTon, setBottomYieldUnitsPerTon] = useState<number>(350000);

  // Impresión y troquelado variable
  const [printingCostMode, setPrintingCostMode] = useState<'PER_THOUSAND' | 'PER_UNIT' | 'TOTAL_BATCH'>('PER_THOUSAND');
  const [quotedPrintingRate, setQuotedPrintingRate] = useState<number>(4.50);

  // Operativos, Depreciación, Merma, Empaque
  const [operationalCostPerThousand, setOperationalCostPerThousand] = useState<number>(5.40);
  const [depreciationPerThousand, setDepreciationPerThousand] = useState<number>(3.50);
  const [scrapRatePercent, setScrapRatePercent] = useState<number>(6.5);
  const [packagingPerThousand, setPackagingPerThousand] = useState<number>(2.20);
  const [batchSize, setBatchSize] = useState<number>(300000);

  // Active view tab: FORMULA | QUOTER | STRATEGIES
  const [activeTab, setActiveTab] = useState<'FORMULA' | 'QUOTER' | 'STRATEGIES'>('FORMULA');

  // FX state
  const [fxRate, setFxRate] = useState<number>(7550);
  const [fxStatus, setFxStatus] = useState<string>('CURRENT');
  const [fxRefreshing, setFxRefreshing] = useState<boolean>(false);

  // Load from API on mount or SKU change
  useEffect(() => {
    loadSkuData(sku);
    fetchFxRate();
  }, [sku]);

  const fetchFxRate = async (force: boolean = false) => {
    try {
      setFxRefreshing(true);
      const res = await fetch(`/api/fx${force ? '?refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data.costingRate) {
          setFxRate(data.costingRate);
          setFxStatus(data.status);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFxRefreshing(false);
    }
  };

  const loadSkuData = async (targetSku: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cost/industrial?sku=${targetSku}`);
      if (res.ok) {
        const data = await res.json();
        if (data.input) {
          const inp: IndustrialProductCostInput = data.input;
          setCifPriceTon(inp.paper_formula.cif_price_ton_usd || 1250);
          setCustomsDispatchPercent(inp.paper_formula.customs_dispatch_percent !== undefined ? inp.paper_formula.customs_dispatch_percent : 13);
          setFinancialCostPercent(inp.paper_formula.financial_cost_percent !== undefined ? inp.paper_formula.financial_cost_percent : 6);
          setPrintingMethod(inp.paper_formula.printing_method || 'OFFSET');
          setSheetWidthMM(inp.paper_formula.sheet_width_mm || 700);
          setSheetHeightMM(inp.paper_formula.sheet_height_mm || 1000);
          setGsm(inp.paper_formula.gsm || 260);
          setCoatingGsm(inp.paper_formula.coating_gsm || 18);
          setUnitsPerSheet(inp.paper_formula.units_per_sheet || 11);
          setWebWidthMM(inp.paper_formula.web_width_mm || 850);
          setUnitsPerLinearMeter(inp.paper_formula.units_per_linear_meter || 16);
          setPaperYieldUnitsPerTon(inp.paper_formula.paper_yield_units_per_ton || 56500);
          setBottomPaperCostTon(inp.bottom_paper_cost_ton_usd || 1350);
          setBottomYieldUnitsPerTon(inp.bottom_yield_units_per_ton || 350000);
          setPrintingCostMode(inp.printing_cost_mode || 'PER_THOUSAND');
          setQuotedPrintingRate(inp.quoted_printing_rate_usd || 4.50);
          setOperationalCostPerThousand(inp.operational_cost_per_thousand_usd || 5.40);
          setDepreciationPerThousand(inp.machine_depreciation_per_thousand_usd || 3.50);
          setScrapRatePercent(inp.scrap_rate_percent || 6.5);
          setPackagingPerThousand(inp.packaging_cost_per_thousand_usd || 2.20);
          setBatchSize(inp.batch_size || 300000);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Automatic calculations from CIF
  const numCif = Number(cifPriceTon) || 0;
  const customsDispatchTon = Number((numCif * (customsDispatchPercent / 100)).toFixed(2));
  const financialCostTon = Number((numCif * (financialCostPercent / 100)).toFixed(2));
  const totalPaperTonEstimated = Number((numCif + customsDispatchTon + financialCostTon).toFixed(2));

  // Build current input object for real-time calculation
  const currentInput: IndustrialProductCostInput = {
    sku,
    paper_formula: {
      cif_price_ton_usd: numCif,
      customs_dispatch_percent: customsDispatchPercent,
      customs_dispatch_ton_usd: customsDispatchTon,
      financial_cost_percent: financialCostPercent,
      financial_cost_ton_usd: financialCostTon,
      printing_method: printingMethod,
      sheet_width_mm: Number(sheetWidthMM) || 0,
      sheet_height_mm: Number(sheetHeightMM) || 0,
      gsm: Number(gsm) || 0,
      coating_gsm: Number(coatingGsm) || 0,
      units_per_sheet: Number(unitsPerSheet) || 0,
      web_width_mm: Number(webWidthMM) || 0,
      units_per_linear_meter: Number(unitsPerLinearMeter) || 0,
      paper_yield_units_per_ton: Number(paperYieldUnitsPerTon) || 0,
    },
    bottom_paper_cost_ton_usd: Number(bottomPaperCostTon) || 0,
    bottom_yield_units_per_ton: Number(bottomYieldUnitsPerTon) || 0,
    printing_cost_mode: printingCostMode,
    quoted_printing_rate_usd: Number(quotedPrintingRate) || 0,
    operational_cost_per_thousand_usd: Number(operationalCostPerThousand) || 0,
    machine_depreciation_per_thousand_usd: Number(depreciationPerThousand) || 0,
    scrap_rate_percent: Number(scrapRatePercent) || 0,
    packaging_cost_per_thousand_usd: Number(packagingPerThousand) || 0,
    batch_size: Number(batchSize) || 300000,
  };

  // Real-time calculation in memory
  const breakdown: IndustrialCostBreakdown = IndustrialCostEngine.calculateCost(currentInput);

  // Real-time commercial pricing strategies based on this real industrial true cost
  const strategies: PricingStrategyResult[] = PricingEngine.calculateStrategies({
    unitCostUSD: breakdown.true_unit_cost_usd,
    marketBenchmarkUSD,
  });

  // Save to OS database
  const handleSaveToOS = async () => {
    setSaving(true);
    setSavedFeedback(null);
    try {
      const res = await fetch('/api/cost/industrial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentInput),
      });

      if (res.ok) {
        setSavedFeedback(`✓ Costo industrial de ${sku} guardado exitosamente en el OS: $${breakdown.true_unit_cost_usd.toFixed(5)} USD/u`);
        if (onCostUpdated) {
          onCostUpdated(breakdown.true_unit_cost_usd);
        }
        setTimeout(() => setSavedFeedback(null), 5000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & SKU Selector */}
      <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-brand-400" />
            <span className="text-sm font-bold text-white">Formulador Industrial en Vivo (Sin Excel)</span>
          </div>

          <div className="h-4 w-[1px] bg-slate-700 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">SKU:</span>
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono font-semibold"
            >
              <option value="CUP-12OZ-SW">CUP-12OZ-SW (Vaso 12 oz Pared Simple)</option>
              <option value="CUP-8OZ-SW">CUP-8OZ-SW (Vaso 8 oz Pared Simple)</option>
              <option value="CUP-16OZ-SW">CUP-16OZ-SW (Vaso 16 oz Pared Simple)</option>
              <option value="CUP-12OZ-DW">CUP-12OZ-DW (Vaso 12 oz Doble Pared)</option>
            </select>
          </div>

          <div className="h-4 w-[1px] bg-slate-700 hidden sm:block" />

          {/* FX Status Pill */}
          <div className="flex items-center gap-2 bg-[#0c0f14] px-2.5 py-1 rounded border border-slate-700/80 text-xs">
            <span className="text-slate-400 text-[11px]">TC BNF:</span>
            <span className="font-mono text-emerald-400 font-bold text-[11px]">
              Gs. {fxRate.toLocaleString('es-PY')} / USD
            </span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
              {fxStatus === 'CURRENT' ? 'Venta Auto' : fxStatus === 'MANUAL' ? 'Manual' : 'Última Válida'}
            </span>
            <button
              onClick={() => fetchFxRate(true)}
              disabled={fxRefreshing}
              title="Refrescar cotización BNF"
              className="text-slate-400 hover:text-white p-0.5 ml-0.5 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${fxRefreshing ? 'animate-spin text-brand-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center bg-[#0c0f14] p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('FORMULA')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'FORMULA' ? 'bg-brand-500 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Formulación de Costo
          </button>
          <button
            onClick={() => setActiveTab('QUOTER')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'QUOTER' ? 'bg-brand-500 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            2. Cotizador de Lotes
          </button>
          <button
            onClick={() => setActiveTab('STRATEGIES')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'STRATEGIES' ? 'bg-brand-500 text-white font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            3. Estrategias de Precio
          </button>
        </div>
      </div>

      {savedFeedback && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-700/80 rounded-lg text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>{savedFeedback}</span>
          </div>
          <button onClick={() => setSavedFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* KPI Cards: True Cost & Live Totals in Dual Currency */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#141820] border border-brand-500/40 rounded-lg p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-brand-500/10 rounded-full blur-xl" />
          <span className="text-[11px] text-brand-300 font-bold uppercase tracking-wider block">
            COSTO UNITARIO REAL
          </span>
          <div className="mt-1">
            <div className="text-2xl font-black text-white font-mono font-tabular">
              ${breakdown.true_unit_cost_usd.toFixed(5)}{' '}
              <span className="text-xs font-sans text-slate-400 font-normal">USD/u</span>
            </div>
            <div className="text-sm font-bold text-amber-400 font-mono mt-0.5">
              Gs. {Math.round(breakdown.true_unit_cost_usd * fxRate).toLocaleString('es-PY')}{' '}
              <span className="text-[10px] text-amber-500/80 font-normal">/u</span>
            </div>
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-2 block border-t border-slate-800/80 pt-1.5">
            Referencia: ${(breakdown.true_unit_cost_usd * 1000).toFixed(2)} USD / 1.000 u
          </span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-slate-400 font-medium block">Costo Papel Cono + Fondo</span>
          <div className="text-xl font-bold text-sky-400 font-mono font-tabular mt-1">
            ${(breakdown.cost_paper_cone_usd + breakdown.cost_bottom_usd).toFixed(5)}{' '}
            <span className="text-xs text-slate-400 font-normal">USD/u</span>
          </div>
          <div className="text-xs font-mono text-sky-500 mt-0.5">
            Gs. {Math.round((breakdown.cost_paper_cone_usd + breakdown.cost_bottom_usd) * fxRate).toLocaleString('es-PY')} /u
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1.5 block border-t border-slate-800/80 pt-1">
            {(breakdown.share_paper_cone_percent + breakdown.share_bottom_percent).toFixed(1)}% de la estructura
          </span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-slate-400 font-medium block">Impresión & Operativos</span>
          <div className="text-xl font-bold text-amber-400 font-mono font-tabular mt-1">
            ${(breakdown.cost_printing_diecut_usd + breakdown.cost_operational_usd).toFixed(5)}{' '}
            <span className="text-xs text-slate-400 font-normal">USD/u</span>
          </div>
          <div className="text-xs font-mono text-amber-500 mt-0.5">
            Gs. {Math.round((breakdown.cost_printing_diecut_usd + breakdown.cost_operational_usd) * fxRate).toLocaleString('es-PY')} /u
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1.5 block border-t border-slate-800/80 pt-1">
            {(breakdown.share_printing_percent + breakdown.share_operational_percent).toFixed(1)}% del costo
          </span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-slate-400 font-medium block">Costo Total Lote ({batchSize.toLocaleString()} u)</span>
          <div className="text-xl font-bold text-white font-mono font-tabular mt-1">
            ${breakdown.batch_total_cost_usd.toLocaleString()} USD
          </div>
          <div className="text-xs font-mono text-emerald-400 mt-0.5">
            Gs. {Math.round(breakdown.batch_total_cost_usd * fxRate).toLocaleString('es-PY')}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1.5 block border-t border-slate-800/80 pt-1">
            Merma ({scrapRatePercent}%): ${((breakdown.cost_scrap_usd * batchSize)).toFixed(1)} USD
          </span>
        </div>
      </div>

      {/* TAB 1: FORMULACIÓN INDUSTRIAL DE COSTO */}
      {activeTab === 'FORMULA' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Formulation Inputs (Left column 8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* 1. COSTO DE PAPEL (CUERPO / CONO) */}
            <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-brand-500/10 text-brand-400">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      1. Papel del Cono / Cuerpo (Materia Prima Principal)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Precio CIF Tonelada + Despacho (13%) + Costo del Dinero (6%) &gt; Conversión Pliego/Metro &gt; Rendimiento x SKU
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Total Tonelada Papel:</span>
                  <span className="font-mono text-sm font-bold text-emerald-400">
                    ${breakdown.total_paper_ton_cost_usd} USD/ton
                  </span>
                </div>
              </div>

              {/* CIF (Manual) + Despacho 13% (Auto) + Costo del Dinero 6% (Auto) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. CIF Input */}
                <div className="bg-[#0c0f14] p-3 rounded-lg border border-slate-700/80">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold text-slate-200">
                      Precio CIF Tonelada
                    </label>
                    <span className="text-[9px] bg-sky-950 text-sky-400 px-1.5 py-0.5 rounded border border-sky-800 font-semibold uppercase">
                      Carga Manual
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-500 font-mono">$</span>
                    <input
                      type="number"
                      step="any"
                      value={cifPriceTon}
                      onChange={(e) => setCifPriceTon(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[#141820] border border-slate-600 rounded pl-7 pr-12 py-1.5 text-xs text-white font-mono font-bold focus:border-brand-500 focus:outline-none"
                    />
                    <span className="absolute right-2.5 top-2 text-[10px] text-slate-400">USD/t</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1.5">
                    Costo factura marítima CIF
                  </span>
                </div>

                {/* 2. Despacho (13% CIF Auto) */}
                <div className="bg-[#0c0f14] p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold text-slate-200">
                      Despacho & Importación
                    </label>
                    <span className="text-[9px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-800 font-mono font-semibold">
                      13% CIF (Auto)
                    </span>
                  </div>
                  <div className="px-3 py-1.5 bg-[#141820] rounded border border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-mono">$</span>
                    <span className="text-xs font-bold font-mono text-emerald-400">
                      {customsDispatchTon.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400">USD/t</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1.5">
                    Aduana, puerto y nacionalización
                  </span>
                </div>

                {/* 3. Costo del Dinero (6% CIF Auto) */}
                <div className="bg-[#0c0f14] p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold text-slate-200">
                      Costo del Dinero
                    </label>
                    <span className="text-[9px] bg-amber-950 text-amber-400 px-1.5 py-0.5 rounded border border-amber-800 font-mono font-semibold">
                      6% CIF (Auto)
                    </span>
                  </div>
                  <div className="px-3 py-1.5 bg-[#141820] rounded border border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-mono">$</span>
                    <span className="text-xs font-bold font-mono text-amber-400">
                      {financialCostTon.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400">USD/t</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1.5">
                    Inmovilización y financiamiento
                  </span>
                </div>
              </div>

              {/* Total Tonelada Formula Bar */}
              <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-900/90 to-[#0e1726] rounded-lg border border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-medium">Costo Total Tonelada Puesta en Planta:</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    (${numCif} CIF + ${customsDispatchTon.toFixed(2)} Despacho + ${financialCostTon.toFixed(2)} Financiero)
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-400">
                  = ${breakdown.total_paper_ton_cost_usd} USD/ton
                </span>
              </div>

              {/* Offset vs Flexo Switch */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-300">Tecnología de Impresión del Cono:</span>
                  <div className="flex items-center gap-1 bg-[#0c0f14] p-1 rounded border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPrintingMethod('OFFSET')}
                      className={`px-3 py-1 text-[11px] rounded font-medium transition-colors ${
                        printingMethod === 'OFFSET' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      OFFSET (Por Pliego)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrintingMethod('FLEXO')}
                      className={`px-3 py-1 text-[11px] rounded font-medium transition-colors ${
                        printingMethod === 'FLEXO' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      FLEXOGRÁFICA (Por Metro Lineal)
                    </button>
                  </div>
                </div>

                {/* OFFSET Parameters */}
                {printingMethod === 'OFFSET' ? (
                  <div className="space-y-3 bg-[#0c0f14] p-3 rounded border border-slate-800">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Ancho Pliego (mm)</label>
                        <input
                          type="number"
                          value={sheetWidthMM}
                          onChange={(e) => setSheetWidthMM(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141820] border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Largo Pliego (mm)</label>
                        <input
                          type="number"
                          value={sheetHeightMM}
                          onChange={(e) => setSheetHeightMM(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141820] border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Gramaje Papel (gsm)</label>
                        <input
                          type="number"
                          value={gsm}
                          onChange={(e) => setGsm(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141820] border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Coating PE (gsm)</label>
                        <input
                          type="number"
                          value={coatingGsm}
                          onChange={(e) => setCoatingGsm(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141820] border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-brand-300 mb-1">
                          Rendimiento de Conos por Pliego (unidades/pliego)
                        </label>
                        <input
                          type="number"
                          value={unitsPerSheet}
                          onChange={(e) => setUnitsPerSheet(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141820] border border-brand-500/50 rounded px-3 py-1.5 text-xs text-white font-mono font-bold"
                        />
                      </div>
                      <div className="flex flex-col justify-end p-2 bg-[#141820] rounded border border-slate-800 text-[11px]">
                        <span className="text-slate-400">
                          Precio por Pliego: <strong className="text-white">${breakdown.price_per_sheet_usd?.toFixed(4) || '0.00'} USD</strong>
                        </span>
                        <span className="text-slate-400 mt-0.5">
                          Costo Papel Cono: <strong className="text-emerald-400">${breakdown.cost_paper_cone_usd.toFixed(5)} USD/u</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* FLEXO Parameters */
                  <div className="space-y-3 bg-[#0c0f14] p-3 rounded border border-slate-800">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Ancho Bobina (mm)</label>
                        <input
                          type="number"
                          value={webWidthMM}
                          onChange={(e) => setWebWidthMM(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141820] border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Gramaje Papel (gsm)</label>
                        <input
                          type="number"
                          value={gsm}
                          onChange={(e) => setGsm(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141820] border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Coating PE (gsm)</label>
                        <input
                          type="number"
                          value={coatingGsm}
                          onChange={(e) => setCoatingGsm(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141820] border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-300 mb-1">
                          Rendimiento de Conos por Metro Lineal (unidades/m)
                        </label>
                        <input
                          type="number"
                          value={unitsPerLinearMeter}
                          onChange={(e) => setUnitsPerLinearMeter(parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#141820] border border-emerald-500/50 rounded px-3 py-1.5 text-xs text-white font-mono font-bold"
                        />
                      </div>
                      <div className="flex flex-col justify-end p-2 bg-[#141820] rounded border border-slate-800 text-[11px]">
                        <span className="text-slate-400">
                          Precio por Metro: <strong className="text-white">${breakdown.price_per_linear_meter_usd?.toFixed(4) || '0.00'} USD</strong>
                        </span>
                        <span className="text-slate-400 mt-0.5">
                          Costo Papel Cono: <strong className="text-emerald-400">${breakdown.cost_paper_cone_usd.toFixed(5)} USD/u</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Direct Ton Yield fallback input */}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60">
                  <span>Rendimiento directo de conos por tonelada (referencia):</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={paperYieldUnitsPerTon}
                      onChange={(e) => setPaperYieldUnitsPerTon(parseFloat(e.target.value) || 0)}
                      className="w-32 bg-[#0c0f14] border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono text-right"
                    />
                    <span className="text-[11px] text-slate-500">conos/ton</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. COSTO DE FONDO ("CULITO") */}
            <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-sky-500/10 text-sky-400">
                    <Scissors className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      2. Costo de Fondo (&quot;Culito&quot;)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Bobina angosta de fondo &gt; Gramaje y Rendimiento unitario de discos
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-sky-400">
                  ${breakdown.cost_bottom_usd.toFixed(5)} USD/u
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Costo Bobina Fondo CIF + Despacho (USD/ton)
                  </label>
                  <input
                    type="number"
                    value={bottomPaperCostTon}
                    onChange={(e) => setBottomPaperCostTon(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Rendimiento de Fondos por Tonelada (fondos/ton)
                  </label>
                  <input
                    type="number"
                    value={bottomYieldUnitsPerTon}
                    onChange={(e) => setBottomYieldUnitsPerTon(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* 3. IMPRESIÓN Y TROQUELADO VARIABLE (COTIZADO) */}
            <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-amber-500/10 text-amber-400">
                    <Wrench className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      3. Impresión y Troquelado (Carga Variable por Cotización)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      &quot;Costo de impresión siempre variable, así que se carga la cotización siempre cuando se cotiza&quot;
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-amber-400">
                  ${breakdown.cost_printing_diecut_usd.toFixed(5)} USD/u
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Modo de Cotización de Imprenta
                  </label>
                  <select
                    value={printingCostMode}
                    onChange={(e) => setPrintingCostMode(e.target.value as any)}
                    className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white"
                  >
                    <option value="PER_THOUSAND">Por Millar (USD / 1.000 u)</option>
                    <option value="PER_UNIT">Por Unidad (USD / u)</option>
                    <option value="TOTAL_BATCH">Monto Total de la Tirada (USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Valor Cotizado de Imprenta
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={quotedPrintingRate}
                    onChange={(e) => setQuotedPrintingRate(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            {/* 4. COSTOS OPERATIVOS, DEPRECIACIÓN, MERMA Y EMPAQUE */}
            <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <div className="p-1.5 rounded bg-purple-500/10 text-purple-400">
                  <Package className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    4. Costos Operativos, Depreciación, Merma y Empaque
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Parámetros de planta, desgaste formadora, % merma de papel y empaque secundario
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Operativos ($/millar)</label>
                  <input
                    type="number"
                    step="any"
                    value={operationalCostPerThousand}
                    onChange={(e) => setOperationalCostPerThousand(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    ${breakdown.cost_operational_usd.toFixed(5)}/u
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Depreciación ($/millar)</label>
                  <input
                    type="number"
                    step="any"
                    value={depreciationPerThousand}
                    onChange={(e) => setDepreciationPerThousand(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    ${breakdown.cost_depreciation_usd.toFixed(5)}/u
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Merma Proceso (%)</label>
                  <input
                    type="number"
                    step="any"
                    value={scrapRatePercent}
                    onChange={(e) => setScrapRatePercent(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    ${breakdown.cost_scrap_usd.toFixed(5)}/u
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Empaque ($/millar)</label>
                  <input
                    type="number"
                    step="any"
                    value={packagingPerThousand}
                    onChange={(e) => setPackagingPerThousand(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    ${breakdown.cost_packaging_usd.toFixed(5)}/u
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Summary Column (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Structure Summary Card */}
            <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 space-y-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800 flex items-center justify-between">
                <span>Estructura de Costo Unitario</span>
                <Badge variant="brand">${breakdown.true_unit_cost_usd.toFixed(5)}</Badge>
              </h4>

              <div className="space-y-2 text-xs">
                {/* 1. Papel Cono */}
                <div className="bg-[#0c0f14] p-2.5 rounded border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-slate-200 font-semibold block">Papel Cono:</span>
                      <span className="text-[10px] text-amber-400 font-mono">
                        Gs. {Math.round(breakdown.cost_paper_cone_usd * fxRate).toLocaleString('es-PY')} /u
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-white font-bold">${breakdown.cost_paper_cone_usd.toFixed(5)}</span>
                      <span className="text-[10px] text-slate-500 block">({breakdown.share_paper_cone_percent}%)</span>
                    </div>
                  </div>
                  <div className="pt-1 border-t border-slate-800/60 space-y-0.5 text-[10px] font-mono text-slate-400">
                    <div className="flex justify-between">
                      <span className="text-slate-400">• Base CIF:</span>
                      <span>${Math.max(0, breakdown.cost_paper_cone_usd - (breakdown.cost_dispatch_usd || 0) - (breakdown.cost_financial_usd || 0)).toFixed(5)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400/90">
                      <span>• Despacho (13%):</span>
                      <span>+${(breakdown.cost_dispatch_usd || 0).toFixed(5)}</span>
                    </div>
                    <div className="flex justify-between text-amber-400/90">
                      <span>• Costo Dinero (6%):</span>
                      <span>+${(breakdown.cost_financial_usd || 0).toFixed(5)}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Fondo */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <div>
                    <span className="text-slate-300 font-medium block">Fondo (&quot;Culito&quot;):</span>
                    <span className="text-[10px] text-amber-400 font-mono">
                      Gs. {Math.round(breakdown.cost_bottom_usd * fxRate).toLocaleString('es-PY')} /u
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-white font-bold">${breakdown.cost_bottom_usd.toFixed(5)}</span>
                    <span className="text-[10px] text-slate-500 block">({breakdown.share_bottom_percent}%)</span>
                  </div>
                </div>

                {/* 3. Impresión y Troquelado */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <div>
                    <span className="text-slate-300 font-medium block">Impresión y Troquelado:</span>
                    <span className="text-[10px] text-amber-400 font-mono">
                      Gs. {Math.round(breakdown.cost_printing_diecut_usd * fxRate).toLocaleString('es-PY')} /u
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-white font-bold">${breakdown.cost_printing_diecut_usd.toFixed(5)}</span>
                    <span className="text-[10px] text-slate-500 block">({breakdown.share_printing_percent}%)</span>
                  </div>
                </div>

                {/* 4. Operativos */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <div>
                    <span className="text-slate-300 font-medium block">Costos Operativos:</span>
                    <span className="text-[10px] text-amber-400 font-mono">
                      Gs. {Math.round(breakdown.cost_operational_usd * fxRate).toLocaleString('es-PY')} /u
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-white font-bold">${breakdown.cost_operational_usd.toFixed(5)}</span>
                    <span className="text-[10px] text-slate-500 block">({breakdown.share_operational_percent}%)</span>
                  </div>
                </div>

                {/* 5. Depreciación */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <div>
                    <span className="text-slate-300 font-medium block">Depreciación Máquina:</span>
                    <span className="text-[10px] text-amber-400 font-mono">
                      Gs. {Math.round(breakdown.cost_depreciation_usd * fxRate).toLocaleString('es-PY')} /u
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-white font-bold">${breakdown.cost_depreciation_usd.toFixed(5)}</span>
                    <span className="text-[10px] text-slate-500 block">({breakdown.share_depreciation_percent}%)</span>
                  </div>
                </div>

                {/* 6. Merma */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <div>
                    <span className="text-slate-300 font-medium block">Merma ({scrapRatePercent}%):</span>
                    <span className="text-[10px] text-amber-400 font-mono">
                      Gs. {Math.round(breakdown.cost_scrap_usd * fxRate).toLocaleString('es-PY')} /u
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-white font-bold">${breakdown.cost_scrap_usd.toFixed(5)}</span>
                    <span className="text-[10px] text-slate-500 block">({breakdown.share_scrap_percent}%)</span>
                  </div>
                </div>

                {/* 7. Empaque */}
                <div className="flex items-center justify-between py-1 border-b border-slate-800/50">
                  <div>
                    <span className="text-slate-300 font-medium block">Empaque Cajas/Bolsas:</span>
                    <span className="text-[10px] text-amber-400 font-mono">
                      Gs. {Math.round(breakdown.cost_packaging_usd * fxRate).toLocaleString('es-PY')} /u
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-white font-bold">${breakdown.cost_packaging_usd.toFixed(5)}</span>
                    <span className="text-[10px] text-slate-500 block">({breakdown.share_packaging_percent}%)</span>
                  </div>
                </div>

                {/* Total */}
                <div className="pt-3 border-t border-slate-700/80 flex items-center justify-between font-bold">
                  <div>
                    <span className="text-white block text-xs">Costo Unitario Real:</span>
                    <span className="text-xs font-mono text-amber-400 font-bold">
                      Gs. {Math.round(breakdown.true_unit_cost_usd * fxRate).toLocaleString('es-PY')} /u
                    </span>
                  </div>
                  <span className="font-mono text-emerald-400 text-sm font-bold">
                    ${breakdown.true_unit_cost_usd.toFixed(5)} USD/u
                  </span>
                </div>
              </div>

              {/* Progress visual bar */}
              <div className="w-full bg-[#0c0f14] h-2.5 rounded-full overflow-hidden flex">
                <div style={{ width: `${breakdown.share_paper_cone_percent}%` }} className="bg-sky-500" title="Papel cono" />
                <div style={{ width: `${breakdown.share_bottom_percent}%` }} className="bg-indigo-500" title="Fondo" />
                <div style={{ width: `${breakdown.share_printing_percent}%` }} className="bg-amber-500" title="Impresión" />
                <div style={{ width: `${breakdown.share_operational_percent}%` }} className="bg-purple-500" title="Operativos" />
                <div style={{ width: `${breakdown.share_depreciation_percent}%` }} className="bg-blue-500" title="Depreciación" />
                <div style={{ width: `${breakdown.share_scrap_percent}%` }} className="bg-rose-500" title="Merma" />
                <div style={{ width: `${breakdown.share_packaging_percent}%` }} className="bg-emerald-500" title="Empaque" />
              </div>

              {/* Save Button */}
              <div className="pt-2">
                <Button
                  variant="primary"
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs"
                  onClick={handleSaveToOS}
                  disabled={saving}
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Guardando en el OS...' : `Guardar Parámetros en el OS (${sku})`}
                </Button>
                <p className="text-[10px] text-slate-500 text-center mt-1.5">
                  Persiste la formulación industrial y recalcula las hojas de costo activas.
                </p>
              </div>
            </div>

            {/* Quick Benchmark Comparison */}
            <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 text-xs space-y-2">
              <span className="text-slate-400 font-medium block">Benchmark Mercado Regional:</span>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">Precio Mercado (BR):</span>
                <span className="font-bold text-white">${marketBenchmarkUSD.toFixed(4)} USD</span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-500">Margen Bruto vs Mercado:</span>
                <span className={`font-bold ${marketBenchmarkUSD > breakdown.true_unit_cost_usd ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(((marketBenchmarkUSD - breakdown.true_unit_cost_usd) / marketBenchmarkUSD) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COTIZADOR COMERCIAL RÁPIDO */}
      {activeTab === 'QUOTER' && (
        <div className="bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-6">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white">Cotizador Comercial de Tiradas Especiales</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulá una cotización ingresando el volumen requerido por el cliente y el costo de imprenta presupuestado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Cantidad a Cotizar (Unidades)
              </label>
              <input
                type="number"
                step="1000"
                value={batchSize}
                onChange={(e) => setBatchSize(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono font-bold"
              />
              <div className="flex gap-1.5 mt-2">
                {[50000, 100000, 250000, 500000].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setBatchSize(qty)}
                    className="px-2 py-1 bg-[#10141b] hover:bg-[#1a202c] text-[10px] text-slate-400 rounded border border-slate-800 font-mono"
                  >
                    {(qty / 1000)}k
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Cotización de Imprenta (USD / millar)
              </label>
              <input
                type="number"
                step="any"
                value={quotedPrintingRate}
                onChange={(e) => setQuotedPrintingRate(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-2 text-sm text-amber-400 font-mono font-bold"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Equivale a ${(quotedPrintingRate / 1000).toFixed(5)} USD / vaso
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Precio CIF Tonelada Papel
              </label>
              <input
                type="number"
                value={cifPriceTon}
                onChange={(e) => setCifPriceTon(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono"
              />
              <span className="text-[10px] text-slate-400 block mt-1 font-mono">
                + Despacho (13%): ${customsDispatchTon} | + Costo Dinero (6%): ${financialCostTon} = ${breakdown.total_paper_ton_cost_usd} USD/t
              </span>
            </div>
          </div>

          {/* Quoter Result Table */}
          <div className="bg-[#0c0f14] p-4 rounded-lg border border-slate-800 space-y-4">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Resultado de Cotización para Lote de {batchSize.toLocaleString()} u
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-center">
              <div className="p-3 bg-[#141820] rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Costo Unitario Real:</span>
                <span className="text-lg font-bold text-white block mt-1">
                  ${breakdown.true_unit_cost_usd.toFixed(5)}
                </span>
              </div>
              <div className="p-3 bg-[#141820] rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Costo Total Producción:</span>
                <span className="text-lg font-bold text-sky-400 block mt-1">
                  ${breakdown.batch_total_cost_usd.toLocaleString()}
                </span>
              </div>
              <div className="p-3 bg-[#141820] rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Precio Sugerido (15%):</span>
                <span className="text-lg font-bold text-emerald-400 block mt-1">
                  ${(breakdown.true_unit_cost_usd / 0.85).toFixed(4)}
                </span>
              </div>
              <div className="p-3 bg-[#141820] rounded border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Ganancia Neta Esperada:</span>
                <span className="text-lg font-bold text-emerald-400 block mt-1">
                  ${(((breakdown.true_unit_cost_usd / 0.85) - breakdown.true_unit_cost_usd) * batchSize).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MATRIZ DE ESTRATEGIAS COMERCIALES (7 ESTRATEGIAS) */}
      {activeTab === 'STRATEGIES' && (
        <div className="space-y-4">
          <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              7 Estrategias Comerciales de Pricing para {sku}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Calculadas directamente sobre el True Cost industrial formulado (${breakdown.true_unit_cost_usd.toFixed(5)} USD) y el benchmark de mercado regional (${marketBenchmarkUSD.toFixed(4)} USD).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {strategies.map((strat) => (
              <div
                key={strat.strategy}
                className="bg-[#141820] border border-slate-800 hover:border-slate-700 transition-colors rounded-lg p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">{strat.title}</span>
                    <Badge variant={strat.margin_percent >= 15 ? 'success' : strat.margin_percent >= 10 ? 'brand' : 'warning'}>
                      {strat.margin_percent}%
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between font-mono">
                    <span className="text-2xl font-black text-white font-tabular">
                      ${strat.suggested_price_usd.toFixed(4)}
                    </span>
                    <span className="text-xs text-slate-400">
                      Margen: ${strat.margin_usd.toFixed(4)}/u
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-2 line-clamp-3">
                    {strat.assumptions}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-500">Brecha vs Mercado:</span>
                  <span className={`font-bold ${strat.price_gap_percent <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {strat.price_gap_percent > 0 ? '+' : ''}{strat.price_gap_percent}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
