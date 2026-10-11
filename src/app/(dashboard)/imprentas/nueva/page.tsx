import Link from 'next/link';
import { NewRfqForm } from '@/components/print-rfq/NewRfqForm';

export default function NuevaSolicitudPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <Link href="/imprentas" className="text-[11px] text-slate-400 hover:text-white">← Solicitudes</Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Nueva solicitud a imprentas</h1>
        <p className="mt-0.5 text-xs text-slate-400">Elegí el SKU, describí cómo debe imprimirse y adjuntá el arte. Después generás un enlace por imprenta.</p>
      </div>
      <NewRfqForm />
    </div>
  );
}
