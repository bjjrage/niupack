import { Printer } from 'lucide-react';
import { RfqList } from '@/components/print-rfq/RfqList';

export default function ImprentasPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="border-b border-slate-800 pb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"><Printer className="h-5 w-5 text-brand-500" />RFQ a proveedores</h1>
        <p className="mt-0.5 max-w-3xl text-xs text-slate-400">
          Pedí cotización de productos o servicios a tus proveedores (imprentas, materia prima, servicios). Cada proveedor responde por su propio enlace con su presupuesto adjunto, y la compra se decide con revisión humana, autorización y orden de compra. Si es un trabajo de impresión, la solicitud lleva el SKU y el arte.
        </p>
      </div>
      <RfqList />
    </div>
  );
}
