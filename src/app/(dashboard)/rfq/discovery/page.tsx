'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles, Factory, CheckCircle2, Globe, Mail, ShieldAlert, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { MarketCode, Supplier } from '@/types';

export default function SupplierDiscoveryPage() {
  const [targetMarket, setTargetMarket] = useState<MarketCode>('BR');
  const [productCategory, setProductCategory] = useState('cups');
  const [isSearching, setIsSearching] = useState(false);
  const [discovered, setDiscovered] = useState<Supplier[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleDiscover = async () => {
    setIsSearching(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/rfq/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country_code: targetMarket,
          category: productCategory,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDiscovered(data.suppliers || []);
        setFeedback(`Se descubrieron ${data.suppliers.length} fabricantes en ${targetMarket} mediante OpenAI Web Search.`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/market/suppliers/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        setDiscovered((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: 'APPROVED_FOR_CONTACT' } : s))
        );
        setFeedback('Proveedor aprobado para contacto comercial.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 4</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">RFQ Intelligence</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Descubrimiento Autónomo de Fabricantes
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Búsqueda web con OpenAI para identificar fabricantes directos de packaging en Brasil, Argentina y Bolivia.
          </p>
        </div>

        <Link href="/market/suppliers">
          <Button variant="secondary" size="sm">
            Ver Maestro de Proveedores
          </Button>
        </Link>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Discovery Controls */}
      <div className="bg-[#141820] border border-slate-800 rounded p-5 space-y-4">
        <h3 className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
          <Search className="h-4 w-4 text-brand-500" />
          <span>Parámetros de Búsqueda Web</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">País Objetivo</label>
            <select
              value={targetMarket}
              onChange={(e) => setTargetMarket(e.target.value as MarketCode)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            >
              <option value="BR">Brasil (São Paulo / Santa Catarina)</option>
              <option value="AR">Argentina (Buenos Aires)</option>
              <option value="BO">Bolivia (Santa Cruz)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Línea de Packaging</label>
            <select
              value={productCategory}
              onChange={(e) => setProductCategory(e.target.value)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            >
              <option value="cups">Vasos de Polipapel (8, 12, 16 oz)</option>
              <option value="lids">Tapas Herméticas para Vasos</option>
              <option value="bowls">Potes y Bowls de Helado</option>
              <option value="trays">Bandejas de Alimentos</option>
              <option value="thermoformed">Termoformados Industriales</option>
            </select>
          </div>

          <div className="flex items-end">
            <Button
              variant="primary"
              size="md"
              className="w-full"
              isLoading={isSearching}
              onClick={handleDiscover}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Ejecutar Búsqueda Web OpenAI
            </Button>
          </div>
        </div>
      </div>

      {/* Discovered Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-white tracking-tight">
          Fabricantes Identificados ({discovered.length})
        </h3>

        {discovered.length === 0 ? (
          <div className="p-8 text-center bg-[#141820] border border-slate-800 rounded text-slate-500 text-xs">
            Selecciona el país y ejecuta la búsqueda para identificar nuevos fabricantes y fuentes de cotización.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {discovered.map((s) => (
              <div key={s.id} className="bg-[#141820] border border-slate-800 rounded p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                        {s.country_code} · {s.city}
                      </span>
                      <h4 className="text-sm font-bold text-white tracking-tight mt-1">{s.name}</h4>
                    </div>
                    <Badge variant={s.status === 'APPROVED_FOR_CONTACT' ? 'success' : 'neutral'} size="sm">
                      {s.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-300 mt-2 bg-[#0c0f14] p-2.5 rounded border border-slate-800/80">
                    <strong className="text-slate-400 block text-[10px] mb-0.5">Evidencia de Búsqueda:</strong>
                    {s.discovery_evidence}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {s.website && (
                      <a href={s.website} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline inline-flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {s.website.replace('https://', '')}
                      </a>
                    )}
                    {s.email && (
                      <span className="text-slate-400 font-mono text-[11px] inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {s.email}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                  {s.status !== 'APPROVED_FOR_CONTACT' ? (
                    <Button variant="outline" size="sm" onClick={() => handleApprove(s.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                      Aprobar para Contacto RFQ
                    </Button>
                  ) : (
                    <Link href={`/rfq/rfqs`}>
                      <Button variant="secondary" size="sm">
                        Asignar a RFQ <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
