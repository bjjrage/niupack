import React from 'react';
import Link from 'next/link';
import { Layers, Lock, ShieldCheck, Plus, ArrowRight, Eye, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { repository } from '@/lib/db/repository';

export const revalidate = 0;

export default async function BatteriesPage() {
  const batteries = await repository.getBatteries();
  const queries = await repository.getQueries();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 1</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">AI Visibility</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Baterías de Consultas & Control de Versiones
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Baterías inmutables congeladas para trazabilidad longitudinal (Día 1, Día 15, Día 30) y baterías dinámicas para exploración.
          </p>
        </div>

        <Link href="/visibility/generator">
          <Button variant="primary" size="sm">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Crear Nueva Batería
          </Button>
        </Link>
      </div>

      {/* Info Card on Immutability */}
      <div className="bg-[#141820] border border-slate-800 rounded p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <h4 className="font-semibold text-white tracking-tight">Principio No Negociable de Inmutabilidad</h4>
          <p className="text-slate-400 mt-0.5">
            Una vez congelada una batería (status <code>FROZEN</code>), ninguna consulta puede ser alterada silenciosamente. Esto asegura comparabilidad estadística rigurosa entre las mediciones de los Días 1, 15 y 30.
          </p>
        </div>
      </div>

      {/* Batteries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {batteries.map((b) => {
          const batteryQueries = queries.filter((q) => q.battery_id === b.id);
          return (
            <div
              key={b.id}
              className={`bg-[#141820] border ${
                b.is_frozen ? 'border-slate-800' : 'border-amber-700/50'
              } rounded p-5 flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                      VERSIÓN {b.version}
                    </span>
                    <h3 className="text-base font-semibold text-white tracking-tight mt-1.5">{b.name}</h3>
                    <span className="text-xs font-mono text-brand-400 mt-0.5 block">{b.code}</span>
                  </div>
                  <Badge variant={b.is_frozen ? 'brand' : 'warning'}>
                    {b.is_frozen ? (
                      <span className="inline-flex items-center gap-1">
                        <Lock className="h-3 w-3" /> CONGELADA
                      </span>
                    ) : (
                      'DINÁMICA'
                    )}
                  </Badge>
                </div>

                <p className="text-xs text-slate-400 mt-3">{b.description || 'Sin descripción adicional.'}</p>

                <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[11px] block">Consultas en Batería:</span>
                    <span className="font-bold text-slate-200 text-sm">{batteryQueries.length || b.query_count}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Mercados Objetivo:</span>
                    <span className="text-slate-200">{b.market_codes.join(', ')}</span>
                  </div>
                  {b.frozen_at && (
                    <div className="col-span-2 text-[11px] text-slate-500">
                      Congelada el: {new Date(b.frozen_at).toLocaleString('es')}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <Link href={`/visibility/runs?batteryId=${b.id}`}>
                  <Button variant="secondary" size="sm">
                    Lanzar Run con esta Batería
                  </Button>
                </Link>
                <Link
                  href="/visibility/generator"
                  className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 font-medium"
                >
                  Inspeccionar consultas <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
