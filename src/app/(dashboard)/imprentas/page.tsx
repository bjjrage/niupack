import { Printer } from 'lucide-react';
import { RfqList } from '@/components/print-rfq/RfqList';

export default function ImprentasPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"><Printer className="h-5 w-5 text-brand-500" />Solicitudes a imprentas</h1>
        <p className="mt-0.5 max-w-3xl text-xs text-slate-400">
          Pedí presupuesto de impresión a imprentas locales: cada solicitud lleva el SKU y el arte a cotizar, cada imprenta responde por su propio enlace con su presupuesto adjunto, y la compra se decide con revisión humana, autorización y orden de compra.
        </p>
      </div>
      <RfqList />
    </div>
  );
}
