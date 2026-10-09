'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { Play, Square, Users, Clock, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { PackingSession } from '@/types';

export default function PlantaEmpaquePage() {
  const [token, setToken] = useState<string>('');
  const [lineName, setLineName] = useState('Polipapel');
  const [headcount, setHeadcount] = useState(3);
  const [activeSession, setActiveSession] = useState<PackingSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isChangingHeadcount, setIsChangingHeadcount] = useState(false);
  const [newHeadcountInput, setNewHeadcountInput] = useState(3);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Initialize token from URL or localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      if (urlToken) {
        setToken(urlToken);
        try {
          localStorage.setItem('niupack_packing_token', urlToken);
        } catch {}
      } else {
        const storedToken = localStorage.getItem('niupack_packing_token') || '';
        setToken(storedToken);
      }
    }
  }, []);

  // Fetch active session with token
  const loadActiveSession = async () => {
    setIsSyncing(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['x-packing-token'] = token;

      const res = await fetch(
        `/api/cost/processes/packing/sessions?status=RUNNING&line_name=${encodeURIComponent(lineName)}`,
        { headers }
      );
      const data = await res.json();
      if (data.success && data.sessions && data.sessions.length > 0) {
        const current = data.sessions[0] as PackingSession;
        setActiveSession(current);
        const latestSegment = current.segments?.[current.segments.length - 1];
        if (latestSegment && latestSegment.headcount > 0) {
          setHeadcount(latestSegment.headcount);
        }
      } else {
        setActiveSession(null);
      }
    } catch (e) {
      console.error('Planta empaque sync error', e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadActiveSession();
    const interval = setInterval(loadActiveSession, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineName, token]);

  // Local tick calculation derived from server started_at
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

  const handleStart = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-packing-token'] = token;

      const res = await fetch('/api/cost/processes/packing/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'start',
          line_name: lineName,
          initial_headcount: headcount,
          reason: 'Inicio de jornada de empaque',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo iniciar');
      setActiveSession(data.session);
      setFeedback({ message: 'Cronómetro iniciado con éxito', type: 'success' });
    } catch (err: any) {
      setFeedback({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangeHeadcount = async () => {
    if (!activeSession || newHeadcountInput <= 0) return;
    setLoading(true);
    setFeedback(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-packing-token'] = token;

      const res = await fetch('/api/cost/processes/packing/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'change_headcount',
          session_id: activeSession.id,
          new_headcount: newHeadcountInput,
          reason: `Cambio de dotación a ${newHeadcountInput} personas`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo cambiar dotación');
      setActiveSession(data.session);
      setHeadcount(newHeadcountInput);
      setIsChangingHeadcount(false);
      setFeedback({ message: `Dotación cambiada a ${newHeadcountInput} personas`, type: 'success' });
    } catch (err: any) {
      setFeedback({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!activeSession) return;
    setLoading(true);
    setFeedback(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-packing-token'] = token;

      const res = await fetch('/api/cost/processes/packing/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'stop',
          session_id: activeSession.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo detener');
      setActiveSession(null);
      setFeedback({ message: 'Cronómetro detenido. Registro enviado a revisión del supervisor.', type: 'success' });
    } catch (err: any) {
      setFeedback({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full flex flex-col items-center gap-6 py-2">
      {/* Brand Header */}
      <div className="text-center w-full">
        <h1 className="text-2xl font-black tracking-widest text-white uppercase">NIUPACK</h1>
        <p className="text-xs font-semibold tracking-wider text-brand-400 uppercase mt-0.5">Control de Empaque</p>
      </div>

      {/* Sync indicator */}
      <div className="w-full flex items-center justify-between px-1 text-[11px] text-slate-500 font-mono">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${activeSession ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span>{activeSession ? 'SESIÓN ACTIVA' : 'EN ESPERA'}</span>
        </div>
        {isSyncing && (
          <span className="flex items-center gap-1 text-slate-400">
            <RefreshCw className="w-3 h-3 animate-spin" /> Conectando…
          </span>
        )}
      </div>

      {/* Line Indicator */}
      <div className="w-full bg-[#12161f] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">LÍNEA</span>
        <span className="text-sm font-bold text-white bg-brand-950/70 text-brand-300 border border-brand-800/60 px-3 py-1 rounded-md">
          {lineName}
        </span>
      </div>

      {feedback && (
        <div
          className={`w-full rounded-xl border p-3.5 text-xs flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'border-emerald-800/80 bg-emerald-950/40 text-emerald-200'
              : 'border-rose-800/80 bg-rose-950/40 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* STATE A: STOPPED / IDLE */}
      {!activeSession ? (
        <div className="w-full flex flex-col items-center gap-6 bg-[#12161f] border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="text-center w-full">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-4">
              PERSONAS TRABAJANDO
            </span>
            <div className="flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => setHeadcount((prev) => Math.max(1, prev - 1))}
                className="w-14 h-14 rounded-2xl border border-slate-700 bg-slate-800/90 text-white text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform shadow-md"
                aria-label="Disminuir personas"
              >
                −
              </button>
              <div className="font-mono text-5xl font-black text-white min-w-[70px] text-center">
                {headcount}
              </div>
              <button
                type="button"
                onClick={() => setHeadcount((prev) => prev + 1)}
                className="w-14 h-14 rounded-2xl border border-slate-700 bg-slate-800/90 text-white text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform shadow-md"
                aria-label="Aumentar personas"
              >
                +
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 font-medium">
              {headcount === 1 ? '1 persona' : `${headcount} personas`} en la mesa de empaque
            </p>
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={loading}
            className="w-full min-h-14 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black text-base uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-50"
          >
            <Play className="w-5 h-5 fill-current" />
            {loading ? 'Iniciando…' : 'INICIAR CRONÓMETRO'}
          </button>
        </div>
      ) : (
        /* STATE B: RUNNING */
        <div className="w-full flex flex-col items-center gap-6 bg-[#12161f] border border-emerald-900/60 rounded-2xl p-6 shadow-2xl">
          {/* Elapsed Timer Display */}
          <div className="text-center w-full">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
              TIEMPO TRANSCURRIDO
            </span>
            <div className="font-mono text-5xl sm:text-6xl font-black text-emerald-400 tracking-tight tabular-nums py-2">
              {formatTimer(elapsedSeconds)}
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-400 mt-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Iniciado: {new Date(activeSession.started_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          <hr className="w-full border-slate-800" />

          {/* Current Headcount */}
          <div className="text-center w-full">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              DOTACIÓN ACTUAL
            </span>
            <div className="font-mono text-2xl font-black text-white flex items-center justify-center gap-2">
              <Users className="w-5 h-5 text-brand-400" />
              <span>{headcount} {headcount === 1 ? 'PERSONA' : 'PERSONAS'}</span>
            </div>
          </div>

          {/* Headcount change modal / inline form */}
          {isChangingHeadcount ? (
            <div className="w-full bg-[#0d1017] border border-brand-800/80 rounded-xl p-4 flex flex-col items-center gap-4 animate-in fade-in zoom-in-95">
              <span className="text-xs font-bold text-brand-300 uppercase tracking-wider">
                NUEVA DOTACIÓN
              </span>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setNewHeadcountInput((prev) => Math.max(1, prev - 1))}
                  className="w-11 h-11 rounded-xl border border-slate-700 bg-slate-800 text-white text-xl font-bold flex items-center justify-center active:scale-95"
                >
                  −
                </button>
                <div className="font-mono text-3xl font-black text-white min-w-[50px] text-center">
                  {newHeadcountInput}
                </div>
                <button
                  type="button"
                  onClick={() => setNewHeadcountInput((prev) => prev + 1)}
                  className="w-11 h-11 rounded-xl border border-slate-700 bg-slate-800 text-white text-xl font-bold flex items-center justify-center active:scale-95"
                >
                  +
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full mt-1">
                <button
                  type="button"
                  onClick={() => setIsChangingHeadcount(false)}
                  className="min-h-10 rounded-lg border border-slate-700 bg-transparent text-slate-300 font-semibold text-xs uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleChangeHeadcount}
                  disabled={loading}
                  className="min-h-10 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs uppercase tracking-wider"
                >
                  {loading ? 'Guardando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNewHeadcountInput(headcount);
                setIsChangingHeadcount(true);
              }}
              className="w-full min-h-12 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-100 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              CAMBIAR DOTACIÓN
            </button>
          )}

          {/* Stop Button */}
          <button
            type="button"
            onClick={handleStop}
            disabled={loading}
            className="w-full min-h-14 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-rose-950/50 transition-all disabled:opacity-50"
          >
            <Square className="w-5 h-5 fill-current" />
            {loading ? 'Deteniendo…' : 'DETENER CRONÓMETRO'}
          </button>
        </div>
      )}
    </div>
  );
}
