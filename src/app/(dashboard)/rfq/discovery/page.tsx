'use client';

import React from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * El descubrimiento automático de proveedores no está disponible. La versión anterior mostraba una lista fija
 * como si fuera una búsqueda web; ya no se presenta nada que no haya sido ingresado y aprobado por una persona.
 */
export default function SupplierDiscoveryPage() {
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Search className="h-5 w-5 text-brand-500" />Descubrimiento de proveedores</h1>
      </div>
      <section className="rounded border border-slate-800 bg-[#141820] p-4 space-y-3">
        <p className="text-sm text-white">El descubrimiento automático por web no está disponible.</p>
        <p className="text-xs text-slate-400">Los proveedores para una RFQ salen del Maestro de proveedores (cargados y aprobados por el equipo). Para encontrar compradores de cunas para ampollas usá <Link href="/licitaciones" className="text-brand-400 hover:underline">Licitaciones</Link>.</p>
        <div className="flex gap-2">
          <Link href="/market/suppliers"><Button size="sm" variant="secondary">Maestro de proveedores</Button></Link>
          <Link href="/rfq/rfqs"><Button size="sm">Ir a las RFQ</Button></Link>
        </div>
      </section>
    </div>
  );
}
