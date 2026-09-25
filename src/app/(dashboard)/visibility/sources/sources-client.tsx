'use client';

import React from 'react';
import { Globe } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';

interface Props {
  topSources: Array<{ domain: string; count: number }>;
}

export function SourcesClient({ topSources }: Props) {
  const columns: Column<{ domain: string; count: number }>[] = [
    {
      key: 'domain',
      header: 'Dominio / Fuente Web',
      render: (s) => (
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-slate-500" />
          <span className="font-semibold text-white text-xs">{s.domain}</span>
        </div>
      ),
    },
    {
      key: 'count',
      header: 'Veces Citado por OpenAI',
      render: (s) => (
        <span className="font-mono text-xs font-semibold text-slate-200 font-tabular">{s.count}</span>
      ),
      align: 'right',
      className: 'w-36',
    },
    {
      key: 'authority',
      header: 'Tipo de Fuente',
      render: (s) => {
        const isOfficial = s.domain.includes('niupack');
        const isCompetitor = s.domain.includes('copobras') || s.domain.includes('altacoppo');
        return (
          <Badge variant={isOfficial ? 'brand' : isCompetitor ? 'warning' : 'neutral'} size="sm">
            {isOfficial ? 'Sitio Oficial NIUPACK' : isCompetitor ? 'Competidor Directo' : 'Directorio / Portal B2B'}
          </Badge>
        );
      },
      className: 'w-48 text-center',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 1</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">AI Visibility</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Fuentes & Dominios Dominantes
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Dominios y URLs que OpenAI Web Search utiliza con mayor frecuencia para responder consultas de packaging.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={topSources}
        searchKey="domain"
        searchPlaceholder="Filtrar por dominio..."
        exportFilename="top_openai_sources.csv"
        emptyMessage="No se han registrado fuentes citadas aún. Ejecuta un run de visibilidad."
      />
    </div>
  );
}
