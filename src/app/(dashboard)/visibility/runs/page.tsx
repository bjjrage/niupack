'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Target,
  Play,
  Pause,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Clock,
  DollarSign,
  Layers,
  ArrowRight,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { QueryRun, QueryBattery, MarketCode } from '@/types';
import { OpenAIService } from '@/lib/openai/openai-service';

export default function VisibilityRunsPage() {
  const [runs, setRuns] = useState<QueryRun[]>([]);
  const [batteries, setBatteries] = useState<QueryBattery[]>([]);
  const [selectedBatteryId, setSelectedBatteryId] = useState<string>('');
  const [selectedMarkets, setSelectedMarkets] = useState<MarketCode[]>(['BR', 'AR', 'BO']);
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o');
  const [maxSpendLimit, setMaxSpendLimit] = useState<number>(25.0);
  const [isPreflightOpen, setIsPreflightOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeRunProgress, setActiveRunProgress] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
    const interval = setInterval(fetchRuns, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchInitialData = async () => {
    try {
      const [resRuns, resBatts] = await Promise.all([
        fetch('/api/visibility/runs'),
        fetch('/api/visibility/batteries'),
      ]);
      if (resRuns.ok) {
        const data = await resRuns.json();
        setRuns(data.runs || []);
      }
      if (resBatts.ok) {
        const data = await resBatts.json();
        setBatteries(data.batteries || []);
        if (data.batteries?.length > 0) {
          setSelectedBatteryId(data.batteries[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/visibility/runs');
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
        const running = data.runs?.find((r: QueryRun) => r.status === 'RUNNING');
        if (running) {
          const pct = running.total_queries > 0 ? Math.round((running.executed_queries / running.total_queries) * 100) : 0;
          setActiveRunProgress(pct);
        } else {
          setActiveRunProgress(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectedBattery = batteries.find((b) => b.id === selectedBatteryId);
  const queryCount = selectedBattery ? selectedBattery.query_count || 15 : 15;
  const costEstimate = OpenAIService.estimateVisibilityRunCost(queryCount, selectedModel);

  const handleLaunchRun = async () => {
    setIsExecuting(true);
    setIsPreflightOpen(false);
    setFeedback('Iniciando ejecución con contexto geográfico controlado...');

    try {
      const res = await fetch('/api/visibility/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batteryId: selectedBatteryId,
          markets: selectedMarkets,
          model: selectedModel,
          maxSpendLimitUSD: maxSpendLimit,
        }),
      });

      if (res.ok) {
        setFeedback('Ejecución lanzada. Monitoreando consultas y respuestas...');
        fetchRuns();
      } else {
        const err = await res.json();
        setFeedback(`Error al lanzar run: ${err.error}`);
      }
    } catch (err) {
      setFeedback('Error de conexión.');
    } finally {
      setIsExecuting(false);
    }
  };

  const columns: Column<QueryRun>[] = [
    {
      key: 'name',
      header: 'Nombre del Run',
      render: (r) => (
        <div>
          <span className="font-semibold text-white text-xs">{r.name}</span>
          <span className="text-[11px] text-slate-500 font-mono block">Modelo: {r.model}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => {
        const variants = {
          PENDING: 'neutral',
          RUNNING: 'warning',
          COMPLETED: 'success',
          FAILED: 'danger',
          PAUSED: 'neutral',
          CANCELLED: 'neutral',
        } as const;
        return <Badge variant={variants[r.status] || 'neutral'}>{r.status}</Badge>;
      },
      className: 'w-28 text-center',
    },
    {
      key: 'market_codes',
      header: 'Mercados',
      render: (r) => (
        <span className="font-mono text-xs text-slate-300">
          {r.market_codes?.join(', ') || 'BR, AR, BO'}
        </span>
      ),
      className: 'w-28',
    },
    {
      key: 'executed_queries',
      header: 'Progreso',
      render: (r) => (
        <div className="w-32">
          <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>
              {r.executed_queries} / {r.total_queries}
            </span>
            <span>{r.total_queries > 0 ? Math.round((r.executed_queries / r.total_queries) * 100) : 0}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${r.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-brand-500'}`}
              style={{
                width: `${r.total_queries > 0 ? (r.executed_queries / r.total_queries) * 100 : 0}%`,
              }}
            ></div>
          </div>
        </div>
      ),
    },
    {
      key: 'actual_cost_usd',
      header: 'Costo Real',
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-slate-200 font-tabular">
          ${Number(r.actual_cost_usd).toFixed(4)}
        </span>
      ),
      align: 'right',
      className: 'w-24',
    },
    {
      key: 'created_at',
      header: 'Fecha',
      render: (r) => (
        <span className="text-slate-400 text-xs font-mono">
          {new Date(r.created_at).toLocaleDateString('es')}
        </span>
      ),
      className: 'w-28',
    },
  ];

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
            Visibility Run Engine (Ejecución Independiente)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Lanzamiento y monitoreo de pruebas de visibilidad con OpenAI Responses API y búsqueda web con contexto geográfico controlado.
          </p>
        </div>

        <Button variant="primary" size="md" onClick={() => setIsPreflightOpen(true)}>
          <Play className="h-4 w-4 mr-2" />
          Configurar y Lanzar Run
        </Button>
      </div>

      {feedback && (
        <div className="p-3 bg-[#141820] border border-slate-700 rounded text-xs text-slate-200 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Controlled Geographical Context Notice */}
      <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded flex items-start gap-3 text-xs text-slate-300">
        <Sparkles className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white">Nota de Transparencia de Contexto Geográfico:</strong> Cada consulta se ejecuta de manera independiente, sin contexto previo de sesión, inyectando el contexto de mercado del comprador (BR: São Paulo, AR: Buenos Aires, BO: Santa Cruz, PY: Asunción). Esto constituye una prueba controlada y auditable.
        </div>
      </div>

      {/* Active Run Banner if running */}
      {activeRunProgress !== null && (
        <div className="bg-[#141820] border border-brand-500/50 rounded p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-500 animate-ping"></span>
              Ejecución de Run en curso...
            </span>
            <span className="font-mono text-brand-400 font-bold">{activeRunProgress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: `${activeRunProgress}%` }}></div>
          </div>
        </div>
      )}

      {/* Runs Table */}
      <DataTable
        columns={columns}
        data={runs}
        searchKey="name"
        searchPlaceholder="Buscar por nombre de run o modelo..."
        exportFilename="visibility_runs.csv"
        emptyMessage="No se han ejecutado runs todavía. Configura un run seleccionando una batería congelada."
        actions={(row) => (
          <Link href={`/visibility/runs/${row.id}`} className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> Ver Resultados
          </Link>
        )}
      />

      {/* Modal: Pre-Flight Cost Estimation & Confirmation */}
      <Modal
        isOpen={isPreflightOpen}
        onClose={() => setIsPreflightOpen(false)}
        title="Verificación Pre-Flight y Control de Costos"
        description="Estimación previa obligatoria de llamadas a OpenAI y búsqueda web antes de iniciar la ejecución."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsPreflightOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" isLoading={isExecuting} onClick={handleLaunchRun}>
              <Play className="h-3.5 w-3.5 mr-1" />
              Confirmar y Ejecutar Run
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Batería a Ejecutar</label>
            <select
              value={selectedBatteryId}
              onChange={(e) => setSelectedBatteryId(e.target.value)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            >
              {batteries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code}) — {b.query_count} consultas {b.is_frozen ? '[FROZEN]' : '[DRAFT]'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Modelo de OpenAI</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
            >
              <option value="gpt-4o">gpt-4o (Recomendado para búsqueda web profunda)</option>
              <option value="gpt-4o-mini">gpt-4o-mini (Económico / Alta velocidad)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Límite Máximo de Gasto para este Run (USD)
            </label>
            <input
              type="number"
              value={maxSpendLimit}
              onChange={(e) => setMaxSpendLimit(parseFloat(e.target.value) || 10)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
            />
          </div>

          {/* Estimation Breakdown Table */}
          <div className="p-3 bg-[#10141b] border border-slate-800 rounded font-mono text-xs space-y-1.5">
            <div className="flex justify-between text-slate-400">
              <span>Total Consultas:</span>
              <span className="text-white font-medium">{costEstimate.queryCount}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Búsquedas Web Estimadas:</span>
              <span className="text-white font-medium">{costEstimate.estimatedSearchCalls}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Tokens Estimados:</span>
              <span className="text-white font-medium">
                {(costEstimate.estimatedInputTokens + costEstimate.estimatedOutputTokens).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800">
              <span className="font-semibold text-white">Costo Estimado Total:</span>
              <span className="font-bold text-emerald-400 text-sm">
                ${costEstimate.estimatedCostUSD.toFixed(4)} USD
              </span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
