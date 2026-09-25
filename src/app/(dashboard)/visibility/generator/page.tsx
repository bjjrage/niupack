'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Layers,
  Filter,
  CheckCircle2,
  Lock,
  Trash2,
  Play,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { QueryItem, QueryCategory, MarketCode } from '@/types';
import { VisibilityStepper } from '@/components/visibility/VisibilityStepper';

export default function QueryGeneratorPage() {
  const router = useRouter();
  const [selectedCount, setSelectedCount] = useState<number>(100);
  const [customCount, setCustomCount] = useState<number>(250);
  const [isCustom, setIsCustom] = useState(false);
  const [selectedMarkets, setSelectedMarkets] = useState<MarketCode[]>(['BR', 'AR', 'BO', 'PY']);
  const [isGenerating, setIsGenerating] = useState(false);
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const [freezeModalOpen, setFreezeModalOpen] = useState(false);
  const [batteryName, setBatteryName] = useState('Batería Regional V2');
  const [batteryCode, setBatteryCode] = useState('BRAND_VISIBILITY_BR_AR_BO_V2');
  const [batteryType, setBatteryType] = useState<'FROZEN_MEASUREMENT' | 'DYNAMIC_DISCOVERY'>('FROZEN_MEASUREMENT');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

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
    if (selectedMarkets.length === 0) {
      setFeedbackMessage({ type: 'error', text: 'Debe seleccionar al menos un mercado objetivo.' });
      return;
    }

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
        setFeedbackMessage({
          type: 'success',
          text: `Se generaron exitosamente ${data.generated.length} consultas en 15 categorías para ${selectedMarkets.join(', ')}.`,
        });
      } else {
        const err = await res.json();
        setFeedbackMessage({
          type: 'error',
          text: `Error: ${err.error || 'No se pudieron generar consultas'}`,
        });
      }
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: 'Error de conexión al generar consultas.',
      });
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
    setFeedbackMessage({
      type: 'success',
      text: 'Todas las consultas propuestas fueron aprobadas para la batería.',
    });
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
    setFeedbackMessage({
      type: 'info',
      text: `Deduplicación completa: se eliminaron ${removedCount} consultas duplicadas. Total restante: ${unique.length}.`,
    });
  };

  const handleFreezeBattery = async () => {
    try {
      const approvedIds = queries
        .filter((q) => q.status === 'APPROVED' || q.status === 'ACTIVE')
        .map((q) => q.id);

      if (approvedIds.length === 0) {
        setFeedbackMessage({
          type: 'error',
          text: 'No hay consultas aprobadas para congelar. Apruebe las consultas antes de congelar.',
        });
        return;
      }

      const res = await fetch('/api/visibility/batteries/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batteryName,
          code: batteryCode,
          battery_type: batteryType,
          queryIds: approvedIds,
        }),
      });

      if (res.ok) {
        setFreezeModalOpen(false);
        setFeedbackMessage({
          type: 'success',
          text: `Batería guardada exitosamente como ${batteryCode} (${approvedIds.length} queries). Inmutable para mediciones D1/D15/D30.`,
        });
        fetchQueries();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filter queries based on selectedMarkets (dual role) and category filter
  const filteredQueries = queries.filter((q) => {
    if (activeCategoryFilter !== 'ALL' && q.category !== activeCategoryFilter) return false;
    if (selectedMarkets.length > 0 && !selectedMarkets.includes(q.country_code as MarketCode)) return false;
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
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
          {q.country_code}
        </span>
      ),
      className: 'w-16 text-center',
    },
    {
      key: 'category',
      header: 'Categoría (15)',
      render: (q) => (
        <Badge variant="neutral" size="sm">
          {q.category}
        </Badge>
      ),
      className: 'w-36',
    },
    {
      key: 'text',
      header: 'Consulta (Query Prompt para LLM + Web Search)',
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
      {/* 7-Step Navigation Stepper */}
      <VisibilityStepper currentStep={1} />

      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Paso 1 & 2</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">AI Visibility Engine</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Generador & Estrategia de Consultas
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Generación algorítmica de consultas para medir visibilidad en ChatGPT Search y LLMs con navegación activa.
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
            Congelar Batería
          </Button>
          <Link href="/visibility/batteries">
            <Button variant="primary" size="sm">
              <ArrowRight className="h-3.5 w-3.5 mr-1" />
              Ver Baterías & Ejecutar
            </Button>
          </Link>
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`p-3 rounded text-xs flex items-center justify-between border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
              : feedbackMessage.type === 'error'
              ? 'bg-red-950/40 border-red-800/60 text-red-200'
              : 'bg-blue-950/40 border-blue-800/60 text-blue-200'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-slate-400 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Metric Counters Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
        <div className="bg-[#11161d] border border-slate-800 p-3 rounded">
          <div className="text-[11px] text-slate-400">MERCADOS FILTRADOS</div>
          <div className="text-lg font-bold text-white mt-1">
            {selectedMarkets.length} / 4 <span className="text-xs text-brand-400 font-sans">({selectedMarkets.join(', ')})</span>
          </div>
        </div>
        <div className="bg-[#11161d] border border-slate-800 p-3 rounded">
          <div className="text-[11px] text-slate-400">QUERIES VISIBLES</div>
          <div className="text-lg font-bold text-emerald-400 mt-1">
            {filteredQueries.length} <span className="text-xs text-slate-500 font-sans">en tabla</span>
          </div>
        </div>
        <div className="bg-[#11161d] border border-slate-800 p-3 rounded">
          <div className="text-[11px] text-slate-400">TOTAL EN BATERÍA</div>
          <div className="text-lg font-bold text-white mt-1">
            {queries.length} <span className="text-xs text-slate-500 font-sans">cargadas</span>
          </div>
        </div>
        <div className="bg-[#11161d] border border-slate-800 p-3 rounded">
          <div className="text-[11px] text-slate-400">NUEVAS A GENERAR (N)</div>
          <div className="text-lg font-bold text-amber-400 mt-1">
            +{isCustom ? customCount : selectedCount} <span className="text-xs text-slate-500 font-sans">queries</span>
          </div>
        </div>
      </div>

      {/* Configuration & Generator Controls */}
      <div className="bg-[#141820] border border-slate-800 rounded p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-brand-500" />
            <span>Parámetros de Generación & Filtrado Unificado</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
            <Info className="h-3 w-3 text-slate-500" />
            La selección de mercados filtra la tabla y dirige la generación
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* Selector de Cantidad N */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Cantidad a Generar (N)
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
                placeholder="Ej. 250"
              />
            )}
          </div>

          {/* Mercados Objetivo (Filtro Unificado) */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Mercados Objetivo / Filtro Activo
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
                        // Keep at least 1 market or allow unselect
                        setSelectedMarkets(selectedMarkets.filter((x) => x !== m));
                      } else {
                        setSelectedMarkets([...selectedMarkets, m]);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded text-xs font-mono border transition-colors ${
                      isSelected
                        ? 'bg-brand-600/30 text-white border-brand-500 font-semibold shadow-sm'
                        : 'bg-[#10141b] text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    {m} {m === 'PY' ? '(Ctrl)' : ''}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedMarkets(['BR', 'AR', 'BO', 'PY'])}
                className="text-[10px] text-slate-400 hover:text-white underline ml-1"
              >
                Todos
              </button>
            </div>
          </div>

          {/* Botón de Ejecución */}
          <div className="flex items-end">
            <Button
              variant="primary"
              size="md"
              className="w-full font-semibold"
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
            <option value="ALL">Todas las 15 categorías</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
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
        searchPlaceholder="Buscar por texto de consulta, SKU o buyer persona..."
        exportFilename="queries_battery.csv"
        pageSize={15}
        emptyMessage="No hay consultas cargadas para los filtros seleccionados. Usa el generador superior."
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
        description="Una batería congelada queda fija para mediciones comparativas estrictas (Día 1, Día 15, Día 30)."
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
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Tipo de Batería</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBatteryType('FROZEN_MEASUREMENT')}
                className={`p-2.5 rounded border text-left text-xs ${
                  batteryType === 'FROZEN_MEASUREMENT'
                    ? 'bg-amber-950/40 border-amber-500 text-amber-200'
                    : 'bg-[#10141b] border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-amber-400" />
                  Medición Congelada
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Inmutable para comparar D1 vs D15</div>
              </button>
              <button
                type="button"
                onClick={() => setBatteryType('DYNAMIC_DISCOVERY')}
                className={`p-2.5 rounded border text-left text-xs ${
                  batteryType === 'DYNAMIC_DISCOVERY'
                    ? 'bg-brand-950/40 border-brand-500 text-brand-200'
                    : 'bg-[#10141b] border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                  Descubrimiento Dinámico
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Exploración abierta y editable</div>
              </button>
            </div>
          </div>

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
            <strong>Principio de Congelamiento:</strong> Se congelarán{' '}
            {queries.filter((q) => q.status === 'APPROVED' || q.status === 'ACTIVE').length} consultas aprobadas para los mercados {selectedMarkets.join(', ')}.
          </div>
        </div>
      </Modal>
    </div>
  );
}
