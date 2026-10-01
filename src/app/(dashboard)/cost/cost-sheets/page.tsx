'use client';

import Link from 'next/link';
import { ArrowRight, Calculator, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IndustrialCostCalculator } from '@/components/cost/IndustrialCostCalculator';

export default function CostSheetsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2"><span className="text-[11px] font-mono font-semibold uppercase text-brand-400">Módulo 3</span><span className="text-xs text-slate-600">/</span><span className="text-xs text-slate-400">Cost Intelligence V1</span></div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Hojas de Costo Real por SKU</h1>
          <p className="mt-0.5 text-xs text-slate-400">Seis rubros trazables, parametrizables y persistidos. El Maestro de Productos & SKUs es la fuente única.</p>
        </div>
        <Link href="/cost/scenarios"><Button variant="secondary" size="sm">Simulador V1 <ArrowRight className="ml-1 h-3 w-3" /></Button></Link>
      </div>

      <div className="flex items-start gap-3 rounded border border-slate-800 bg-[#10141b] p-3 text-xs text-slate-300">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <span><strong className="text-white">Regla V1:</strong> la pantalla audita y reporta. No modifica GitHub Pages, procesos ni archivos de producción.</span>
      </div>

      <IndustrialCostCalculator />
    </div>
  );
}
