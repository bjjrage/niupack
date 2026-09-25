import React from 'react';
import { Cpu, AlertTriangle, CheckCircle2, Clock, Zap, Factory } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { repository } from '@/lib/db/repository';
import { TrueCostEngine } from '@/lib/engines/true-cost-engine';

export const revalidate = 0;

export default async function ProcessesPage() {
  const proc = await repository.getProcessDefinition('CUP-12OZ-SW');
  const steps = proc?.steps || [];
  const metrics = TrueCostEngine.calculateProcessMetrics(steps);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 3</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Process Engine</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Procesos Productivos & Rendimiento de Planta
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Modelado industrial de etapas productivas continuas: tiempos de ciclo, energía, setup, rendimiento y detección de cuellos de botella.
          </p>
        </div>

        <Badge variant="brand">Línea CUP-12OZ-SW</Badge>
      </div>

      {/* Process Analytics Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-[#141820] border border-slate-800 rounded p-4">
          <span className="text-xs text-slate-400 font-medium block">Merma Acumulada de Línea</span>
          <span className="text-2xl font-bold text-amber-400 font-mono font-tabular mt-1 block">
            {metrics.cumulativeScrapRatePercent}%
          </span>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">Rendimiento neto: {metrics.overallYieldPercent}%</span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded p-4">
          <span className="text-xs text-slate-400 font-medium block">Capacidad Máxima de Línea</span>
          <span className="text-2xl font-bold text-white font-mono font-tabular mt-1 block">
            {metrics.maxLineCapacityPerHour.toLocaleString()} u/h
          </span>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">Limitada por el cuello de botella</span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded p-4">
          <span className="text-xs text-slate-400 font-medium block">Tiempo Total de Setup</span>
          <span className="text-2xl font-bold text-slate-200 font-mono font-tabular mt-1 block">
            {metrics.totalSetupTimeMinutes} min
          </span>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">Calibración por lote</span>
        </div>

        <div className="bg-[#141820] border border-slate-800 rounded p-4">
          <span className="text-xs text-slate-400 font-medium block">Cuello de Botella Detectado</span>
          <span className="text-base font-bold text-red-400 truncate mt-1 block">
            {metrics.bottleneckStep?.name || 'Formado'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono mt-1 block">
            {metrics.bottleneckStep?.machine_name || 'Formadora Automática'}
          </span>
        </div>
      </div>

      {/* Industrial Steps Pipeline */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-white tracking-tight">
          Etapas del Flujo Productivo (Planta Industrial Asunción)
        </h3>

        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`bg-[#141820] border ${
                step.is_bottleneck ? 'border-red-900/60 bg-red-950/10' : 'border-slate-800'
              } rounded p-4 space-y-3`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded bg-slate-800 text-slate-200 font-mono text-xs font-bold flex items-center justify-center">
                    0{step.step_order}
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-white tracking-tight">{step.name}</h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Máquina: {step.machine_name} · Operadores: {step.operators_count}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {step.is_bottleneck && (
                    <Badge variant="danger" size="sm">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Cuello de Botella
                    </Badge>
                  )}
                  <Badge variant="neutral" size="sm">
                    Merma: {step.scrap_rate_percent}%
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 text-xs font-mono">
                <div>
                  <span className="text-slate-500 text-[11px] block">Tiempo de Ciclo:</span>
                  <span className="text-slate-200 font-medium">{step.cycle_time_seconds} s / ciclo</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Capacidad:</span>
                  <span className="text-slate-200 font-medium font-tabular">
                    {step.capacity_units_per_hour.toLocaleString()} u/h
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Setup / Puesta a Punto:</span>
                  <span className="text-slate-200 font-medium">{step.setup_time_minutes} min</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Consumo Energético:</span>
                  <span className="text-slate-200 font-medium">{step.energy_kwh_per_hour} kWh</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Costo Horario:</span>
                  <span className="text-emerald-400 font-medium font-tabular">${step.hourly_cost_usd} USD/h</span>
                </div>
              </div>

              {step.notes && (
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <strong className="text-slate-300">Control Operativo:</strong> {step.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
