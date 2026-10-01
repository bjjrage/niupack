import { Badge } from '@/components/ui/Badge';
import { ShieldCheck } from 'lucide-react';

export default function ProcessesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="border-b border-slate-800 pb-4"><span className="text-[11px] font-mono font-semibold uppercase text-slate-500">Cost Intelligence</span><h1 className="mt-1 text-xl font-bold text-white">Procesos Industriales</h1><p className="mt-1 text-xs text-slate-400">Módulo reservado para V2. No alimenta Cost Intelligence V1.</p></div>
      <div className="flex items-start gap-3 rounded border border-slate-700 bg-[#141820] p-5"><ShieldCheck className="mt-0.5 h-5 w-5 text-slate-400" /><div><Badge variant="neutral">EXPERIMENTAL / INACTIVO</Badge><p className="mt-3 text-sm leading-relaxed text-slate-300">La auditoría V1 no usa métricas de proceso, operadores, energía, mantenimiento, scrap de proceso ni costos horarios. El código histórico se conserva para una futura fase, fuera del cálculo oficial.</p></div></div>
    </div>
  );
}
