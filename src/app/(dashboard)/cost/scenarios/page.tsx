'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Compass, RefreshCw, DollarSign, TrendingDown, ArrowRight, ShieldCheck, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { KPICard } from '@/components/ui/KPICard';
import { CostSheetVersion } from '@/types';
import { ScenarioEngine } from '@/lib/engines/scenario-engine';

export default function ScenariosPage() {
  const [sheet, setSheet] = useState<CostSheetVersion | null>(null);

  // Simulation Sliders / Controls
  const [batchSize, setBatchSize] = useState<number>(500000);
  const [rawMaterialDelta, setRawMaterialDelta] = useState<number>(-5.0);
  const [scrapDelta, setScrapDelta] = useState<number>(-2.0);
  const [efficiencyDelta, setEfficiencyDelta] = useState<number>(10.0);
  const [marginTarget, setMarginTarget] = useState<number>(12.0);
  const [freightDelta, setFreightDelta] = useState<number>(0.0);
  const [targetMarketBenchmark, setTargetMarketBenchmark] = useState<number>(0.0495); // Copobras BR benchmark

  useEffect(() => {
    fetch('/api/cost/sheets?sku=CUP-12OZ-SW')
      .then((res) => res.json())
      .then((data) => setSheet(data.sheet || null))
      .catch(console.error);
  }, []);

  const components = sheet?.components || [];
  const simulation = ScenarioEngine.simulateScenario({
    components,
    batchSize,
    rawMaterialDeltaPercent: rawMaterialDelta,
    scrapDeltaPercent: scrapDelta,
    efficiencyDeltaPercent: efficiencyDelta,
    marginTargetPercent: marginTarget,
    freightDeltaPercent: freightDelta,
    marketBenchmarkUSD: targetMarketBenchmark,
    annualVolumeUnits: 20000000,
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 3</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Cost & Pricing</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Simulador de Escenarios What-If
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Modelado predictivo de impacto financiero ante variaciones en materia prima, reducción de merma, escala de lote y margen.
          </p>
        </div>

        <button
          onClick={() => {
            setBatchSize(500000);
            setRawMaterialDelta(-5.0);
            setScrapDelta(-2.0);
            setEfficiencyDelta(10.0);
            setMarginTarget(12.0);
            setFreightDelta(0.0);
          }}
          className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Restablecer escenario base
        </button>
      </div>

      {/* Main Simulator Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Simulation Sliders */}
        <div className="bg-[#141820] border border-slate-800 rounded p-5 space-y-5">
          <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white tracking-tight">Variables de Simulación</h3>
            <Badge variant="brand">Tiempo Real</Badge>
          </div>

          {/* Variable 1: Batch Size */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-medium">Tamaño de Lote (Escala)</span>
              <span className="font-mono text-white font-bold">{batchSize.toLocaleString()} u</span>
            </div>
            <div className="grid grid-cols-4 gap-1 text-[11px] font-mono">
              {[100000, 300000, 500000, 1000000].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setBatchSize(num)}
                  className={`p-1 rounded border transition-colors ${
                    batchSize === num
                      ? 'bg-brand-500 text-white border-brand-500 font-bold'
                      : 'bg-[#10141b] text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {(num / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          {/* Variable 2: Raw Material Delta */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-medium">Materia Prima / Papel</span>
              <span className={`font-mono font-bold ${rawMaterialDelta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {rawMaterialDelta > 0 ? '+' : ''}{rawMaterialDelta}%
              </span>
            </div>
            <input
              type="range"
              min="-15"
              max="15"
              step="1"
              value={rawMaterialDelta}
              onChange={(e) => setRawMaterialDelta(parseFloat(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
          </div>

          {/* Variable 3: Scrap (Merma) Delta */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-medium">Merma de Línea</span>
              <span className={`font-mono font-bold ${scrapDelta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {scrapDelta > 0 ? '+' : ''}{scrapDelta} pp
              </span>
            </div>
            <input
              type="range"
              min="-4"
              max="4"
              step="0.5"
              value={scrapDelta}
              onChange={(e) => setScrapDelta(parseFloat(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
          </div>

          {/* Variable 4: Efficiency Delta */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-medium">Eficiencia / Rendimiento Máquina</span>
              <span className="font-mono text-emerald-400 font-bold">+{efficiencyDelta}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="25"
              step="2.5"
              value={efficiencyDelta}
              onChange={(e) => setEfficiencyDelta(parseFloat(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
          </div>

          {/* Variable 5: Target Margin */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300 font-medium">Margen Objetivo de Venta</span>
              <span className="font-mono text-white font-bold">{marginTarget}%</span>
            </div>
            <input
              type="range"
              min="8"
              max="25"
              step="1"
              value={marginTarget}
              onChange={(e) => setMarginTarget(parseFloat(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
          </div>

          {/* Benchmark comparison target */}
          <div className="pt-2 border-t border-slate-800">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Benchmark de Comparación</label>
            <select
              value={targetMarketBenchmark}
              onChange={(e) => setTargetMarketBenchmark(parseFloat(e.target.value))}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-1.5 text-xs text-white font-mono"
            >
              <option value="0.0495">Brasil (Copobras Benchmark: USD 0.0495)</option>
              <option value="0.0588">Argentina (Pack Solutions Benchmark: USD 0.0588)</option>
              <option value="0.0630">Bolivia (Empaques Oriente Benchmark: USD 0.0630)</option>
            </select>
          </div>
        </div>

        {/* Right 2 Columns: Simulated Impact & Decision Metrics */}
        <div className="lg:col-span-2 space-y-5">
          {/* Key Simulation Result Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#141820] border border-slate-800 rounded p-4">
              <span className="text-xs text-slate-400 font-medium block">Nuevo Costo Unitario</span>
              <span className="text-2xl font-bold text-emerald-400 font-mono font-tabular mt-1 block">
                ${simulation.simulatedUnitCostUSD.toFixed(4)}
              </span>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                Base: ${simulation.baseUnitCostUSD.toFixed(4)} ({simulation.unitCostDeltaPercent}%)
              </span>
            </div>

            <div className="bg-[#141820] border border-slate-800 rounded p-4">
              <span className="text-xs text-slate-400 font-medium block">Nuevo Precio Oferta</span>
              <span className="text-2xl font-bold text-white font-mono font-tabular mt-1 block">
                ${simulation.suggestedPriceUSD.toFixed(4)}
              </span>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                Margen {simulation.marginPercent}% ($ {simulation.marginUSD.toFixed(4)}/u)
              </span>
            </div>

            <div className="bg-[#141820] border border-slate-800 rounded p-4">
              <span className="text-xs text-slate-400 font-medium block">Brecha vs Benchmark</span>
              <span
                className={`text-2xl font-bold font-mono font-tabular mt-1 block ${
                  simulation.priceGapPercent <= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {simulation.priceGapPercent > 0 ? '+' : ''}{simulation.priceGapPercent}%
              </span>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                USD {simulation.priceGapUSD > 0 ? '+' : ''}{simulation.priceGapUSD.toFixed(4)} / u
              </span>
            </div>

            <div className="bg-[#141820] border border-slate-800 rounded p-4">
              <span className="text-xs text-slate-400 font-medium block">Impacto Anual Proyectado</span>
              <span
                className={`text-2xl font-bold font-mono font-tabular mt-1 block ${
                  simulation.annualImpactUSD >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                ${Math.abs(simulation.annualImpactUSD).toLocaleString()}
              </span>
              <span className="text-[11px] text-slate-500 font-mono mt-1 block">
                {simulation.annualImpactUSD >= 0 ? 'Ahorro sobre 20M u' : 'Sobrecosto'}
              </span>
            </div>
          </div>

          {/* Decision Statement Card */}
          <div className="bg-[#141820] border border-slate-800 rounded p-5 space-y-3">
            <h3 className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-brand-500" />
              <span>Conclusión Estratégica del Escenario</span>
            </h3>

            <div className="p-3.5 bg-[#10141b] border border-slate-800 rounded text-xs text-slate-300 leading-relaxed">
              {simulation.priceGapPercent <= 2.0 ? (
                <div>
                  <strong className="text-emerald-400 block mb-1">✓ Escenario Altamente Competitivo:</strong>
                  Con este ajuste (lote {batchSize.toLocaleString()} u, merma {scrapDelta} pp y margen {marginTarget}%), el precio de oferta (${simulation.suggestedPriceUSD.toFixed(4)}) logra <strong className="text-white">paridad o ventaja competitiva</strong> frente al benchmark de mercado (${targetMarketBenchmark.toFixed(4)}). El impacto financiero directo equivale a un ahorro/contribución anual de <strong className="text-emerald-400 font-mono">${Math.abs(simulation.annualImpactUSD).toLocaleString()} USD</strong>.
                </div>
              ) : (
                <div>
                  <strong className="text-amber-400 block mb-1">⚠ Brecha Restante Desfavorable:</strong>
                  Aun con los parámetros simulados, el precio sugerido (${simulation.suggestedPriceUSD.toFixed(4)}) se ubica <strong className="text-amber-400 font-mono">+{simulation.priceGapPercent}%</strong> por encima del benchmark (${targetMarketBenchmark.toFixed(4)}). Se recomienda profundizar la reducción de merma o negociar volumen de compra de cartulina virgen.
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Link href="/cost/pricing">
                <Button variant="primary" size="sm">
                  Ver Estrategias de Precio Comerciales <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
