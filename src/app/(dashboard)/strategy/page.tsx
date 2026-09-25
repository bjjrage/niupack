import React from 'react';
import Link from 'next/link';
import {
  Compass,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ShieldCheck,
  CheckSquare,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { repository } from '@/lib/db/repository';
import { OpenAIService } from '@/lib/openai/openai-service';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';
import { TrueCostEngine } from '@/lib/engines/true-cost-engine';
import { StrategyMatrixRow, MarketCode } from '@/types';

export const revalidate = 0;

export default async function StrategyPage() {
  const [sheet, prices, mentions] = await Promise.all([
    repository.getActiveCostSheetForSKU('CUP-12OZ-SW'),
    repository.getMarketPrices(),
    repository.getMentions(),
  ]);

  const unitCost = sheet?.true_unit_cost_usd || 0.0468;
  const sku = 'CUP-12OZ-SW';

  // Build matrix rows for BR, AR, BO, PY
  const targetMarkets: Array<{ code: MarketCode; score: number }> = [
    { code: 'BR', score: 22.7 },
    { code: 'AR', score: 18.2 },
    { code: 'BO', score: 31.4 },
    { code: 'PY', score: 88.0 },
  ];

  const rows: StrategyMatrixRow[] = targetMarkets.map((m) => {
    const bench = MarketBenchmarkEngine.calculateBenchmark(prices, sku, m.code);
    return OpenAIService.buildStrategyRow({
      country_code: m.code,
      sku,
      visibility_score: m.score,
      market_benchmark_usd: bench?.weighted_benchmark_usd || (m.code === 'BR' ? 0.0495 : m.code === 'AR' ? 0.0588 : 0.063),
      benchmark_confidence: bench?.avg_confidence || 0.85,
      niupack_cost_usd: unitCost,
    });
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Cerebro del OS</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Estrategia Comercial</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Strategy Engine: Matriz País × SKU
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Síntesis ejecutiva que combina Visibilidad AI + Precios de Mercado + Cotizaciones RFQ + Costo Industrial + Escenarios Predictivos.
          </p>
        </div>

        <Link href="/actions">
          <Button variant="primary" size="sm">
            <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
            Ver Acciones Derivadas
          </Button>
        </Link>
      </div>

      {/* Synthesis Matrix */}
      <div className="space-y-4">
        {rows.map((row) => {
          const isParityOrBetter = row.competitive_status === 'COMPETITIVE' || row.competitive_status === 'PARITY';
          return (
            <div key={row.country_code} className="bg-[#141820] border border-slate-800 rounded p-5 space-y-4">
              {/* Country & Status Topline */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono text-sm font-bold flex items-center justify-center">
                    {row.country_code}
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">{row.country_name}</h3>
                    <span className="text-xs font-mono text-brand-400">{row.sku} · {row.sku_name}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      row.competitive_status === 'COMPETITIVE'
                        ? 'success'
                        : row.competitive_status === 'PARITY'
                        ? 'neutral'
                        : 'warning'
                    }
                    size="md"
                  >
                    {row.competitive_status}
                  </Badge>
                </div>
              </div>

              {/* Data Grid: 5 Core Dimensions */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs font-mono">
                <div className="p-2.5 rounded bg-[#10141b] border border-slate-800">
                  <span className="text-slate-500 text-[11px] block">Visibilidad AI:</span>
                  <span className="text-white font-bold font-tabular text-sm mt-0.5 block">
                    {row.visibility_score}%
                  </span>
                  <span className="text-[10px] text-slate-500">ChatGPT Web</span>
                </div>

                <div className="p-2.5 rounded bg-[#10141b] border border-slate-800">
                  <span className="text-slate-500 text-[11px] block">Benchmark Mercado:</span>
                  <span className="text-emerald-400 font-bold font-tabular text-sm mt-0.5 block">
                    ${row.market_benchmark_usd.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-slate-500">Conf: {Math.round(row.benchmark_confidence * 100)}%</span>
                </div>

                <div className="p-2.5 rounded bg-[#10141b] border border-slate-800">
                  <span className="text-slate-500 text-[11px] block">Costo NIUPACK:</span>
                  <span className="text-white font-bold font-tabular text-sm mt-0.5 block">
                    ${row.niupack_cost_usd.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-slate-500">Planta Asunción</span>
                </div>

                <div className="p-2.5 rounded bg-[#10141b] border border-slate-800">
                  <span className="text-slate-500 text-[11px] block">Precio Target (15%):</span>
                  <span className="text-white font-bold font-tabular text-sm mt-0.5 block">
                    ${row.target_price_usd.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-slate-500">USD / unidad</span>
                </div>

                <div className="p-2.5 rounded bg-[#10141b] border border-slate-800">
                  <span className="text-slate-500 text-[11px] block">Brecha de Precio:</span>
                  <span
                    className={`font-bold font-tabular text-sm mt-0.5 block ${
                      row.price_gap_percent <= 0 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {row.price_gap_percent > 0 ? '+' : ''}{row.price_gap_percent}%
                  </span>
                  <span className="text-[10px] text-slate-500">
                    USD {row.price_gap_usd > 0 ? '+' : ''}{row.price_gap_usd.toFixed(4)}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-[#10141b] border border-slate-800">
                  <span className="text-slate-500 text-[11px] block">Margen Bruto:</span>
                  <span className="text-white font-bold font-tabular text-sm mt-0.5 block">
                    {row.margin_percent}%
                  </span>
                  <span className="text-[10px] text-slate-500">Margen Objetivo</span>
                </div>
              </div>

              {/* Drivers & Recommended Actionable Scenario */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                <div className="p-3 rounded bg-[#0c0f14] border border-slate-800/80 space-y-1">
                  <strong className="text-slate-400 text-[11px] uppercase block tracking-wider font-mono">
                    Drivers Críticos de Costo:
                  </strong>
                  <ul className="text-slate-300 space-y-1 text-xs">
                    {row.critical_drivers.map((d, didx) => (
                      <li key={didx} className="flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-brand-500"></span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 rounded bg-[#0c0f14] border border-slate-800/80 space-y-1">
                  <strong className="text-slate-400 text-[11px] uppercase block tracking-wider font-mono">
                    Escenario de Simulación Recomendado:
                  </strong>
                  <p className="text-emerald-300 text-xs font-mono font-medium">{row.recommended_scenario}</p>
                  <p className="text-slate-400 text-[11px] mt-1">{row.strategic_recommendation}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
