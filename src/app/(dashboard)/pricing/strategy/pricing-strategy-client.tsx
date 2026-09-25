'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowRight,
  ShieldCheck,
  Target,
  Sparkles,
  Sliders,
  Factory,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Info,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { PricingEngine } from '@/lib/engines/pricing-engine';
import { NestingEngine } from '@/lib/engines/nesting-engine';
import { IndustrialCapexEngine } from '@/lib/engines/industrial-capex-engine';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { useCopilot } from '@/components/copilot/CopilotContext';
import {
  PricingStrategyResult,
  MarketCode,
  IndustrialProductCostInput,
  IndustrialCostBreakdown,
  YieldNestingConfig,
} from '@/types';

interface Props {
  initialUnitCost: number;
  initialBenchmarkBR: number;
  initialBenchmarkAR: number;
  initialBenchmarkBO: number;
  initialIndustrialInput?: IndustrialProductCostInput;
}

export function PricingStrategyClient({
  initialUnitCost,
  initialBenchmarkBR,
  initialBenchmarkAR,
  initialBenchmarkBO,
  initialIndustrialInput,
}: Props) {
  const { updateScreenContext, registerActionHandler, openDrawer } = useCopilot();

  // Active Selectors
  const [selectedSku, setSelectedSku] = useState('CUP-12OZ-SW');
  const [selectedMarket, setSelectedMarket] = useState<MarketCode>('BR');
  const [batchVolume, setBatchVolume] = useState<number>(300000);

  // Simulation Sliders / Overrides
  const [targetMarginPercent, setTargetMarginPercent] = useState<number>(15);
  const [wasteRatePercent, setWasteRatePercent] = useState<number>(6.5);
  const [paperCifUSD, setPaperCifUSD] = useState<number>(1250);
  const [outsourcedPrintingRateUSD, setOutsourcedPrintingRateUSD] = useState<number>(4.50); // $/1000u
  const [outsourcedDieCuttingRateUSD, setOutsourcedDieCuttingRateUSD] = useState<number>(2.50); // $/1000u
  const [freightUSDPerThousand, setFreightUSDPerThousand] = useState<number>(1.80);

  // Active View Tab for Deep Dives
  const [activeTab, setActiveTab] = useState<'STRATEGIES' | 'SIMULATOR' | 'NESTING' | 'CAPEX'>('STRATEGIES');

  // Benchmark for selected market
  const marketBenchmark = useMemo(() => {
    if (selectedMarket === 'BR') return initialBenchmarkBR;
    if (selectedMarket === 'AR') return initialBenchmarkAR;
    if (selectedMarket === 'BO') return initialBenchmarkBO;
    return initialBenchmarkBR;
  }, [selectedMarket, initialBenchmarkBR, initialBenchmarkAR, initialBenchmarkBO]);

  // Real-time Industrial Cost calculation with separate outsourced components
  const baseInput: IndustrialProductCostInput = useMemo(() => {
    return initialIndustrialInput || {
      sku: selectedSku,
      paper_formula: {
        cif_price_ton_usd: paperCifUSD,
        customs_dispatch_percent: 13,
        financial_cost_percent: 6,
        printing_method: 'OFFSET',
        sheet_width_mm: 700,
        sheet_height_mm: 1000,
        gsm: 260,
        coating_gsm: 18,
        units_per_sheet: 11,
        paper_yield_units_per_ton: 56500,
      },
      bottom_paper_cost_ton_usd: 1350,
      bottom_yield_units_per_ton: 350000,
      printing_cost_mode: 'PER_THOUSAND',
      quoted_printing_rate_usd: outsourcedPrintingRateUSD + outsourcedDieCuttingRateUSD,
      operational_cost_per_thousand_usd: 5.40,
      machine_depreciation_per_thousand_usd: 3.50,
      scrap_rate_percent: wasteRatePercent,
      packaging_cost_per_thousand_usd: 2.20,
      batch_size: batchVolume,
    };
  }, [
    initialIndustrialInput,
    selectedSku,
    paperCifUSD,
    outsourcedPrintingRateUSD,
    outsourcedDieCuttingRateUSD,
    wasteRatePercent,
    batchVolume,
  ]);

  // Recalculate true unit cost in memory
  const breakdown: IndustrialCostBreakdown = useMemo(() => {
    const rawBreakdown = IndustrialCostEngine.calculateCost({
      ...baseInput,
      scrap_rate_percent: wasteRatePercent,
      paper_formula: {
        ...baseInput.paper_formula,
        cif_price_ton_usd: paperCifUSD,
      },
      quoted_printing_rate_usd: outsourcedPrintingRateUSD + outsourcedDieCuttingRateUSD,
      batch_size: batchVolume,
    });

    // Add separate outsourced vs internal costs
    const printCostUSD = Number((outsourcedPrintingRateUSD / 1000).toFixed(5));
    const dieCutCostUSD = Number((outsourcedDieCuttingRateUSD / 1000).toFixed(5));

    return {
      ...rawBreakdown,
      printing_outsourced_cost_usd: printCostUSD,
      die_cutting_outsourced_cost_usd: dieCutCostUSD,
      printing_internal_cost_usd: 0.00289,
      die_cutting_internal_cost_usd: 0.00185,
    };
  }, [baseInput, wasteRatePercent, paperCifUSD, outsourcedPrintingRateUSD, outsourcedDieCuttingRateUSD, batchVolume]);

  const unitCost = breakdown.true_unit_cost_usd;

  // KPIs
  const competitiveGapUSD = Number((unitCost - marketBenchmark).toFixed(4));
  const competitiveGapPercent = marketBenchmark > 0
    ? Number(((competitiveGapUSD / marketBenchmark) * 100).toFixed(2))
    : 0;

  const targetPrice = Number((unitCost / (1 - targetMarginPercent / 100)).toFixed(4));
  const marginAtBenchmark = marketBenchmark > 0
    ? Number((((marketBenchmark - unitCost) / marketBenchmark) * 100).toFixed(2))
    : 0;

  // 7 Commercial Pricing Strategies
  const strategies: PricingStrategyResult[] = useMemo(() => {
    return PricingEngine.calculateStrategies({
      unitCostUSD: unitCost,
      marketBenchmarkUSD: marketBenchmark,
      targetMarginPercent,
    });
  }, [unitCost, marketBenchmark, targetMarginPercent]);

  // Yield / Nesting calculations (90x100 vs 75x100 cm formats)
  const nestingComparison = useMemo(() => {
    return NestingEngine.compareFormats({
      paperCifTonUSD: paperCifUSD,
    });
  }, [paperCifUSD]);

  // Industrial Scenarios A, B, C, D with CAPEX and Payback
  const industrialScenarios = useMemo(() => {
    return IndustrialCapexEngine.evaluateScenarios({
      currentBreakdown: breakdown,
      marketBenchmarkUSD: marketBenchmark,
      annualVolumeUnits: 20_000_000,
    });
  }, [breakdown, marketBenchmark]);

  // Sync Copilot Context with live screen state
  useEffect(() => {
    updateScreenContext({
      route: '/pricing/strategy',
      module: 'pricing',
      sku: selectedSku,
      market: selectedMarket,
      volume: batchVolume,
      unitCostUSD: unitCost,
      benchmarkUSD: marketBenchmark,
      gapPercent: competitiveGapPercent,
      breakdownSnapshot: breakdown,
      customParams: {
        targetMarginPercent,
        wasteRatePercent,
        paperCifUSD,
        outsourcedPrintingRateUSD,
        outsourcedDieCuttingRateUSD,
      },
    });
  }, [
    selectedSku,
    selectedMarket,
    batchVolume,
    unitCost,
    marketBenchmark,
    competitiveGapPercent,
    breakdown,
    targetMarginPercent,
    wasteRatePercent,
    paperCifUSD,
    outsourcedPrintingRateUSD,
    outsourcedDieCuttingRateUSD,
    updateScreenContext,
  ]);

  // Register Copilot action listeners for this screen
  useEffect(() => {
    const unregister = registerActionHandler((action) => {
      if (action.action_type === 'SIMULATE_WASTE' && action.payload?.scrapRatePercent !== undefined) {
        setWasteRatePercent(action.payload.scrapRatePercent);
        setActiveTab('SIMULATOR');
      } else if (action.action_type === 'CHANGE_VOLUME' && action.payload?.newVolume !== undefined) {
        setBatchVolume(action.payload.newVolume);
      } else if (action.action_type === 'SWITCH_MARKET' && action.payload?.market !== undefined) {
        setSelectedMarket(action.payload.market);
      } else if (action.action_type === 'APPLY_PRICE_TARGET' && action.payload?.targetMarginPercent !== undefined) {
        setTargetMarginPercent(action.payload.targetMarginPercent);
      }
    });
    return unregister;
  }, [registerActionHandler]);

  // Strategy Table Columns
  const strategyColumns: Column<PricingStrategyResult>[] = [
    {
      key: 'title',
      header: 'Estrategia Comercial',
      render: (s) => (
        <div>
          <span className="font-semibold text-white text-xs">{s.title}</span>
          <span className="text-[10px] text-slate-500 font-mono block">{s.strategy}</span>
        </div>
      ),
      className: 'w-48',
    },
    {
      key: 'suggested_price_usd',
      header: 'Precio Sugerido',
      render: (s) => (
        <span className="font-mono text-sm font-bold text-white font-tabular">
          ${Number(s.suggested_price_usd).toFixed(4)}
        </span>
      ),
      align: 'right',
      className: 'w-28',
    },
    {
      key: 'margin_percent',
      header: 'Margen %',
      render: (s) => (
        <span
          className={`font-mono text-xs font-bold font-tabular ${
            s.margin_percent >= 15
              ? 'text-emerald-400'
              : s.margin_percent >= 10
              ? 'text-slate-200'
              : 'text-amber-400'
          }`}
        >
          {s.margin_percent}%
        </span>
      ),
      align: 'right',
      className: 'w-24',
    },
    {
      key: 'margin_usd',
      header: 'Margen ($/u)',
      render: (s) => (
        <span className="font-mono text-xs text-slate-300 font-tabular">
          ${Number(s.margin_usd).toFixed(4)}
        </span>
      ),
      align: 'right',
      className: 'w-28',
    },
    {
      key: 'price_gap_percent',
      header: 'Brecha vs Benchmark',
      render: (s) => (
        <span
          className={`font-mono text-xs font-bold font-tabular ${
            s.price_gap_percent <= 0 ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {s.price_gap_percent > 0 ? '+' : ''}{s.price_gap_percent}%
        </span>
      ),
      align: 'right',
      className: 'w-32',
    },
    {
      key: 'assumptions',
      header: 'Racional / Supuestos Comerciales',
      render: (s) => <span className="text-slate-400 text-xs leading-relaxed">{s.assumptions}</span>,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header: Module Badge & Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 4</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Pricing Strategy & Competitividad</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Estrategias de Precio & Análisis de Competitividad Industrial
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Integración de Costo Industrial Real, Benchmarks de Mercado, Desglose Tercerizado vs. Interno y Escenarios CAPEX.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/cost/cost-sheets">
            <Button variant="secondary" size="sm">
              <Factory className="h-3.5 w-3.5 mr-1.5" />
              Ver Hojas de Costo
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={openDrawer}
            className="flex items-center gap-1.5"
          >
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Consultar Copilot</span>
          </Button>
        </div>
      </div>

      {/* Selectors Bar: SKU, Market, Volume */}
      <div className="bg-[#141820] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* SKU */}
          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">SKU:</label>
            <select
              value={selectedSku}
              onChange={(e) => setSelectedSku(e.target.value)}
              className="bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono font-semibold focus:border-brand-500 focus:outline-none"
            >
              <option value="CUP-12OZ-SW">CUP-12OZ-SW (12 oz Simple Pared)</option>
              <option value="CUP-8OZ-SW">CUP-8OZ-SW (8 oz Simple Pared)</option>
              <option value="CUP-16OZ-SW">CUP-16OZ-SW (16 oz Simple Pared)</option>
              <option value="CUP-12OZ-DW">CUP-12OZ-DW (12 oz Doble Pared)</option>
            </select>
          </div>

          {/* Market */}
          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Mercado Objetivo:</label>
            <div className="flex items-center gap-1 bg-[#0c0f14] p-1 rounded border border-slate-800">
              {(['BR', 'AR', 'BO', 'PY'] as MarketCode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMarket(m)}
                  className={`px-3 py-1 text-xs rounded font-mono font-semibold transition-colors ${
                    selectedMarket === m
                      ? 'bg-brand-500 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Volume */}
          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">Volumen a Cotizar:</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="10000"
                value={batchVolume}
                onChange={(e) => setBatchVolume(parseFloat(e.target.value) || 0)}
                className="w-32 bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono font-bold focus:border-brand-500 focus:outline-none"
              />
              <div className="flex gap-1">
                {[100000, 300000, 500000, 1000000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBatchVolume(v)}
                    className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                      batchVolume === v
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-[#0c0f14] text-slate-400 hover:text-white border-slate-800'
                    }`}
                  >
                    {v / 1000}k
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-500 font-mono block">Fecha de Referencia:</span>
          <span className="text-xs text-slate-300 font-mono">Septiembre 2026</span>
        </div>
      </div>

      {/* KPI Cards: True Cost, Benchmark, Target Price, Gap, Margin */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-slate-400 font-medium block">Costo Unitario Real</span>
          <span className="text-xl font-black text-white font-mono font-tabular mt-1 block">
            ${unitCost.toFixed(5)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">USD / u en planta</span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-slate-400 font-medium block">Benchmark Mercado ({selectedMarket})</span>
          <span className="text-xl font-bold text-sky-400 font-mono font-tabular mt-1 block">
            ${marketBenchmark.toFixed(4)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">Precio de referencia local</span>
        </div>

        <div className="bg-[#141820] border border-brand-500/30 rounded-lg p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-brand-500/10 rounded-full blur-xl" />
          <span className="text-[11px] text-brand-300 font-medium block">Target Price ({targetMarginPercent}% Margen)</span>
          <span className="text-xl font-black text-white font-mono font-tabular mt-1 block">
            ${targetPrice.toFixed(4)}
          </span>
          <span className="text-[10px] text-brand-400 font-mono mt-0.5 block">Margen: ${Number((targetPrice - unitCost).toFixed(4))} USD/u</span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-slate-400 font-medium block">Competitive Gap</span>
          <span
            className={`text-xl font-bold font-mono font-tabular mt-1 block ${
              competitiveGapPercent <= 0 ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {competitiveGapPercent > 0 ? '+' : ''}{competitiveGapPercent}%
          </span>
          <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
            {competitiveGapPercent <= 0 ? 'Ventaja de costo vs mercado' : 'Desventaja de costo'}
          </span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded-lg p-4">
          <span className="text-[11px] text-slate-400 font-medium block">Margen a Precio Benchmark</span>
          <span
            className={`text-xl font-bold font-mono font-tabular mt-1 block ${
              marginAtBenchmark >= 10 ? 'text-emerald-400' : marginAtBenchmark >= 0 ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {marginAtBenchmark}%
          </span>
          <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">Margen si igualamos mercado</span>
        </div>
      </div>

      {/* Navigation Tabs for Deep Dive */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('STRATEGIES')}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            activeTab === 'STRATEGIES'
              ? 'bg-brand-500 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          1. Matriz de 7 Estrategias Comerciales
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('SIMULATOR')}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            activeTab === 'SIMULATOR'
              ? 'bg-brand-500 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          2. Simulador de Sensibilidad & Tercerizados
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('NESTING')}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            activeTab === 'NESTING'
              ? 'bg-brand-500 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          3. Yield / Nesting Calculator (90×100 vs 75×100)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('CAPEX')}
          className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            activeTab === 'CAPEX'
              ? 'bg-brand-500 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          4. Escenarios Industriales & Análisis CAPEX
        </button>
      </div>

      {/* TAB 1: 7 STRATEGIES TABLE */}
      {activeTab === 'STRATEGIES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">Matriz Detallada de 7 Estrategias de Precio</h2>
              <p className="text-xs text-slate-400">
                Calculadas en tiempo real contra el benchmark regional de {selectedMarket} (${marketBenchmark.toFixed(4)} USD)
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Costo Base: <strong className="text-white">${unitCost.toFixed(5)} USD</strong>
            </span>
          </div>

          <DataTable
            columns={strategyColumns}
            data={strategies}
            searchKey="title"
            searchPlaceholder="Buscar estrategia..."
            exportFilename={`pricing_strategies_${selectedSku}_${selectedMarket}.csv`}
            emptyMessage="No se pudieron generar estrategias."
          />
        </div>
      )}

      {/* TAB 2: LIVE SIMULATOR & OUTSOURCED VS INTERNAL */}
      {activeTab === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column (7 cols) */}
          <div className="lg:col-span-7 bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-5">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="h-4 w-4 text-brand-400" />
                Simulador de Sensibilidad Comercial
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Ajustá variables clave para recalcular instantáneamente el costo, el precio y el gap competitivo.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Target Margin Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">Margen Objetivo (%):</span>
                  <span className="font-mono font-bold text-emerald-400">{targetMarginPercent}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="35"
                  step="0.5"
                  value={targetMarginPercent}
                  onChange={(e) => setTargetMarginPercent(parseFloat(e.target.value))}
                  className="w-full accent-brand-500 cursor-pointer"
                />
              </div>

              {/* Waste Rate Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-300 font-medium">Merma de Proceso (%):</span>
                  <span className="font-mono font-bold text-amber-400">{wasteRatePercent}%</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="12"
                  step="0.5"
                  value={wasteRatePercent}
                  onChange={(e) => setWasteRatePercent(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Paper CIF */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium block">Precio CIF Tonelada Papel ($/ton):</label>
                <input
                  type="number"
                  step="10"
                  value={paperCifUSD}
                  onChange={(e) => setPaperCifUSD(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 font-mono text-white"
                />
                <span className="text-[10px] text-slate-500 font-mono block">
                  + 13% Despacho ($Number((paperCifUSD * 0.13).toFixed(2))) + 6% Dinero ($Number((paperCifUSD * 0.06).toFixed(2)))
                </span>
              </div>

              {/* Freight to destination */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium block">Flete Internacional a Destino ($/millar):</label>
                <input
                  type="number"
                  step="0.1"
                  value={freightUSDPerThousand}
                  onChange={(e) => setFreightUSDPerThousand(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 font-mono text-white"
                />
                <span className="text-[10px] text-slate-500 font-mono block">
                  ${(freightUSDPerThousand / 1000).toFixed(5)} USD / vaso
                </span>
              </div>
            </div>

            {/* Separated Outsourced Costs Model */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span>Modelado Separado: Impresión y Troquelado Tercerizado</span>
                <Badge variant="neutral">Actualmente 100% Tercerizado</Badge>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-[#0c0f14] rounded border border-slate-800 space-y-1.5">
                  <label className="text-slate-300 font-medium block">
                    1. Impresión Tercerizada (USD / millar):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={outsourcedPrintingRateUSD}
                    onChange={(e) => setOutsourcedPrintingRateUSD(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#141820] border border-slate-700 rounded px-3 py-1.5 font-mono text-amber-400 font-bold"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
                    <span>Costo unitario actual:</span>
                    <span>${(outsourcedPrintingRateUSD / 1000).toFixed(5)}/u</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-emerald-400/90 font-mono">
                    <span>Estimado con Flexo propia:</span>
                    <span>$0.00289/u (-${((outsourcedPrintingRateUSD / 1000) - 0.00289).toFixed(5)})</span>
                  </div>
                </div>

                <div className="p-3 bg-[#0c0f14] rounded border border-slate-800 space-y-1.5">
                  <label className="text-slate-300 font-medium block">
                    2. Troquelado Tercerizado (USD / millar):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={outsourcedDieCuttingRateUSD}
                    onChange={(e) => setOutsourcedDieCuttingRateUSD(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#141820] border border-slate-700 rounded px-3 py-1.5 font-mono text-amber-400 font-bold"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
                    <span>Costo unitario actual:</span>
                    <span>${(outsourcedDieCuttingRateUSD / 1000).toFixed(5)}/u</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-emerald-400/90 font-mono">
                    <span>Estimado con Troqueladora propia:</span>
                    <span>$0.00185/u (-${((outsourcedDieCuttingRateUSD / 1000) - 0.00185).toFixed(5)})</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Real-Time Result Card (5 cols) */}
          <div className="lg:col-span-5 bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800">
                Resultado de la Simulación en Vivo
              </h3>

              <div className="space-y-2.5 text-xs font-mono">
                <div className="flex justify-between items-center p-2 rounded bg-[#0c0f14] border border-slate-800">
                  <span className="text-slate-400">Costo Unitario Simulado:</span>
                  <span className="font-bold text-white text-sm">${unitCost.toFixed(5)} USD</span>
                </div>

                <div className="flex justify-between items-center p-2 rounded bg-[#0c0f14] border border-slate-800">
                  <span className="text-slate-400">Precio Sugerido ({targetMarginPercent}% Margen):</span>
                  <span className="font-bold text-emerald-400 text-sm">${targetPrice.toFixed(4)} USD</span>
                </div>

                <div className="flex justify-between items-center p-2 rounded bg-[#0c0f14] border border-slate-800">
                  <span className="text-slate-400">Ganancia Neta en Lote ({batchVolume.toLocaleString()} u):</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    ${((targetPrice - unitCost) * batchVolume).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                  </span>
                </div>

                <div className="flex justify-between items-center p-2 rounded bg-[#0c0f14] border border-slate-800">
                  <span className="text-slate-400">Brecha vs Benchmark {selectedMarket}:</span>
                  <span className={`font-bold text-sm ${competitiveGapPercent <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {competitiveGapPercent > 0 ? '+' : ''}{competitiveGapPercent}%
                  </span>
                </div>
              </div>

              {/* Gap Analysis Diagnostic */}
              <div className="p-3 bg-[#0c0f14] rounded border border-slate-800/80 text-xs space-y-1.5">
                <span className="font-semibold text-white block">Diagnóstico de Brecha:</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  {competitiveGapPercent <= 0
                    ? `✓ NIUPACK se encuentra un ${Math.abs(competitiveGapPercent)}% por debajo del benchmark de ${selectedMarket}. Existe margen suficiente para competir agresivamente sin sacrificar rentabilidad.`
                    : `⚠️ NIUPACK está ${competitiveGapPercent}% por encima del benchmark de ${selectedMarket}. Los principales drivers del gap son la merma geométrica del pliego 900x1000 y el sobrecosto de tercerización de imprenta.`}
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              className="w-full text-xs"
              onClick={() => setActiveTab('NESTING')}
            >
              Analizar Optimización de Pliego (Yield / Nesting) →
            </Button>
          </div>
        </div>
      )}

      {/* TAB 3: YIELD / NESTING CALCULATOR */}
      {activeTab === 'NESTING' && (
        <div className="space-y-6">
          <div className="bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Maximize2 className="h-4 w-4 text-sky-400" />
                  Yield / Nesting Calculator — Comparación Tecnológica de Impresión
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Caso real: Comparativa del formato actual de Paraguay (Banda Angosta 900×1000 mm) vs. Formato Competitivo Internacional (Banda Ancha 750×1000 mm).
                </p>
              </div>

              <Badge variant="brand">18 Conos por Pliego en ambos formatos</Badge>
            </div>

            {/* Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Narrow Web (Paraguay actual) */}
              <div className="bg-[#0c0f14] border border-slate-800 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">Formato Actual: Banda Angosta</span>
                  <Badge variant="neutral">900 × 1000 mm</Badge>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Área Total del Pliego:</span>
                    <span className="text-white font-bold">0.900 m²</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Piezas por Pliego:</span>
                    <span className="text-white font-bold">18 piezas</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Área Consumida por Cono:</span>
                    <span className="text-amber-400 font-bold">{nestingComparison.narrowFormat.areaPerPieceM2} m²/u</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Aprovechamiento Útil (Yield):</span>
                    <span className="text-slate-300 font-bold">{nestingComparison.narrowFormat.yieldPercent}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Costo Papel Cono (Unitario):</span>
                    <span className="text-white font-bold">${nestingComparison.narrowFormat.paperCostUnitUSD.toFixed(5)} USD</span>
                  </div>
                </div>

                <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded text-[11px] text-amber-300">
                  Desperdicio geométrico del pliego elevado por ancho sobredimensionado (900 mm).
                </div>
              </div>

              {/* Wide Web (Competitivo) */}
              <div className="bg-[#0c0f14] border border-emerald-800/60 rounded-lg p-4 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl" />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">Formato Competitivo: Banda Ancha</span>
                  <Badge variant="success">750 × 1000 mm</Badge>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Área Total del Pliego:</span>
                    <span className="text-white font-bold">0.750 m² (-16.7%)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Piezas por Pliego:</span>
                    <span className="text-white font-bold">18 piezas</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Área Consumida por Cono:</span>
                    <span className="text-emerald-400 font-bold">{nestingComparison.wideFormat.areaPerPieceM2} m²/u</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Aprovechamiento Útil (Yield):</span>
                    <span className="text-emerald-400 font-bold">{nestingComparison.wideFormat.yieldPercent}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Costo Papel Cono (Unitario):</span>
                    <span className="text-emerald-400 font-bold">${nestingComparison.wideFormat.paperCostUnitUSD.toFixed(5)} USD</span>
                  </div>
                </div>

                <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/50 rounded text-[11px] text-emerald-300">
                  Ahorro directo de materia prima: <strong>{nestingComparison.areaSavingPercent}% menos papel</strong> para fabricar exactamente el mismo cono.
                </div>
              </div>
            </div>

            {/* Impact Summary Banner */}
            <div className="p-4 bg-gradient-to-r from-slate-900 to-[#101925] border border-slate-700/80 rounded-lg flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Ahorro Unitario de Papel:</span>
                <span className="font-bold text-white text-base">
                  -${nestingComparison.unitCostSavingUSD.toFixed(5)} USD / vaso
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Ahorro en Volumen Anual (20M unidades):</span>
                <span className="font-bold text-emerald-400 text-base">
                  ${nestingComparison.annualSavingUSD20M.toLocaleString()} USD / año
                </span>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setActiveTab('CAPEX')}
              >
                Ver Escenarios Industriales & CAPEX →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SCENARIOS & CAPEX ANALYSIS */}
      {activeTab === 'CAPEX' && (
        <div className="space-y-6">
          <div className="bg-[#141820] border border-slate-800 rounded-lg p-5 space-y-5">
            <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Compass className="h-4 w-4 text-emerald-400" />
                  Comparación de 4 Escenarios Industriales & Retorno de Inversión (CAPEX)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Análisis estratégico de tercerización vs. integración vertical en planta propia (Volumen base: 20.000.000 u/año).
                </p>
              </div>
              <Badge variant="brand">Benchmark Brasil: ${marketBenchmark.toFixed(4)} USD</Badge>
            </div>

            {/* 4 Scenarios Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {industrialScenarios.map((scen) => (
                <div
                  key={scen.id}
                  className={`p-4 rounded-lg border flex flex-col justify-between space-y-4 ${
                    scen.id === 'SCENARIO_C_PARTIAL_INTEGRATION'
                      ? 'bg-[#121a24] border-brand-500/50'
                      : scen.id === 'SCENARIO_B_OUTSOURCED_WIDE'
                      ? 'bg-[#0f1715] border-emerald-800/60'
                      : 'bg-[#0c0f14] border-slate-800'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white">{scen.title}</span>
                      <Badge
                        variant={
                          scen.feasibility_status === 'IMMEDIATE'
                            ? 'success'
                            : scen.feasibility_status === 'CAPEX_VIABLE'
                            ? 'brand'
                            : 'neutral'
                        }
                        size="sm"
                      >
                        {scen.feasibility_status}
                      </Badge>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {scen.technology_description}
                    </p>

                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Costo Unitario:</span>
                        <span className="font-bold text-white">${scen.unit_cost_usd.toFixed(5)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Ahorro vs Actual:</span>
                        <span className="font-bold text-emerald-400">
                          {scen.unit_saving_vs_current_usd > 0
                            ? `-$${scen.unit_saving_vs_current_usd.toFixed(5)}/u`
                            : '0'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Brecha vs Brasil:</span>
                        <span
                          className={`font-bold ${
                            scen.cost_gap_vs_benchmark_percent <= 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {scen.cost_gap_vs_benchmark_percent > 0 ? '+' : ''}
                          {scen.cost_gap_vs_benchmark_percent}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Inversión CAPEX:</span>
                        <span className="font-bold text-slate-200">
                          {scen.capex_investment_usd > 0 ? `$${scen.capex_investment_usd.toLocaleString()} USD` : '$0'}
                        </span>
                      </div>
                      {scen.capex_investment_usd > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Ahorro Anual (20M):</span>
                            <span className="font-bold text-emerald-400">
                              +${scen.annual_saving_at_volume_usd.toLocaleString()} USD
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Payback Period:</span>
                            <span className="font-bold text-sky-400">{scen.payback_years} años</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">ROI Simple:</span>
                            <span className="font-bold text-emerald-400">{scen.roi_percent}% anual</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                    {scen.recommendation}
                  </div>
                </div>
              ))}
            </div>

            {/* Strategic Executive Recommendation Box */}
            <div className="p-4 bg-[#0c0f14] border border-slate-700 rounded-lg space-y-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Recomendación Estratégica para el Directorio de NIUPACK
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. <strong>Paso Inmediato (Mes 1):</strong> Migrar la cotización y compra de papel al formato <strong>750×1000 mm (Banda Ancha)</strong> con imprenta tercerizada (Escenario B). Ahorro directo e instantáneo de <strong>USD 93.600 anuales con CAPEX cero</strong>.
                <br />
                2. <strong>Paso Estratégico (Año 1-2):</strong> Evaluar la adquisición de una <strong>Impresora Flexográfica Central Drum de 850mm</strong> (Escenario C, inversión USD 180.000). A volúmenes superiores a <strong>20M unidades anuales</strong>, la inversión se repaga en <strong>1.5 años</strong> y deja a NIUPACK con una ventaja de costo estructural definitiva para liderar el Cono Sur.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
