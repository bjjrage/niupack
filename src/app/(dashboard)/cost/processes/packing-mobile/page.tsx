'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { Play, Square, Users, Clock, ArrowLeft, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { PackingSession } from '@/types';

export default function PackingMobilePage() {
  const [lineName, setLineName] = useState('Polipapel');
  const [sku, setSku] = useState('CUP-12OZ-SW');
  const [productionOrder, setProductionOrder] = useState('OP-2026-01');
  const [headcount, setHeadcount] = useState(2);
  const [activeSession, setActiveSession] = useState<PackingSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [changeHeadcountInput, setChangeHeadcountInput] = useState<number | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const loadActiveSession = async () => {
    try {
      const res = await fetch(`/api/cost/processes/packing/sessions?status=RUNNING&line_name=${encodeURIComponent(lineName)}`);
      const data = await res.json();
      if (data.success && data.sessions && data.sessions.length > 0) {
        const current = data.sessions[0] as PackingSession;
        setActiveSession(current);
        if (current.sku) setSku(current.sku);
        if (current.production_order) setProductionOrder(current.production_order);
        const latestSegment = current.segments?.[current.segments.length - 1];
        if (latestSegment) setHeadcount(latestSegment.headcount);
      } else {
        setActiveSession(null);
      }
    } catch (e) {
      console.error('Failed to load active session', e);
    }
  };

  useEffect(() => {
    loadActiveSession();
    const interval = setInterval(loadActiveSession, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineName]);

  // Live timer tick based on server started_at
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'RUNNING') {
      setElapsedSeconds(0);
      return;
    }

    const updateTimer = () => {
      const startTime = new Date(activeSession.started_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsedSeconds(diff);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [activeSession]);

  const handleStartSession = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cost/processes/packing/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          line_name: lineName,
          sku,
          production_order: productionOrder,
          initial_headcount: headcount,
          reason: 'Inicio de turno',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al iniciar');
      setActiveSession(data.session);
      setFeedback('Sesión de empaque iniciada.');
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeHeadcount = async () => {
    if (!activeSession || !changeHeadcountInput) return;
    setLoading(true);
    try {
      const res = await fetch('/api/cost/processes/packing/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_headcount',
          session_id: activeSession.id,
          new_headcount: changeHeadcountInput,
          reason: changeReason || `Cambio de dotación a ${changeHeadcountInput} personas`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al cambiar');
      setActiveSession(data.session);
      setHeadcount(changeHeadcountInput);
      setShowChangeModal(false);
      setChangeReason('');
      setFeedback(`Dotación actualizada a ${changeHeadcountInput} operarios.`);
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStopSession = async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      const res = await fetch('/api/cost/processes/packing/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stop',
          session_id: activeSession.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al detener');
      setActiveSession(null);
      setFeedback('Sesión de empaque detenida y enviada a revisión.');
    } catch (err: any) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-950 p-4 text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-3">
        <Link href="/cost/processes" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          <span>Volver a Procesos</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono font-bold text-emerald-400">PLANTA OPERATIVA</span>
        </div>
      </header>

      {/* Line & SKU selector */}
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">LÍNEA DE EMPAQUE</span>
          <select
            value={lineName}
            disabled={Boolean(activeSession)}
            onChange={(e) => setLineName(e.target.value)}
            className="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white outline-none"
          >
            <option value="Polipapel">Polipapel</option>
            <option value="Termoformado">Termoformado</option>
            <option value="Manual General">Manual General</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-[10px] text-slate-500">SKU EN PROCESO</label>
            <input
              type="text"
              value={sku}
              disabled={Boolean(activeSession)}
              onChange={(e) => setSku(e.target.value)}
              className="w-full rounded bg-slate-800 px-2 py-1.5 font-mono text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">ORDEN DE PRODUCCIÓN</label>
            <input
              type="text"
              value={productionOrder}
              disabled={Boolean(activeSession)}
              onChange={(e) => setProductionOrder(e.target.value)}
              className="w-full rounded bg-slate-800 px-2 py-1.5 font-mono text-xs text-white"
            />
          </div>
        </div>
      </div>

      {feedback && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-brand-300">
          {feedback}
        </div>
      )}

      {/* Main stopwatch display */}
      <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-[#0e131b] p-6 text-center shadow-xl">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {activeSession ? 'CRONÓMETRO DE EMPAQUE EN VIVO' : 'CRONÓMETRO DETENIDO'}
        </div>

        <div className="my-4 font-mono text-5xl font-black tracking-tight text-white sm:text-6xl tabular-nums">
          {formatTime(elapsedSeconds)}
        </div>

        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-4 py-1.5">
          <Users className="h-4 w-4 text-brand-400" />
          <span className="text-xs text-slate-300">
            Dotación activa: <strong className="font-mono text-brand-300 text-sm">{headcount}</strong> personas
          </span>
        </div>

        {/* Headcount control buttons if inactive */}
        {!activeSession && (
          <div className="mt-5 flex items-center gap-3">
            <span className="text-xs text-slate-400">Dotación inicial:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHeadcount((h) => Math.max(1, h - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-lg font-bold text-white active:bg-slate-700"
              >
                -
              </button>
              <span className="min-w-8 font-mono text-lg font-bold text-white text-center">{headcount}</span>
              <button
                type="button"
                onClick={() => setHeadcount((h) => h + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-lg font-bold text-white active:bg-slate-700"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Large Touch Actions */}
      <div className="mt-6 space-y-3">
        {!activeSession ? (
          <button
            type="button"
            disabled={loading}
            onClick={handleStartSession}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-base font-bold text-white shadow-lg shadow-emerald-950/50 active:bg-emerald-700 disabled:opacity-50"
          >
            <Play className="h-5 w-5 fill-current" />
            <span>INICIAR EMPAQUE</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setChangeHeadcountInput(headcount);
                setShowChangeModal(true);
              }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-950/40 px-6 text-sm font-bold text-brand-300 active:bg-brand-900/60"
            >
              <Users className="h-4 w-4" />
              <span>CAMBIAR DOTACIÓN DE PERSONAL</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleStopSession}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-6 text-base font-bold text-white shadow-lg shadow-red-950/50 active:bg-red-700 disabled:opacity-50"
            >
              <Square className="h-5 w-5 fill-current" />
              <span>DETENER SESIÓN</span>
            </button>
          </>
        )}
      </div>

      {/* Headcount Change Modal */}
      {showChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Modificar dotación de empaque</h3>
            <p className="text-xs text-slate-400">
              Registra un nuevo segmento con timestamp del servidor. La sesión continúa corriendo sin interrupción.
            </p>

            <div className="flex items-center justify-center gap-4 py-2">
              <button
                type="button"
                onClick={() => setChangeHeadcountInput((h) => Math.max(1, (h || 1) - 1))}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-xl font-bold text-white active:bg-slate-700"
              >
                -
              </button>
              <span className="min-w-12 font-mono text-2xl font-bold text-brand-400 text-center">
                {changeHeadcountInput}
              </span>
              <button
                type="button"
                onClick={() => setChangeHeadcountInput((h) => (h || 1) + 1)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-xl font-bold text-white active:bg-slate-700"
              >
                +
              </button>
            </div>

            <input
              type="text"
              placeholder="Motivo del cambio (opcional)"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white outline-none"
            />

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowChangeModal(false)}
                className="flex-1 rounded-lg border border-slate-700 py-2.5 text-xs font-semibold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleChangeHeadcount}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-xs font-bold text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Segments timeline for active session */}
      {activeSession && activeSession.segments && activeSession.segments.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            SEGMENTOS DE ESTA SESIÓN ({activeSession.segments.length})
          </div>
          <div className="space-y-2">
            {activeSession.segments.map((seg, idx) => (
              <div key={seg.id || idx} className="flex items-center justify-between border-b border-slate-800/60 pb-1.5 text-xs">
                <div>
                  <span className="font-semibold text-slate-300">Segmento #{seg.segment_order}:</span>{' '}
                  <span className="font-mono text-brand-400">{seg.headcount} personas</span>
                  {seg.reason && <span className="ml-1.5 text-[10px] text-slate-500">({seg.reason})</span>}
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  {seg.ended_at ? `${seg.duration_minutes || 0} min` : 'En curso'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
