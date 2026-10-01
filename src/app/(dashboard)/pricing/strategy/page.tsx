'use client';

import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IndustrialCostCalculator } from '@/components/cost/IndustrialCostCalculator';

export default function PricingStrategyPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4"><div><span className="text-[11px] font-mono font-semibold uppercase text-brand-400">Pricing Strategy</span><h1 className="mt-1 text-xl font-bold text-white">Precio sugerido desde True Cost V1</h1><p className="mt-0.5 text-xs text-slate-400">El precio parte de una hoja de costo real seleccionada desde el Maestro. Sin benchmark ficticio ni CAPEX de proceso.</p></div><Link href="/cost/scenarios"><Button variant="secondary" size="sm">Simular escenarios <ArrowRight className="ml-1 h-3 w-3" /></Button></Link></div>
      <div className="flex items-start gap-3 rounded border border-slate-800 bg-[#10141b] p-3 text-xs text-slate-300"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>Las estrategias comerciales V1 se calculan únicamente sobre los seis rubros habilitados y un benchmark real, si existe.</span></div>
      <IndustrialCostCalculator />
    </div>
  );
}
