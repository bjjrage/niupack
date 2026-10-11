'use client';

import React, { useState } from 'react';
import { ChevronDown, Radar } from 'lucide-react';
import { ProspectsPanel } from '@/components/licitaciones/ProspectsPanel';
import { ScanBar } from '@/components/licitaciones/ScanBar';
import { TenderBoard } from '@/components/licitaciones/TenderBoard';

export default function LicitacionesPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCompanies, setShowCompanies] = useState(false);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2"><Radar className="h-5 w-5 text-brand-500" />Licitaciones · Inyectables</h1>
        <p className="text-xs text-slate-400 mt-0.5 max-w-3xl">
          Seguimiento de las licitaciones públicas de medicamentos inyectables en Paraguay: cuáles están en curso, quiénes participan, cuándo se adjudican, a quién y qué productos. Información pública de DNCP, actualizada todos los días.
        </p>
      </div>

      <ScanBar onScanned={() => setRefreshKey((k) => k + 1)} />
      <TenderBoard refreshKey={refreshKey} />

      <div className="border-t border-slate-800 pt-4">
        <button onClick={() => setShowCompanies((v) => !v)} aria-expanded={showCompanies} className="flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white">
          <ChevronDown className={`h-4 w-4 transition-transform ${showCompanies ? 'rotate-180' : ''}`} />
          Empresas identificadas e importación manual (opcional)
        </button>
        {showCompanies && <div className="mt-3"><ProspectsPanel /></div>}
      </div>
    </div>
  );
}
