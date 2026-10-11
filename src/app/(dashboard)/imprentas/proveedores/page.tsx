import { Factory } from 'lucide-react';
import { ProvidersPanel } from '@/components/print-rfq/ProvidersPanel';

export default function ImprentasProveedoresPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"><Factory className="h-5 w-5 text-brand-500" />Imprentas locales</h1>
        <p className="mt-0.5 max-w-3xl text-xs text-slate-400">Catálogo propio de imprentas con los procesos que ofrecen. Una imprenta desactivada no se puede invitar, pero conserva su historial.</p>
      </div>
      <ProvidersPanel />
    </div>
  );
}
