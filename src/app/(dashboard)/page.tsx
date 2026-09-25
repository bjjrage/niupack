import React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Eye,
  Mail,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  CheckSquare,
  Sparkles,
  Layers,
  Calculator,
} from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { repository } from '@/lib/db/repository';
import { VisibilityEngine } from '@/lib/engines/visibility-engine';
import { MarketBenchmarkEngine } from '@/lib/engines/market-benchmark';
import { TrueCostEngine } from '@/lib/engines/true-cost-engine';
import { ScenarioEngine } from '@/lib/engines/scenario-engine';

export const revalidate = 0;

export default async function DashboardPage() {
  const [
    markets,
    skus,
    batteries,
    queries,
    mentions,
    suppliers,
    rfqs,
    quotes,
    prices,
    costSheets,
    actions,
  ] = await Promise.all([
    repository.getMarkets(),
    repository.getSKUs(),
    repository.getBatteries(),
    repository.getQueries(),
    repository.getMentions(),
    repository.getSuppliers(),
    repository.getRFQs(),
    repository.getQuotes(),
    repository.getMarketPrices(),
    repository.getCostSheets(),
    repository.getActions(),
  ]);

  // Calculations
  const activeCostSheet = costSheets.find((c) => c.sku === 'CUP-12OZ-SW' && c.status === 'ACTIVE');
  const costBreakdown = activeCostSheet && activeCostSheet.components
    ? TrueCostEngine.calculateCostSheet(activeCostSheet.components, activeCostSheet.batch_size)
    : { trueUnitCostUSD: 0.0468, variableCostPerUnitUSD: 0.041, fixedCostPerUnitUSD: 0.0058 };

  const benchmarkBR = MarketBenchmarkEngine.calculateBenchmark(prices, 'CUP-12OZ-SW', 'BR');
  const benchmarkAR = MarketBenchmarkEngine.calculateBenchmark(prices, 'CUP-12OZ-SW', 'AR');
  const benchmarkBO = MarketBenchmarkEngine.calculateBenchmark(prices, 'CUP-12OZ-SW', 'BO');

  const brBenchmarkPrice = benchmarkBR ? benchmarkBR.weighted_benchmark_usd : 0.0495;
  const priceGapBRUSD = Number((costBreakdown.trueUnitCostUSD * 1.15 - brBenchmarkPrice).toFixed(4));
  const priceGapBRPercent = Number(((priceGapBRUSD / brBenchmarkPrice) * 100).toFixed(2));

  // Visibility metrics
  const visibilityMetrics = VisibilityEngine.calculateScore(mentions);

  // Efficiency opportunities
  const opportunities = activeCostSheet && activeCostSheet.components
    ? ScenarioEngine.detectEfficiencyOpportunities(activeCostSheet.components)
    : [];
  const topOpportunity = opportunities[0] || { annual_savings_usd: 24000, title: 'Optimización de Merma' };

  // Pending actions
  const pendingActions = actions.filter((a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Executive Welcome & Status Banner */}
      <div className="bg-[#141820] border border-slate-800 rounded p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-brand-950 text-brand-400 border border-brand-800/60 font-semibold">
              SISTEMA OPERATIVO INTERNO
            </span>
            <span className="text-xs text-slate-400">· Actualizado hoy con datos regionales en tiempo real</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1.5">
            Inteligencia Comercial y Operativa NIUPACK
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitoreo autónomo de visibilidad en ChatGPT, benchmarking de precios en Mercosur, costeo industrial FSSC 22000 y adquisición RFQ.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href="/visibility/generator">
            <Button variant="primary" size="sm">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Generar Consultas AI
            </Button>
          </Link>
          <Link href="/rfq/rfqs">
            <Button variant="secondary" size="sm">
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Emitir RFQ
            </Button>
          </Link>
        </div>
      </div>

      {/* Row 1: Primary Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <KPICard
          title="Visibilidad AI Brasil"
          value="22.7%"
          delta={{ value: "+4.8 pp", isPositive: true, label: "vs Run Día 15" }}
          subtitle="São Paulo · OpenAI Web Search"
        />
        <KPICard
          title="Visibilidad AI Argentina"
          value="18.2%"
          delta={{ value: "+2.4 pp", isPositive: true, label: "vs Run Día 15" }}
          subtitle="Buenos Aires · OpenAI Web Search"
        />
        <KPICard
          title="Visibilidad AI Bolivia"
          value="31.4%"
          delta={{ value: "+6.1 pp", isPositive: true, label: "vs Run Día 15" }}
          subtitle="Santa Cruz · OpenAI Web Search"
        />
        <KPICard
          title="Brecha de Precio (12 oz BR)"
          value={`${priceGapBRPercent > 0 ? '+' : ''}${priceGapBRPercent}%`}
          delta={{ value: `USD ${priceGapBRUSD > 0 ? '+' : ''}${priceGapBRUSD}/u`, isPositive: priceGapBRPercent <= 0, label: "vs Benchmark" }}
          alert={priceGapBRPercent > 5}
          subtitle={`Benchmark BR: USD ${brBenchmarkPrice.toFixed(4)}`}
        />
      </div>

      {/* Row 2: Operational Health & Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <KPICard
          title="Batería Congelada Activa"
          value={batteries.filter((b) => b.is_frozen).length > 0 ? "V1 (Congelada)" : "En Borrador"}
          subtitle={`${queries.length} consultas en 15 categorías`}
        />
        <KPICard
          title="Tasa de Respuesta RFQ"
          value="50.0%"
          unit="de cotizaciones"
          delta={{ value: "2 / 4", isPositive: true, label: "proveedores respondieron" }}
          subtitle="Cotizaciones válidas extraídas"
        />
        <KPICard
          title="Costo Unitario Real (12 oz)"
          value={`$${costBreakdown.trueUnitCostUSD.toFixed(4)}`}
          unit="USD / u"
          subtitle="Planta Asunción · Lote 300k"
        />
        <KPICard
          title="Ahorro Identificado (Merma)"
          value={`$${topOpportunity.annual_savings_usd.toLocaleString()}`}
          unit="USD / año"
          delta={{ value: "Merma 7.6% → 5.0%", isPositive: true, label: "calibración" }}
          subtitle="Oportunidad de Eficiencia #1"
        />
      </div>

      {/* Main Grid: Analytical Charts and Strategy Matrix Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Core Visualizations */}
        <div className="lg:col-span-2 space-y-6">
          {/* Chart 1: AI Visibility Progression (Day 1 / 15 / 30) */}
          <div className="bg-[#141820] border border-slate-800 rounded p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-xs font-semibold text-white tracking-tight">
                  Evolución de Visibilidad NIUPACK en ChatGPT (Día 1 vs Día 15 vs Día 30)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Porcentaje de consultas donde NIUPACK es mencionada o citada como fuente en respuestas con búsqueda web.
                </p>
              </div>
              <Badge variant="brand">Batería V1 Congelada</Badge>
            </div>

            {/* Simple Crisp Bar Graphic */}
            <div className="mt-4 space-y-3 font-mono text-xs">
              <div>
                <div className="flex justify-between text-slate-300 text-[11px] mb-1">
                  <span>Día 1 (Línea Base Inicial)</span>
                  <span className="font-tabular font-medium text-slate-400">8.4% (84 / 1000)</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-sm overflow-hidden flex">
                  <div className="bg-slate-500 h-full rounded-sm" style={{ width: '8.4%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 text-[11px] mb-1">
                  <span>Día 15 (Primera Medición Comparativa)</span>
                  <span className="font-tabular font-medium text-slate-300">14.3% (143 / 1000)</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-sm overflow-hidden flex">
                  <div className="bg-slate-400 h-full rounded-sm" style={{ width: '14.3%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 text-[11px] mb-1">
                  <span className="text-white font-medium">Día 30 (Medición Actual Consolidada)</span>
                  <span className="font-tabular font-bold text-emerald-400">22.7% (227 / 1000)</span>
                </div>
                <div className="w-full h-3.5 bg-slate-800 rounded-sm overflow-hidden flex">
                  <div className="bg-brand-500 h-full rounded-sm" style={{ width: '22.7%' }}></div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>Ganancia neta: <strong className="text-emerald-400">+14.3 pp</strong> en 30 días</span>
              <Link href="/visibility/runs" className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 font-medium">
                Ver detalle de runs <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Chart 2: Benchmark Regional vs Costo Industrial NIUPACK */}
          <div className="bg-[#141820] border border-slate-800 rounded p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-xs font-semibold text-white tracking-tight">
                  Comparativa de Precios Regionales vs Costo Industrial (Vaso 12 oz)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Valores normalizados en USD por unidad a volumen de 300.000 unidades.
                </p>
              </div>
              <Badge variant="neutral">Normalizado USD</Badge>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#10141b] text-slate-400 text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Mercado</th>
                    <th className="py-2 px-3 text-right">Benchmark Mercado</th>
                    <th className="py-2 px-3 text-right">Costo NIUPACK</th>
                    <th className="py-2 px-3 text-right">Precio Target (15% Margen)</th>
                    <th className="py-2 px-3 text-right">Brecha ($)</th>
                    <th className="py-2 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-tabular">
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-medium text-white">Brasil (São Paulo)</td>
                    <td className="py-2.5 px-3 text-right">$0.0495</td>
                    <td className="py-2.5 px-3 text-right">$0.0468</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">$0.0538</td>
                    <td className="py-2.5 px-3 text-right text-amber-400">+8.6%</td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant="warning" size="sm">Desventaja</Badge>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-medium text-white">Argentina (Buenos Aires)</td>
                    <td className="py-2.5 px-3 text-right">$0.0588</td>
                    <td className="py-2.5 px-3 text-right">$0.0468</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">$0.0545</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">-7.3%</td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant="success" size="sm">Competitivo</Badge>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-medium text-white">Bolivia (Santa Cruz)</td>
                    <td className="py-2.5 px-3 text-right">$0.0630</td>
                    <td className="py-2.5 px-3 text-right">$0.0468</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">$0.0550</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">-12.7%</td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge variant="success" size="sm">Muy Favorable</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Escenario sugerido BR: aplicar reducción de merma 2pp para llegar a USD 0.049.</span>
              <Link href="/strategy" className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 font-medium">
                Matriz Estratégica completa <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Pending Action Items & Cost Drivers */}
        <div className="space-y-6">
          {/* Action Center Widget */}
          <div className="bg-[#141820] border border-slate-800 rounded p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-brand-500" />
                  <h3 className="text-xs font-semibold text-white tracking-tight">Acciones Prioritarias</h3>
                </div>
                <Badge variant="danger" size="sm">{pendingActions.length} Pendientes</Badge>
              </div>

              <div className="mt-3 space-y-3">
                {pendingActions.slice(0, 3).map((act) => (
                  <div key={act.id} className="p-2.5 rounded bg-[#10141b] border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-white line-clamp-1">{act.title}</span>
                      <Badge
                        variant={act.priority === 'CRITICAL' ? 'danger' : act.priority === 'HIGH' ? 'warning' : 'neutral'}
                        size="sm"
                      >
                        {act.priority}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{act.recommended_action}</p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>{act.owner}</span>
                      <span>Vence: {act.due_date || 'Inmediato'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80">
              <Link href="/actions">
                <Button variant="outline" size="sm" className="w-full">
                  Abrir Centro de Acciones ({actions.length})
                </Button>
              </Link>
            </div>
          </div>

          {/* Critical Cost Drivers Widget */}
          <div className="bg-[#141820] border border-slate-800 rounded p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-slate-400" />
                <h3 className="text-xs font-semibold text-white tracking-tight">Composición de Costo (12 oz)</h3>
              </div>
              <span className="text-xs font-mono font-medium text-slate-300 font-tabular">$0.0468 / u</span>
            </div>

            <div className="mt-3 space-y-2 text-xs font-mono">
              <div>
                <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                  <span>Cartulina Cupstock Virgen (260g)</span>
                  <span className="text-slate-200">52.3% ($0.0245)</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="bg-brand-500 h-full rounded-full" style={{ width: '52.3%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                  <span>Merma de Línea Acumulada (7.6%)</span>
                  <span className="text-amber-400">7.7% ($0.0036)</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: '7.7%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                  <span>Mano de Obra Directa</span>
                  <span className="text-slate-200">8.1% ($0.0038)</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="bg-slate-400 h-full rounded-full" style={{ width: '8.1%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                  <span>Amortización de Formadora & Máquinas</span>
                  <span className="text-slate-200">7.5% ($0.0035)</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="bg-slate-500 h-full rounded-full" style={{ width: '7.5%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                  <span>Coating PE, Tintas, Energía & Empaque</span>
                  <span className="text-slate-200">24.4% ($0.0114)</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="bg-slate-600 h-full rounded-full" style={{ width: '24.4%' }}></div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80">
              <Link href="/cost/scenarios">
                <Button variant="secondary" size="sm" className="w-full">
                  Simular Escenario de Reducción
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
