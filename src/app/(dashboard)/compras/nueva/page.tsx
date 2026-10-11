import Link from 'next/link';
import { NewRfqForm } from '@/components/print-rfq/NewRfqForm';

export default function NuevaSolicitudPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <Link href="/compras" className="text-[11px] text-slate-400 hover:text-white">← Solicitudes</Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Nueva solicitud a proveedores</h1>
        <p className="mt-0.5 text-xs text-slate-400">Describí lo que necesitás cotizar. Si es impresión, marcá que requiere arte y adjuntalo por ítem. Después generás un enlace por proveedor.</p>
      </div>
      <NewRfqForm />
    </div>
  );
}
