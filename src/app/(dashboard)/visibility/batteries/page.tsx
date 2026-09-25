'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Layers,
  Lock,
  Unlock,
  ShieldCheck,
  Plus,
  ArrowRight,
  Play,
  Copy,
  TrendingUp,
  History,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { QueryBattery, QueryRun, VisibilitySnapshot } from '@/types';
import { VisibilityStepper } from '@/components/visibility/VisibilityStepper';

export default function BatteriesPage() {
  const router = useRouter();
  const [batteries, setBatteries] = useState<QueryBattery[]>([]);
  const [runs, setRuns] = useState<QueryRun[]>([]);
  const [snapshots, setSnapshots] = useState<VisibilitySnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  // Execution modal state
  const [selectedBattery, setSelectedBattery] = useState<QueryBattery | null>(null);
  const [executionModalOpen, setExecutionModalOpen] = useState(false);
  const [executionLabel, setExecutionLabel] = useState<'D1 BASELINE' | 'D15' | 'D30' | 'CUSTOM'>('D1 BASELINE');
  const [customLabel, setCustomLabel] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [maxSpend, setMaxSpend] = useState(25.0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resBatteries, resRuns] = await Promise.all([
        fetch('/api/visibility/batteries/freeze'),
        fetch('/api/visibility/runs'),
      ]);

      if (resBatteries.ok) {
        const data = await resBatteries.json();
        setBatteries(data.batteries || []);
      }
      if (resRuns.ok) {
        const data = await resRuns.json();
        setRuns(data.runs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenExecute = (battery: QueryBattery) => {
    setSelectedBattery(battery);
    // Suggest next execution label based on existing runs
    const batteryRuns = runs.filter((r) => r.battery_id === battery.id);
    const hasD1 = batteryRuns.some((r) => r.execution_label === 'D1 BASELINE');
    const hasD15 = batteryRuns.some((r) => r.execution_label === 'D15');

    if (!hasD1) {
      setExecutionLabel('D1 BASELINE');
    } else if (!hasD15) {
      setExecutionLabel('D15');
    } else {
      setExecutionLabel('D30');
    }
    setExecutionModalOpen(true);
  };

  const handleExecuteRun = async () => {
    if (!selectedBattery) return;
    setIsExecuting(true);
    setFeedbackMessage(null);

    const label = executionLabel === 'CUSTOM' ? (customLabel || 'CUSTOM') : executionLabel;

    try {
      const res = await fetch('/api/visibility/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batteryId: selectedBattery.id,
          markets: selectedBattery.market_codes,
          model: selectedModel,
          maxSpendLimitUSD: maxSpend,
          executionLabel: label,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setExecutionModalOpen(false);
        // Navigate directly to the newly created run audit page
        if (data.run?.id) {
          router.push(`/visibility/runs/${data.run.id}`);
        } else {
          router.push('/visibility/runs');
        }
      } else {
        const err = await res.json();
        setFeedbackMessage({ type: 'error', text: err.error || 'Error al lanzar ejecución' });
      }
    } catch (e) {
      setFeedbackMessage({ type: 'error', text: 'Error de conexión al lanzar ejecución.' });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDuplicate = async (batteryId: string) => {
    try {
      const res = await fetch(`/api/visibility/batteries/${batteryId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setFeedbackMessage({ type: 'success', text: 'Batería duplicada como nueva versión editable.' });
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 7-Step Navigation Stepper */}
      <VisibilityStepper currentStep={3} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Paso 3 & 4</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">AI Visibility Engine</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Baterías de Consultas & Ejecución
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestione baterías inmutables (D1 Baseline, D15, D30) y baterías de descubrimiento. Ejecute mediciones directas.
          </p>
        </div>

        <Link href="/visibility/generator">
          <Button variant="primary" size="sm">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Crear / Generar Nueva Batería
          </Button>
        </Link>
      </div>

      {feedbackMessage && (
        <div
          className={`p-3 rounded text-xs flex items-center justify-between border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
              : 'bg-red-950/40 border-red-800/60 text-red-200'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-slate-400 hover:text-white ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Info Card on Immutability & Workflow */}
      <div className="bg-[#141820] border border-slate-800 rounded p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <h4 className="font-semibold text-white tracking-tight">
            Metodología de Medición Fija (D1 $\rightarrow$ D15 $\rightarrow$ D30)
          </h4>
          <p className="text-slate-400 mt-0.5">
            Las baterías congeladas garantizan que la evolución de visibilidad entre D1 y D15 responda a cambios reales en la web y no a variaciones en el prompt. Use el botón <strong>Ejecutar Batería</strong> para correr la medición en OpenAI Search.
          </p>
        </div>
      </div>

      {/* Batteries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {batteries.map((b) => {
          const batteryRuns = runs.filter((r) => r.battery_id === b.id);
          const latestRun = batteryRuns[0];
          const isFrozen = b.is_frozen || b.battery_type === 'FROZEN_MEASUREMENT';

          return (
            <div
              key={b.id}
              className={`bg-[#141820] border ${
                isFrozen ? 'border-amber-500/30' : 'border-slate-800'
              } rounded-lg p-5 flex flex-col justify-between shadow-sm`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                        VERSIÓN {b.version}
                      </span>
                      {isFrozen ? (
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 inline-flex items-center gap-1">
                          <Lock className="h-2.5 w-2.5" /> FROZEN MEASUREMENT
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/30 inline-flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" /> DYNAMIC DISCOVERY
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-white tracking-tight mt-2">{b.name}</h3>
                    <span className="text-xs font-mono text-brand-400 mt-0.5 block">{b.code}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mt-3">{b.description || 'Batería de consultas para auditoría de visibilidad en ChatGPT.'}</p>

                <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[11px] block">Consultas Fijas:</span>
                    <span className="font-bold text-slate-100 text-sm">{b.query_count} queries</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Mercados Objetivo:</span>
                    <span className="text-slate-200 font-semibold">{b.market_codes.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Ejecuciones Históricas:</span>
                    <span className="text-slate-200 font-semibold">{batteryRuns.length} runs</span>
                  </div>
                  {latestRun && (
                    <div>
                      <span className="text-slate-500 text-[11px] block">Último Score ({latestRun.execution_label || 'Run'}):</span>
                      <span className="text-emerald-400 font-bold">
                        {latestRun.visibility_score !== undefined ? `${latestRun.visibility_score}%` : 'N/A'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="font-semibold"
                    onClick={() => handleOpenExecute(b)}
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                    Ejecutar Batería
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    title="Duplicar para editar nueva versión"
                    onClick={() => handleDuplicate(b.id)}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Duplicar
                  </Button>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  {latestRun ? (
                    <Link
                      href={`/visibility/runs/${latestRun.id}`}
                      className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 font-medium"
                    >
                      Ver Resultados <ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : (
                    <Link
                      href={`/visibility/runs?batteryId=${b.id}`}
                      className="text-slate-400 hover:text-white inline-flex items-center gap-1 font-medium"
                    >
                      <History className="h-3 w-3" /> Historial
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Execution Modal */}
      <Modal
        isOpen={executionModalOpen}
        onClose={() => setExecutionModalOpen(false)}
        title={`Lanzar Ejecución: ${selectedBattery?.name}`}
        description="Configure la etiqueta del run y los parámetros de cómputo en OpenAI Search."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setExecutionModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isExecuting}
              onClick={handleExecuteRun}
            >
              <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
              Iniciar Ejecución Ahora
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          {/* Inherited Parameters Banner */}
          <div className="p-3 bg-[#0c0f14] border border-slate-800 rounded font-mono space-y-1">
            <div className="text-slate-400 flex justify-between">
              <span>Batería:</span>
              <span className="text-white font-semibold">{selectedBattery?.code} (v{selectedBattery?.version})</span>
            </div>
            <div className="text-slate-400 flex justify-between">
              <span>Consultas a Evaluar:</span>
              <span className="text-amber-400 font-bold">{selectedBattery?.query_count} queries fijas</span>
            </div>
            <div className="text-slate-400 flex justify-between">
              <span>Mercados Heredados:</span>
              <span className="text-emerald-400 font-bold">{selectedBattery?.market_codes.join(', ')}</span>
            </div>
          </div>

          {/* Execution Label Selector */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1.5">
              Etiqueta de Ejecución Longitudinal
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
                placeholder="Ej. AUDITORÍA_POST_WEB"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="mt-2 w-full bg-[#0c0f14] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
              />
            )}
          </div>

          {/* Model Selector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Modelo LLM con Búsqueda
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white"
              >
                <option value="gpt-4o">gpt-4o (Recomendado - Búsqueda Web)</option>
                <option value="gpt-4o-mini">gpt-4o-mini (Económico)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Presupuesto Máximo (USD)
              </label>
              <input
                type="number"
                step="5"
                value={maxSpend}
                onChange={(e) => setMaxSpend(parseFloat(e.target.value) || 25.0)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded p-2 text-xs text-white font-mono"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
