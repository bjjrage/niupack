'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Target,
  Play,
  Sparkles,
  CheckCircle2,
  Clock,
  DollarSign,
  Layers,
  ArrowRight,
  Eye,
  Lock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { QueryRun, QueryBattery, MarketCode } from '@/types';
import { VisibilityStepper } from '@/components/visibility/VisibilityStepper';

export default function VisibilityRunsPage() {
  const [runs, setRuns] = useState<QueryRun[]>([]);
  const [batteries, setBatteries] = useState<QueryBattery[]>([]);
  const [selectedBatteryId, setSelectedBatteryId] = useState<string>('');
  const [executionLabel, setExecutionLabel] = useState<'D1 BASELINE' | 'D15' | 'D30' | 'CUSTOM'>('D1 BASELINE');
  const [customLabel, setCustomLabel] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o');
  const [maxSpendLimit, setMaxSpendLimit] = useState<number>(25.0);
  const [isPreflightOpen, setIsPreflightOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeRunProgress, setActiveRunProgress] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    fetchInitialData();
    const interval = setInterval(fetchRuns, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchInitialData = async () => {
    try {
      const [resRuns, resBatts] = await Promise.all([
        fetch('/api/visibility/runs'),
        fetch('/api/visibility/batteries/freeze'),
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

  const handleLaunchRun = async () => {
    if (!selectedBatteryId) {
      setFeedback({ type: 'error', text: 'Seleccione una batería para ejecutar.' });
      return;
    }

    setIsExecuting(true);
    setIsPreflightOpen(false);
    setFeedback({ type: 'info', text: 'Iniciando ejecución con contexto geográfico controlado...' });

    const label = executionLabel === 'CUSTOM' ? (customLabel || 'CUSTOM') : executionLabel;

    try {
      const res = await fetch('/api/visibility/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batteryId: selectedBatteryId,
          model: selectedModel,
          maxSpendLimitUSD: maxSpendLimit,
          executionLabel: label,
        }),
      });

      if (res.ok) {
        setFeedback({ type: 'success', text: 'Ejecución lanzada. Monitoreando consultas y respuestas...' });
        fetchRuns();
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', text: `Error al lanzar run: ${err.error}` });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Error de conexión.' });
    } finally {
      setIsExecuting(false);
    }
  };

  const columns: Column<QueryRun>[] = [
    {
      key: 'created_at',
      header: 'Fecha / Hora',
      render: (r) => (
        <div className="font-mono text-xs">
          <span className="text-slate-200 block">{new Date(r.created_at).toLocaleDateString('es')}</span>
          <span className="text-[10px] text-slate-500">{new Date(r.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      ),
      className: 'w-24',
    },
    {
      key: 'execution_label',
      header: 'Etiqueta',
      render: (r) => (
        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-brand-950 text-brand-400 border border-brand-800/60 inline-block">
          {r.execution_label || 'RUN'}
        </span>
      ),
      className: 'w-28 text-center',
    },
    {
      key: 'name',
      header: 'Batería & Modelo',
      render: (r) => (
        <div>
          <span className="font-medium text-white text-xs block">{r.name}</span>
          <span className="text-[10px] text-slate-400 font-mono">
            {r.model} • {r.market_codes?.join(', ') || 'BR, AR, BO, PY'}
          </span>
        </div>
      ),
    },
    {
      key: 'visibility_score',
      header: 'Score Visibilidad',
      render: (r) => {
        const score = r.visibility_score;
        return (
          <div className="text-center">
            <span
              className={`font-mono text-sm font-bold ${
                score !== undefined && score > 0
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {score !== undefined ? `${score}%` : 'N/A'}
            </span>
          </div>
        );
      },
      className: 'w-28 text-center',
    },
    {
      key: 'mention_rate',
      header: 'Menciones',
      render: (r) => (
        <span className="font-mono text-xs text-slate-300">
          {r.mention_rate !== undefined ? `${r.mention_rate}%` : '—'}
        </span>
      ),
      className: 'w-20 text-center',
    },
    {
      key: 'link_rate',
      header: 'Links',
      render: (r) => (
        <span className="font-mono text-xs text-slate-300">
          {r.link_rate !== undefined ? `${r.link_rate}%` : '—'}
        </span>
      ),
      className: 'w-20 text-center',
    },
    {
      key: 'source_rate',
      header: 'Fuentes',
      render: (r) => (
        <span className="font-mono text-xs text-slate-300">
          {r.source_rate !== undefined ? `${r.source_rate}%` : '—'}
        </span>
      ),
      className: 'w-20 text-center',
    },
    {
      key: 'executed_queries',
      header: 'Progreso',
      render: (r) => (
        <div className="w-24">
          <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-0.5">
            <span>{r.executed_queries}/{r.total_queries}</span>
            <span>{r.total_queries > 0 ? Math.round((r.executed_queries / r.total_queries) * 100) : 0}%</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${r.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-brand-500'}`}
              style={{ width: `${r.total_queries > 0 ? (r.executed_queries / r.total_queries) * 100 : 0}%` }}
            />
          </div>
        </div>
      ),
      className: 'w-28',
    },
    {
      key: 'actual_cost_usd',
      header: 'Costo',
      render: (r) => (
        <span className="font-mono text-xs font-semibold text-slate-300 font-tabular">
          ${Number(r.actual_cost_usd || 0).toFixed(3)}
        </span>
      ),
      align: 'right',
      className: 'w-20',
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
        return (
          <div className="flex flex-col items-center gap-1">
            <Badge variant={variants[r.status] || 'neutral'} size="sm">
              {r.status}
            </Badge>
            {r.is_simulated && (
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/60">
                SIMULADO
              </span>
            )}
          </div>
        );
      },
      className: 'w-24 text-center',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 7-Step Navigation Stepper */}
      <VisibilityStepper currentStep={5} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Paso 5</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">AI Visibility Engine</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Historial de Ejecuciones & Auditoría
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro de mediciones longitudinales (D1 Baseline, D15, D30) con trazabilidad de costos, tasas de mención y enlaces web.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchRuns}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Actualizar
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsPreflightOpen(true)}>
            <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
            Nueva Ejecución
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded text-xs flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
              : feedback.type === 'error'
              ? 'bg-red-950/40 border-red-800/60 text-red-200'
              : 'bg-blue-950/40 border-blue-800/60 text-blue-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white ml-4">✕</button>
        </div>
      )}

      {/* Active Run Banner */}
      {activeRunProgress !== null && (
        <div className="bg-[#141820] border border-brand-500/50 rounded-lg p-4 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-500 animate-ping"></span>
              Ejecución de Run en curso en OpenAI Search...
            </span>
            <span className="font-mono text-brand-400 font-bold">{activeRunProgress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: `${activeRunProgress}%` }} />
          </div>
        </div>
      )}

      {/* Runs Table */}
      <DataTable
        columns={columns}
        data={runs}
        searchKey="name"
        searchPlaceholder="Buscar en historial por nombre o etiqueta..."
        exportFilename="visibility_runs_history.csv"
        emptyMessage="No se han ejecutado runs todavía. Lanza una medición desde Baterías o con el botón Nueva Ejecución."
        actions={(row) => (
          <Link
            href={`/visibility/runs/${row.id}`}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 bg-brand-950/60 border border-brand-800/60 px-2 py-1 rounded"
          >
            <Eye className="h-3.5 w-3.5" /> Ver Auditoría
          </Link>
        )}
      />

      {/* Modal: Quick Launch */}
      <Modal
        isOpen={isPreflightOpen}
        onClose={() => setIsPreflightOpen(false)}
        title="Lanzar Nueva Medición de Visibilidad"
        description="Seleccione la batería congelada y configure los parámetros de ejecución."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsPreflightOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" isLoading={isExecuting} onClick={handleLaunchRun}>
              <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
              Confirmar y Ejecutar
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Batería a Evaluar</label>
            <select
              value={selectedBatteryId}
              onChange={(e) => setSelectedBatteryId(e.target.value)}
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
            >
              {batteries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code}) — {b.query_count} queries [{b.is_frozen ? 'FROZEN' : 'DRAFT'}]
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Etiqueta de Medición Longitudinal
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['D1 BASELINE', 'D15', 'D30', 'CUSTOM'] as const).map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setExecutionLabel(label)}
                  className={`p-2 rounded border text-center font-mono text-xs transition-colors ${
                    executionLabel === label
                      ? 'bg-brand-600/30 text-white border-brand-500 font-bold'
                      : 'bg-[#10141b] text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {executionLabel === 'CUSTOM' && (
              <input
                type="text"
                placeholder="Ej. RUN_EXPANSION_BR"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="mt-2 w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Modelo de OpenAI</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              >
                <option value="gpt-4o">gpt-4o (Búsqueda Web)</option>
                <option value="gpt-4o-mini">gpt-4o-mini (Económico)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Límite de Gasto (USD)</label>
              <input
                type="number"
                value={maxSpendLimit}
                onChange={(e) => setMaxSpendLimit(parseFloat(e.target.value) || 10)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
