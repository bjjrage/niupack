import { FileText } from 'lucide-react';
import { QuoteList } from '@/components/sales-quotes/QuoteList';

export default function PresupuestosPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"><FileText className="h-5 w-5 text-brand-500" />Presupuestos a clientes</h1>
        <p className="mt-0.5 max-w-3xl text-xs text-slate-400">Armá el presupuesto con los SKU del catálogo, con el formato NIUPACK listo para enviar. Cuando el cliente acepta, se genera la Orden de Trabajo.</p>
      </div>
      <QuoteList />
    </div>
  );
}
