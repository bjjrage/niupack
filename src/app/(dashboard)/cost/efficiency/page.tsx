import React from 'react';
import Link from 'next/link';
import { TrendingUp, ArrowRight, ShieldCheck, CheckCircle2, Clock, DollarSign, Award } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { repository } from '@/lib/db/repository';
import { ScenarioEngine } from '@/lib/engines/scenario-engine';

export const revalidate = 0;

export default async function EfficiencyPage() {
  const sheet = await repository.getActiveCostSheetForSKU('CUP-12OZ-SW');
  const components = sheet?.components || [];
  const opportunities = ScenarioEngine.detectEfficiencyOpportunities(components, 20000000);

  const totalSavings = opportunities.reduce((sum, o) => sum + o.annual_savings_usd, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 3</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Efficiency Engine</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Oportunidades de Eficiencia & Reducción de Costo
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Detección algorítmica y ranking de ahorros industriales sustentados exclusivamente en los componentes reales de planta.
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-400 font-medium block">Ahorro Anual Potencial Identificado</span>
          <span className="text-xl font-bold text-emerald-400 font-mono font-tabular">
            ${totalSavings.toLocaleString()} USD / año
          </span>
        </div>
      </div>

      {/* Strict Data Integrity Rule */}
      <div className="p-3 bg-slate-900 border border-slate-800 rounded flex items-center gap-3 text-xs text-slate-300">
        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
        <span>
          <strong>Regla de Integridad de Datos:</strong> El sistema no proyecta ahorros abstractos. Cada oportunidad proviene directamente de los costos reales de merma, materias primas y tiempos de setup modelados en la hoja de costo activa.
        </span>
      </div>

      {/* Ranked Efficiency Opportunities List */}
      <div className="space-y-4">
        {opportunities.map((opp, idx) => (
          <div key={opp.id} className="bg-[#141820] border border-slate-800 rounded p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <span className="h-7 w-7 rounded bg-brand-950 text-brand-400 font-mono text-xs font-bold flex items-center justify-center border border-brand-800/60">
                  #{idx + 1}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">{opp.title}</h3>
                  <span className="text-xs text-slate-400">{opp.component_or_process}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={opp.risk_level === 'LOW' ? 'success' : 'warning'} size="sm">
                  Riesgo {opp.risk_level}
                </Badge>
                <span className="font-mono text-sm font-bold text-emerald-400 font-tabular px-2.5 py-1 rounded bg-[#10141b] border border-slate-800">
                  +${opp.annual_savings_usd.toLocaleString()} USD / año
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 text-xs font-mono">
              <div>
                <span className="text-slate-500 text-[11px] block">Métrica Actual:</span>
                <span className="text-red-400 font-medium">{opp.current_metric}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Métrica Objetivo:</span>
                <span className="text-emerald-400 font-medium">{opp.target_metric}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Inversión Requerida:</span>
                <span className="text-slate-200 font-tabular">
                  {opp.investment_required_usd > 0 ? `$${opp.investment_required_usd.toLocaleString()} USD` : 'USD 0 (Gestión)'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Tiempo de Implementación:</span>
                <span className="text-slate-200">{opp.implementation_time_weeks} semanas</span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Facilidad (1-5):</span>
                <span className="text-white font-bold">{opp.ease_score} / 5</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
