'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, Column } from '@/components/ui/DataTable';
import { MarketBenchmark } from '@/types';

interface Props {
  benchmarks: MarketBenchmark[];
}

export function BenchmarksClient({ benchmarks }: Props) {
  const columns: Column<MarketBenchmark>[] = [
    {
      key: 'country_code',
      header: 'País',
      render: (b) => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
          {b.country_code}
        </span>
      ),
      className: 'w-16',
    },
    {
      key: 'sku',
      header: 'SKU Homogéneo',
      render: (b) => (
        <div>
          <span className="font-mono text-xs font-bold text-brand-300">{b.sku}</span>
          <span className="text-[11px] text-slate-500 block">
            {b.sku.includes('12OZ') ? 'Vaso Polipapel 12 oz' : b.sku.includes('8OZ') ? 'Vaso 8 oz' : 'Vaso 16 oz'}
          </span>
        </div>
      ),
      className: 'w-40',
    },
    {
      key: 'min_price_usd',
      header: 'Mínimo',
      render: (b) => (
        <span className="font-mono text-xs text-slate-400 font-tabular">
          ${Number(b.min_price_usd).toFixed(4)}
        </span>
      ),
      align: 'right',
      className: 'w-24',
    },
    {
      key: 'median_price_usd',
      header: 'Mediana',
      render: (b) => (
        <span className="font-mono text-xs text-slate-300 font-tabular font-medium">
          ${Number(b.median_price_usd).toFixed(4)}
        </span>
      ),
      align: 'right',
      className: 'w-24',
    },
    {
      key: 'max_price_usd',
      header: 'Máximo',
      render: (b) => (
        <span className="font-mono text-xs text-slate-400 font-tabular">
          ${Number(b.max_price_usd).toFixed(4)}
        </span>
      ),
      align: 'right',
      className: 'w-24',
    },
    {
      key: 'weighted_benchmark_usd',
      header: 'Benchmark Ponderado',
      render: (b) => (
        <span className="font-mono text-xs font-bold text-emerald-400 font-tabular">
          ${Number(b.weighted_benchmark_usd).toFixed(4)}
        </span>
      ),
      align: 'right',
      className: 'w-32',
    },
    {
      key: 'observation_count',
      header: 'Muestras',
      render: (b) => (
        <span className="font-mono text-xs text-slate-300 font-tabular">
          {b.observation_count} obs
        </span>
      ),
      align: 'center',
      className: 'w-20',
    },
    {
      key: 'avg_confidence',
      header: 'Confianza',
      render: (b) => {
        const pct = Math.round(b.avg_confidence * 100);
        return (
          <Badge variant={pct >= 85 ? 'success' : pct >= 70 ? 'neutral' : 'warning'} size="sm">
            {pct}%
          </Badge>
        );
      },
      className: 'w-24 text-center',
    },
    {
      key: 'volume_range',
      header: 'Rango Volumen',
      render: (b) => (
        <span className="font-mono text-[11px] text-slate-400 font-tabular">
          {(b.volume_range.min / 1000).toFixed(0)}k - {(b.volume_range.max / 1000).toFixed(0)}k u
        </span>
      ),
      className: 'w-28 text-right',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 2</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Market Intelligence</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Benchmarks de Mercado (SKU × País)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Cálculo estadístico de precios mínimos, medianas y benchmarks ponderados por volumen y nivel de confianza.
          </p>
        </div>

        <Link href="/market/prices">
          <Button variant="secondary" size="sm">
            Ver Observaciones de Precios
          </Button>
        </Link>
      </div>

      {/* Strict SKU homogeneity note */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded flex items-start gap-3 text-xs text-slate-300">
        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white">Principio No Negociable de Homogeneidad Técnica:</strong> Los benchmarks se calculan exclusivamente agrupando observaciones del mismo SKU exacto (capacidad oz, pared simple/doble, gramaje). Nunca se promedian productos con especificaciones técnicas disímiles.
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={benchmarks}
        searchKey="sku"
        searchPlaceholder="Filtrar por SKU..."
        exportFilename="market_benchmarks.csv"
        emptyMessage="No hay suficientes observaciones de precios para calcular benchmarks. Carga precios en el módulo de precios."
      />
    </div>
  );
}
