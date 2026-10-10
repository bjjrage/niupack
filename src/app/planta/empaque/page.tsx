'use client';

import React, { useEffect, useState } from 'react';
import { Play, Square, Users, Clock, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { PackingSession } from '@/types';

function requestStorageKey(key: string) {
  return `niupack_packing_request:${key}`;
}

function requestIdFor(key: string): string {
  const storageKey = requestStorageKey(key);
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const requestId = window.crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, requestId);
  return requestId;
}

function clearRequestId(key: string) {
  window.sessionStorage.removeItem(requestStorageKey(key));
}

function reconcileConfirmedRequestIds(session: PackingSession) {
  const confirmedIds = new Set(
    (session.segments || [])
      .map((segment) => (segment as PackingSession['segments'][number] & { request_id?: string }).request_id)
      .filter((requestId): requestId is string => Boolean(requestId))
  );
  const startKey = requestStorageKey(`start:${session.line_name || 'Polipapel'}`);
  const pendingStartId = window.sessionStorage.getItem(startKey);
  if (pendingStartId && confirmedIds.has(pendingStartId)) window.sessionStorage.removeItem(startKey);

  const changePrefix = requestStorageKey(`change:${session.id}:`);
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (!key?.startsWith(changePrefix)) continue;
    const requestId = window.sessionStorage.getItem(key);
    if (requestId && confirmedIds.has(requestId)) window.sessionStorage.removeItem(key);
  }
}

type PackingClockAnchor = { serverNow: number; performanceNow: number };

export default function PlantaEmpaquePage() {
  const [token, setToken] = useState<string>('');
  const [tokenReady, setTokenReady] = useState(false);
  const [lineName] = useState('Polipapel');
  const [headcount, setHeadcount] = useState(3);
  const [activeSession, setActiveSession] = useState<PackingSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isChangingHeadcount, setIsChangingHeadcount] = useState(false);
  const [newHeadcountInput, setNewHeadcountInput] = useState(3);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const clockAnchor = React.useRef<PackingClockAnchor | null>(null);
  const loadInProgress = React.useRef(false);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const fragmentToken = hashParams.get('token');
    const storedToken = window.sessionStorage.getItem('niupack_packing_token') || '';
    const initialToken = fragmentToken || storedToken;
    if (fragmentToken) {
      window.sessionStorage.setItem('niupack_packing_token', fragmentToken);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setToken(initialToken);
    setTokenReady(true);
  }, []);

  const loadActiveSession = async () => {
    if (!tokenReady || loadInProgress.current) return;
    loadInProgress.current = true;
    setIsSyncing(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['x-packing-token'] = token;
      const res = await fetch(
        `/api/cost/processes/packing/sessions?status=RUNNING&line_name=${encodeURIComponent(lineName)}`,
        { headers, cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.sessions)) {
        throw new Error(data.message || data.error || `Could not load session (HTTP ${res.status})`);
      }
      const serverNow = Date.parse(data.server_now);
      if (!Number.isFinite(serverNow)) throw new Error('Server response has no valid clock.');
      clockAnchor.current = { serverNow, performanceNow: window.performance.now() };
      const current = data.sessions[0] as PackingSession | undefined;
      if (current) {
        reconcileConfirmedRequestIds(current);
        setActiveSession(current);
        const latestSegment = current.segments?.[current.segments.length - 1];
        if (latestSegment && latestSegment.headcount > 0) setHeadcount(latestSegment.headcount);
      } else {
        setActiveSession(null);
      }
      setHasLoaded(true);
      setSyncError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection to the server failed.';
      setSyncError(message);
      console.error('Planta empaque sync error', error);
    } finally {
      loadInProgress.current = false;
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!tokenReady) return;
    void loadActiveSession();
    const interval = setInterval(() => void loadActiveSession(), 8000);
    const refreshOnReturn = () => { if (document.visibilityState === 'visible') void loadActiveSession(); };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineName, token, tokenReady]);

  useEffect(() => {
    if (!activeSession || activeSession.status !== 'RUNNING') {
      setElapsedSeconds(0);
      return;
    }
    const updateTimer = () => {
      const anchor = clockAnchor.current;
      if (!anchor) return;
      const estimatedServerNow = anchor.serverNow + (window.performance.now() - anchor.performanceNow);
      const startedAt = Date.parse(activeSession.started_at);
      setElapsedSeconds(Math.max(0, Math.floor((estimatedServerNow - startedAt) / 1000)));
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [activeSession]);

  const postAction = async (payload: Record<string, unknown>, key: string) => {
    const requestId = requestIdFor(key);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['x-packing-token'] = token;
    const res = await fetch('/api/cost/processes/packing/sessions', {
      method: 'POST', headers,
      body: JSON.stringify({ ...payload, request_id: requestId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || data.error || `Save failed (HTTP ${res.status})`);
    const serverNow = Date.parse(data.server_now || data.session?.server_now);
    if (!Number.isFinite(serverNow)) throw new Error('The server did not confirm the saved state. Retry to verify it.');
    clockAnchor.current = { serverNow, performanceNow: window.performance.now() };
    clearRequestId(key);
    return data;
  };

  const handleStart = async () => {
    if (!hasLoaded || syncError) return;
    setLoading(true);
    setFeedback(null);
    const key = `start:${lineName}`;
    try {
      const data = await postAction({ action: 'start', line_name: lineName, initial_headcount: headcount, reason: 'Inicio de jornada de empaque' }, key);
      setActiveSession(data.session);
      setFeedback({ message: 'Cronometro iniciado con exito', type: 'success' });
    } catch (error) {
      setFeedback({ message: `Error: ${error instanceof Error ? error.message : 'No se pudo iniciar'}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangeHeadcount = async () => {
    if (!activeSession || newHeadcountInput <= 0 || syncError) return;
    setLoading(true);
    setFeedback(null);
    const key = `change:${activeSession.id}:${newHeadcountInput}`;
    try {
      const data = await postAction({ action: 'change_headcount', session_id: activeSession.id, new_headcount: newHeadcountInput, reason: `Cambio de dotacion a ${newHeadcountInput} personas` }, key);
      setActiveSession(data.session);
      setHeadcount(newHeadcountInput);
      setIsChangingHeadcount(false);
      setFeedback({ message: `Dotacion cambiada a ${newHeadcountInput} personas`, type: 'success' });
    } catch (error) {
      setFeedback({ message: `Error: ${error instanceof Error ? error.message : 'No se pudo cambiar dotacion'}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!activeSession || syncError) return;
    setLoading(true);
    setFeedback(null);
    const key = `stop:${activeSession.id}`;
    try {
      await postAction({ action: 'stop', session_id: activeSession.id }, key);
      setActiveSession(null);
      setFeedback({ message: 'Cronometro detenido. Registro enviado a revision del supervisor.', type: 'success' });
    } catch (error) {
      setFeedback({ message: `Error: ${error instanceof Error ? error.message : 'No se pudo detener'}`, type: 'error' });
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
          <span>{syncError ? 'ERROR AL SINCRONIZAR' : !hasLoaded ? 'SIN SINCRONIZAR' : activeSession ? 'SESION ACTIVA' : 'EN ESPERA'}</span>
        </div>
        {isSyncing && (
          <span className="flex items-center gap-1 text-slate-400">
            <RefreshCw className="w-3 h-3 animate-spin" /> Conectando…
          </span>
        )}
      </div>

      {syncError && (
        <div className="w-full rounded-xl border border-rose-800/80 bg-rose-950/40 text-rose-200 p-3.5 text-xs flex items-start gap-2.5" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>No se pudo confirmar el estado guardado: {syncError}</span>
        </div>
      )}
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
      {!hasLoaded || (!!syncError && !activeSession) ? (
        <div className="w-full bg-[#12161f] border border-slate-800 rounded-2xl p-6 text-center text-sm text-slate-300">
          {syncError ? 'No se habilitan cambios hasta recuperar la conexion.' : 'Recuperando estado desde el servidor...'}
        </div>
      ) : !activeSession ? (
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
            disabled={loading || !hasLoaded || !!syncError}
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
                  disabled={loading || !hasLoaded || !!syncError}
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
            disabled={loading || !hasLoaded || !!syncError}
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
