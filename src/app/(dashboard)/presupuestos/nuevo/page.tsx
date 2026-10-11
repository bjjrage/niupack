import Link from 'next/link';
import { QuoteEditor } from '@/components/sales-quotes/QuoteEditor';

export default function NuevoPresupuestoPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <Link href="/presupuestos" className="text-[11px] text-slate-400 hover:text-white">← Presupuestos</Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Nuevo presupuesto</h1>
      </div>
      <QuoteEditor />
    </div>
  );
}
