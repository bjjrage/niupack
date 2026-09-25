'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Layers,
  Filter,
  CheckCircle2,
  XCircle,
  Lock,
  Trash2,
  RefreshCw,
  Plus,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { QueryItem, QueryCategory, MarketCode, QueryBattery } from '@/types';
import { OpenAIService } from '@/lib/openai/openai-service';

export default function QueryGeneratorPage() {
  const [selectedCount, setSelectedCount] = useState<number>(100);
  const [customCount, setCustomCount] = useState<number>(250);
  const [isCustom, setIsCustom] = useState(false);
  const [selectedMarkets, setSelectedMarkets] = useState<MarketCode[]>(['BR', 'AR', 'BO', 'PY']);
  const [isGenerating, setIsGenerating] = useState(false);
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [selectedBattery, setSelectedBattery] = useState<string>('default');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const [activeMarketFilter, setActiveMarketFilter] = useState<string>('ALL');
  const [freezeModalOpen, setFreezeModalOpen] = useState(false);
  const [batteryName, setBatteryName] = useState('Batería Regional V2');
  const [batteryCode, setBatteryCode] = useState('BRAND_VISIBILITY_BR_AR_BO_V2');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Load existing queries from API/repository
  useEffect(() => {
    fetchQueries();
  }, []);

  const fetchQueries = async () => {
    try {
      const res = await fetch('/api/visibility/queries');
      if (res.ok) {
        const data = await res.json();
        setQueries(data.queries || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setFeedbackMessage(null);
    const count = isCustom ? customCount : selectedCount;

    try {
      const res = await fetch('/api/visibility/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          markets: selectedMarkets,
          skus: ['CUP-12OZ-SW', 'CUP-8OZ-SW', 'CUP-16OZ-SW', 'CUP-12OZ-DW'],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setQueries((prev) => [...data.generated, ...prev]);
        setFeedbackMessage(`Se generaron exitosamente ${data.generated.length} consultas en 15 categorías.`);
      } else {
        const err = await res.json();
        setFeedbackMessage(`Error: ${err.error || 'No se pudieron generar consultas'}`);
      }
    } catch (err) {
      setFeedbackMessage(`Error de conexión al generar consultas.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveAll = async () => {
    setQueries((prev) =>
      prev.map((q) => (q.status === 'PROPOSED' ? { ...q, status: 'APPROVED' } : q))
    );
    await fetch('/api/visibility/queries/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'APPROVE_ALL' }),
    });
    setFeedbackMessage('Todas las consultas propuestas fueron aprobadas.');
  };

  const handleDeduplicate = () => {
    const seen = new Set<string>();
    const unique = queries.filter((q) => {
      const normalized = q.text.trim().toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    const removedCount = queries.length - unique.length;
    setQueries(unique);
    setFeedbackMessage(`Deduplicación completa: se eliminaron ${removedCount} consultas duplicadas.`);
  };

  const handleFreezeBattery = async () => {
    try {
      const res = await fetch('/api/visibility/batteries/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batteryName,
          code: batteryCode,
          queryIds: queries.filter((q) => q.status === 'APPROVED' || q.status === 'ACTIVE').map((q) => q.id),
        }),
      });

      if (res.ok) {
        setFreezeModalOpen(false);
        setFeedbackMessage(`Batería congelada exitosamente como ${batteryCode}. La batería es inmutable para mediciones comparativas.`);
        fetchQueries();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredQueries = queries.filter((q) => {
    if (activeCategoryFilter !== 'ALL' && q.category !== activeCategoryFilter) return false;
    if (activeMarketFilter !== 'ALL' && q.country_code !== activeMarketFilter) return false;
    return true;
  });

  const categories: QueryCategory[] = [
    'proveedor',
    'fabricante',
    'producto',
    'geográfica',
    'comparativa',
    'aplicación',
    'food service',
    'volumen',
    'mayorista',
    'personalización',
    'marca privada',
    'importación/exportación',
    'suministro regional',
    'precio',
    'grandes compradores',
  ];

  const columns: Column<QueryItem>[] = [
    {
      key: 'country_code',
      header: 'País',
      render: (q) => (
        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
          {q.country_code}
        </span>
      ),
      className: 'w-16',
    },
    {
      key: 'category',
      header: 'Categoría',
      render: (q) => (
        <Badge variant="neutral" size="sm">
          {q.category}
        </Badge>
      ),
      className: 'w-32',
    },
    {
      key: 'text',
      header: 'Consulta (Query Prompt para OpenAI)',
      render: (q) => <span className="font-medium text-slate-100">{q.text}</span>,
    },
    {
      key: 'sku',
      header: 'SKU / Producto',
      render: (q) => <span className="font-mono text-[11px] text-slate-400">{q.sku || 'N/A'}</span>,
      className: 'w-28',
    },
    {
      key: 'buyer_persona',
      header: 'Buyer Persona',
      render: (q) => <span className="text-slate-400 text-[11px] truncate">{q.buyer_persona}</span>,
      className: 'w-36',
    },
    {
      key: 'status',
      header: 'Estado',
      render: (q) => {
        const variants = {
          PROPOSED: 'neutral',
          APPROVED: 'success',
          REJECTED: 'danger',
          ACTIVE: 'brand',
        } as const;
        return (
          <Badge variant={variants[q.status] || 'neutral'} size="sm">
            {q.status}
          </Badge>
        );
      },
      className: 'w-24 text-center',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 1</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">AI Visibility Engine</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Query Strategy Engine (Generador de Baterías)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Generación algorítmica de consultas para medir visibilidad en ChatGPT con búsqueda web activa.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDeduplicate}>
            Deduplicar
          </Button>
          <Button variant="secondary" size="sm" onClick={handleApproveAll}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-400" />
            Aprobar Todas
          </Button>
          <Button variant="primary" size="sm" onClick={() => setFreezeModalOpen(true)}>
            <Lock className="h-3.5 w-3.5 mr-1" />
            Congelar Batería (Freeze)
          </Button>
        </div>
      </div>

      {feedbackMessage && (
        <div className="p-3 bg-brand-950/40 border border-brand-800/60 rounded text-xs text-brand-200 flex items-center justify-between">
          <span>{feedbackMessage}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Configuration & Generator Controls */}
      <div className="bg-[#141820] border border-slate-800 rounded p-4 space-y-4">
        <div className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-brand-500" />
          <span>Parámetros de Generación de Consultas</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Selector de Cantidad N */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Cantidad de Consultas (N)
            </label>
            <div className="flex items-center gap-1.5">
              {[100, 500, 1000, 2000].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    setSelectedCount(num);
                    setIsCustom(false);
                  }}
                  className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors border ${
                    !isCustom && selectedCount === num
                      ? 'bg-brand-500 text-white border-brand-500 font-semibold'
                      : 'bg-[#10141b] text-slate-300 border-slate-700/80 hover:bg-slate-800'
                  }`}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsCustom(true)}
                className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors border ${
                  isCustom
                    ? 'bg-brand-500 text-white border-brand-500 font-semibold'
                    : 'bg-[#10141b] text-slate-300 border-slate-700/80 hover:bg-slate-800'
                }`}
              >
                Custom
              </button>
            </div>
            {isCustom && (
              <input
                type="number"
                value={customCount}
                onChange={(e) => setCustomCount(Math.max(10, parseInt(e.target.value) || 10))}
                className="mt-2 w-32 bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
                placeholder="Ej. 3500"
              />
            )}
          </div>

          {/* Mercados Objetivo */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Mercados Objetivo
            </label>
            <div className="flex items-center gap-1.5">
              {(['BR', 'AR', 'BO', 'PY'] as MarketCode[]).map((m) => {
                const isSelected = selectedMarkets.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedMarkets(selectedMarkets.filter((x) => x !== m));
                      } else {
                        setSelectedMarkets([...selectedMarkets, m]);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded text-xs font-mono border transition-colors ${
                      isSelected
                        ? 'bg-slate-800 text-white border-slate-600 font-semibold'
                        : 'bg-[#10141b] text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    {m} {m === 'PY' ? '(Ctrl)' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Botón de Ejecución */}
          <div className="flex items-end">
            <Button
              variant="primary"
              size="md"
              className="w-full"
              isLoading={isGenerating}
              onClick={handleGenerate}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generar {isCustom ? customCount : selectedCount} Consultas
            </Button>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-slate-400 font-medium">Categoría:</span>
          <select
            value={activeCategoryFilter}
            onChange={(e) => setActiveCategoryFilter(e.target.value)}
            className="bg-[#141820] border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
          >
            <option value="ALL">Todas las 15 categorías ({queries.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <span className="text-slate-400 font-medium ml-2">Mercado:</span>
          <select
            value={activeMarketFilter}
            onChange={(e) => setActiveMarketFilter(e.target.value)}
            className="bg-[#141820] border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
          >
            <option value="ALL">Todos los países</option>
            <option value="BR">Brasil</option>
            <option value="AR">Argentina</option>
            <option value="BO">Bolivia</option>
            <option value="PY">Paraguay (Control)</option>
          </select>
        </div>

        <div className="text-slate-400 text-xs font-mono">
          Mostrando <span className="text-white font-medium">{filteredQueries.length}</span> de{' '}
          <span className="text-white font-medium">{queries.length}</span> consultas
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={filteredQueries}
        searchKey="text"
        searchPlaceholder="Filtrar por texto de consulta, SKU o buyer persona..."
        exportFilename="queries_battery.csv"
        pageSize={15}
        emptyMessage="No hay consultas cargadas. Usa el generador superior para crear N consultas en 15 categorías."
        actions={(row) => (
          <div className="flex items-center justify-end gap-1">
            {row.status === 'PROPOSED' && (
              <button
                title="Aprobar consulta"
                onClick={() =>
                  setQueries((prev) =>
                    prev.map((q) => (q.id === row.id ? { ...q, status: 'APPROVED' } : q))
                  )
                }
                className="p-1 hover:text-emerald-400 text-slate-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              title="Eliminar consulta"
              onClick={() => setQueries((prev) => prev.filter((q) => q.id !== row.id))}
              className="p-1 hover:text-red-400 text-slate-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      />

      {/* Modal Congelar Batería */}
      <Modal
        isOpen={freezeModalOpen}
        onClose={() => setFreezeModalOpen(false)}
        title="Congelar Batería de Consultas (Inmutable)"
        description="Una batería congelada no puede ser modificada. Se utilizará como patrón de referencia estricto para Día 1, Día 15 y Día 30."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setFreezeModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={handleFreezeBattery}>
              <Lock className="h-3.5 w-3.5 mr-1" />
              Confirmar y Congelar Batería
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Nombre Descriptivo</label>
            <input
              type="text"
              value={batteryName}
              onChange={(e) => setBatteryName(e.target.value)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Código de Versión Inmutable</label>
            <input
              type="text"
              value={batteryCode}
              onChange={(e) => setBatteryCode(e.target.value)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
            />
          </div>
          <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded text-xs text-amber-300">
            <strong>Principio No Negociable #4:</strong> Se congelarán {queries.filter((q) => q.status === 'APPROVED' || q.status === 'ACTIVE').length} consultas aprobadas. Ningún cambio silencioso podrá realizarse posteriormente sobre esta versión.
          </div>
        </div>
      </Modal>
    </div>
  );
}
