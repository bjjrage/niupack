'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { DollarSign, ShieldCheck, ArrowRight, TrendingUp, Layers, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { PricingEngine } from '@/lib/engines/pricing-engine';
import { PricingStrategyResult } from '@/types';
import { IndustrialCostCalculator } from '@/components/cost/IndustrialCostCalculator';

interface Props {
  initialUnitCost: number;
  initialBenchmark: number;
}

export function PricingClient({ initialUnitCost, initialBenchmark }: Props) {
  const [unitCost, setUnitCost] = useState(initialUnitCost);
  const [benchmarkPrice] = useState(initialBenchmark);

  const strategies = PricingEngine.calculateStrategies({
    unitCostUSD: unitCost,
    marketBenchmarkUSD: benchmarkPrice,
  });

  const columns: Column<PricingStrategyResult>[] = [
    {
      key: 'title',
      header: 'Estrategia Comercial',
      render: (s) => (
        <div>
          <span className="font-semibold text-white text-xs">{s.title}</span>
          <span className="text-[11px] text-slate-500 font-mono block">{s.strategy}</span>
        </div>
      ),
      className: 'w-48',
    },
    {
      key: 'suggested_price_usd',
      header: 'Precio Sugerido',
      render: (s) => (
        <div className="text-right">
          <span className="font-mono text-sm font-bold text-white font-tabular block">
            ${Number(s.suggested_price_usd).toFixed(4)}
          </span>
          <span className="font-mono text-[10px] text-amber-400 font-semibold block">
            Gs. {Math.round(Number(s.suggested_price_usd) * 6010).toLocaleString('es-PY')}
          </span>
        </div>
      ),
      align: 'right',
      className: 'w-32',
    },
    {
      key: 'margin_percent',
      header: 'Margen %',
      render: (s) => (
        <span
          className={`font-mono text-xs font-semibold font-tabular ${
            s.margin_percent >= 15 ? 'text-emerald-400' : s.margin_percent >= 10 ? 'text-slate-300' : 'text-amber-400'
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
      header: 'Margen ($ / Gs.)',
      render: (s) => (
        <div className="text-right">
          <span className="font-mono text-xs text-slate-300 font-tabular block">
            ${Number(s.margin_usd).toFixed(4)}
          </span>
          <span className="font-mono text-[10px] text-slate-500 block">
            Gs. {Math.round(Number(s.margin_usd) * 6010).toLocaleString('es-PY')}
          </span>
        </div>
      ),
      align: 'right',
      className: 'w-32',
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
      render: (s) => <span className="text-slate-400 text-xs">{s.assumptions}</span>,
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 3</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Pricing Engine Industrial</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Fijación de Precios y Formulación Industrial de Costos
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Carga directa de costos en el OS (CIF/ton + Despacho + Rendimiento x SKU + Impresión + Culito + Operativos + Merma + Empaque).
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="px-3 py-1.5 rounded bg-[#141820] border border-slate-800">
            <span className="text-slate-500 block text-[10px]">Costo Real Actual:</span>
            <span className="font-bold text-white">${unitCost.toFixed(5)} USD</span>
            <span className="text-[10px] text-amber-400 block font-bold">
              Gs. {Math.round(unitCost * 6010).toLocaleString('es-PY')} /u
            </span>
          </div>
          <div className="px-3 py-1.5 rounded bg-[#141820] border border-slate-800">
            <span className="text-slate-500 block text-[10px]">Benchmark BR:</span>
            <span className="font-bold text-emerald-400">${benchmarkPrice.toFixed(4)} USD</span>
            <span className="text-[10px] text-slate-400 block">
              Gs. {Math.round(benchmarkPrice * 6010).toLocaleString('es-PY')} /u
            </span>
          </div>
        </div>
      </div>

      {/* Industrial Interactive Cost Calculator */}
      <IndustrialCostCalculator
        initialSku="CUP-12OZ-SW"
        marketBenchmarkUSD={benchmarkPrice}
        onCostUpdated={(newCost) => setUnitCost(newCost)}
      />

      {/* Strategies Data Table */}
      <div className="space-y-3 pt-6 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Matriz Detallada de 7 Estrategias Comerciales</h2>
            <p className="text-xs text-slate-400">Comparativa con el Benchmark Regional de Brasil</p>
          </div>
          <Link href="/cost/scenarios">
            <Button variant="secondary" size="sm">
              Simular Escenarios de Sensibilidad
            </Button>
          </Link>
        </div>

        <DataTable
          columns={columns}
          data={strategies}
          searchKey="title"
          searchPlaceholder="Buscar estrategia..."
          exportFilename="pricing_strategies.csv"
          emptyMessage="No se generaron estrategias."
        />
      </div>
    </div>
  );
}
