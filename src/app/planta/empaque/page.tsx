'use client';

import React, { useEffect, useState } from 'react';
import { Play, Square, Users, Clock, AlertCircle, CheckCircle2, RefreshCw, CalendarDays, Sun, Sunset } from 'lucide-react';
import { PackingSession } from '@/types';
import { clockLabel, longDayLabel, shiftFor, asuncionDate, type TodaySessionSummary } from '@/lib/packing/shift';

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

const hoursFormat = new Intl.NumberFormat('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function peopleLabel(count: number) {
  return count === 1 ? '1 persona' : `${count} personas`;
}

function describeHeadcount(summary: TodaySessionSummary) {
  const counts = summary.segments.map((segment) => segment.headcount).filter((value) => value > 0);
  if (counts.length === 0) return '—';
  const distinct = counts.filter((value, index) => index === 0 || value !== counts[index - 1]);
  return distinct.length === 1 ? peopleLabel(distinct[0]) : `${distinct.join(' → ')} personas`;
}

function describeStatus(status: string) {
  switch (status) {
    case 'RUNNING': return { text: 'En curso', tone: 'text-emerald-300 border-emerald-700/60 bg-emerald-950/40' };
    case 'STOPPED': return { text: 'Pendiente de revisión', tone: 'text-amber-200 border-amber-700/60 bg-amber-950/30' };
    case 'APPROVED': return { text: 'Aprobado', tone: 'text-sky-200 border-sky-700/60 bg-sky-950/30' };
    case 'CORRECTED': return { text: 'Corregido', tone: 'text-sky-200 border-sky-700/60 bg-sky-950/30' };
    default: return { text: status, tone: 'text-slate-300 border-slate-600 bg-slate-800/60' };
  }
}

function InfoStat({ label, value, icon, accent = false }: { label: string; value: React.ReactNode; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-2 py-3.5 text-center">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <span className={`flex items-center gap-1.5 font-black ${accent ? 'text-2xl text-white' : 'text-base text-slate-100'}`}>
        {icon}
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

export default function PlantaEmpaquePage() {
  const [token, setToken] = useState<string>('');
  const [tokenReady, setTokenReady] = useState(false);
  const [lineName] = useState('Polipapel');
  const [headcount, setHeadcount] = useState(3);
  const [activeSession, setActiveSession] = useState<PackingSession | null>(null);
  const [todaySessions, setTodaySessions] = useState<TodaySessionSummary[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isChangingHeadcount, setIsChangingHeadcount] = useState(false);
  const [newHeadcountInput, setNewHeadcountInput] = useState(3);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
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

  // Keeps the day / shift header correct if the phone stays open across a shift change or midnight.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const serverNowMs = () => {
    const anchor = clockAnchor.current;
    return anchor ? anchor.serverNow + (window.performance.now() - anchor.performanceNow) : Date.now();
  };

  const loadActiveSession = async () => {
    if (!tokenReady || loadInProgress.current) return;
    loadInProgress.current = true;
    setIsSyncing(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['x-packing-token'] = token;
      const res = await fetch(
        `/api/cost/processes/packing/sessions?status=RUNNING&scope=today&line_name=${encodeURIComponent(lineName)}`,
        { headers, cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.sessions)) {
        throw new Error(data.message || data.error || `Could not load session (HTTP ${res.status})`);
      }
      const serverNow = Date.parse(data.server_now);
      if (!Number.isFinite(serverNow)) throw new Error('Server response has no valid clock.');
      clockAnchor.current = { serverNow, performanceNow: window.performance.now() };
      setNow(serverNow);
      setTodaySessions(Array.isArray(data.today_sessions) ? data.today_sessions : []);
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
      const startedAt = Date.parse(activeSession.started_at);
      setElapsedSeconds(Math.max(0, Math.floor((serverNowMs() - startedAt) / 1000)));
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const moment = new Date(serverNowMs());
      const data = await postAction({
        action: 'start',
        line_name: lineName,
        initial_headcount: headcount,
        reason: 'Inicio de jornada de empaque',
        shift_code: shiftFor(moment).code,
        shift_date: asuncionDate(moment),
      }, key);
      setActiveSession(data.session);
      setFeedback({ message: 'Trabajo iniciado.', type: 'success' });
      void loadActiveSession();
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
      setFeedback({ message: `Ahora trabajan ${peopleLabel(newHeadcountInput)}.`, type: 'success' });
      void loadActiveSession();
    } catch (error) {
      setFeedback({ message: `Error: ${error instanceof Error ? error.message : 'No se pudo cambiar la cantidad de personas'}`, type: 'error' });
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
      setFeedback({ message: 'Trabajo finalizado. Registro enviado a revisión del supervisor.', type: 'success' });
      void loadActiveSession();
    } catch (error) {
      setFeedback({ message: `Error: ${error instanceof Error ? error.message : 'No se pudo finalizar'}`, type: 'error' });
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

  const shift = shiftFor(now);
  const personsNow = activeSession ? headcount : 0;
  const closedToday = todaySessions.filter((item) => item.status !== 'RUNNING');
  const totalPersonHoursToday = closedToday.reduce((sum, item) => sum + item.total_person_hours, 0);

  return (
    <div className="w-full flex flex-col items-center gap-4 py-2">
      {/* Brand Header */}
      <div className="text-center w-full">
        <h1 className="text-2xl font-black tracking-widest text-white uppercase">NIUPACK</h1>
        <p className="text-xs font-semibold tracking-wider text-brand-400 uppercase mt-0.5">Control de Empaque</p>
      </div>

      {/* Always visible: which day, which shift, which line, how many people */}
      <section aria-label="Día y turno" className="w-full overflow-hidden rounded-2xl border border-slate-600/60 bg-[#1a2130] shadow-xl">
        <div className="flex items-center gap-2.5 border-b border-slate-700/70 px-5 py-3.5">
          <CalendarDays className="h-5 w-5 shrink-0 text-brand-400" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hoy</p>
            <p className="truncate text-lg font-black text-white">{longDayLabel(now)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-700/70">
          <InfoStat
            label="Turno"
            value={shift.label}
            icon={shift.code === 'MANANA' ? <Sun className="h-4 w-4 text-amber-300" /> : <Sunset className="h-4 w-4 text-orange-300" />}
          />
          <InfoStat label="Línea" value={lineName} />
          <InfoStat
            label="Personas ahora"
            value={personsNow}
            icon={<Users className={`h-5 w-5 ${personsNow > 0 ? 'text-emerald-400' : 'text-slate-500'}`} />}
            accent
          />
        </div>
      </section>

      {/* Sync indicator */}
      <div className="w-full flex items-center justify-between px-1 text-[11px] text-slate-500 font-mono">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${activeSession ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span>{syncError ? 'ERROR AL SINCRONIZAR' : !hasLoaded ? 'SIN SINCRONIZAR' : activeSession ? 'TRABAJO EN CURSO' : 'SIN TRABAJO EN CURSO'}</span>
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
        <div className="w-full bg-[#171d29] border border-slate-600/50 rounded-2xl p-6 text-center text-sm text-slate-300">
          {syncError ? 'No se habilitan cambios hasta recuperar la conexion.' : 'Recuperando estado desde el servidor...'}
        </div>
      ) : !activeSession ? (
        <div className="w-full flex flex-col items-center gap-6 bg-[#171d29] border border-slate-600/50 rounded-2xl p-6 shadow-xl">
          <div className="text-center w-full">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-4">
              ¿CUÁNTAS PERSONAS VAN A TRABAJAR?
            </span>
            <div className="flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => setHeadcount((prev) => Math.max(1, prev - 1))}
                className="w-14 h-14 rounded-2xl border border-slate-600 bg-slate-800/90 text-white text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform shadow-md"
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
                className="w-14 h-14 rounded-2xl border border-slate-600 bg-slate-800/90 text-white text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform shadow-md"
                aria-label="Aumentar personas"
              >
                +
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-3 font-medium">
              {peopleLabel(headcount)} en la mesa de empaque
            </p>
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={loading || !hasLoaded || !!syncError}
            className="w-full min-h-14 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black text-base uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-50"
          >
            <Play className="w-5 h-5 fill-current" />
            {loading ? 'Iniciando…' : 'INICIAR TRABAJO'}
          </button>
        </div>
      ) : (
        /* STATE B: RUNNING */
        <div className="w-full flex flex-col items-center gap-6 bg-[#171d29] border border-emerald-700/50 rounded-2xl p-6 shadow-2xl">
          {/* Elapsed Timer Display */}
          <div className="text-center w-full">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
              TIEMPO TRABAJADO
            </span>
            <div className="font-mono text-5xl sm:text-6xl font-black text-emerald-400 tracking-tight tabular-nums py-2">
              {formatTimer(elapsedSeconds)}
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-300 mt-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Inició a las {clockLabel(activeSession.started_at)}</span>
            </div>
          </div>

          <hr className="w-full border-slate-700" />

          {/* Current Headcount */}
          <div className="text-center w-full">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              PERSONAS TRABAJANDO
            </span>
            <div className="font-mono text-2xl font-black text-white flex items-center justify-center gap-2">
              <Users className="w-5 h-5 text-brand-400" />
              <span>{headcount} {headcount === 1 ? 'PERSONA' : 'PERSONAS'}</span>
            </div>
          </div>

          {/* Headcount change modal / inline form */}
          {isChangingHeadcount ? (
            <div className="w-full bg-[#10151f] border border-brand-800/80 rounded-xl p-4 flex flex-col items-center gap-4 animate-in fade-in zoom-in-95">
              <span className="text-xs font-bold text-brand-300 uppercase tracking-wider">
                NUEVA CANTIDAD DE PERSONAS
              </span>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setNewHeadcountInput((prev) => Math.max(1, prev - 1))}
                  className="w-11 h-11 rounded-xl border border-slate-600 bg-slate-800 text-white text-xl font-bold flex items-center justify-center active:scale-95"
                >
                  −
                </button>
                <div className="font-mono text-3xl font-black text-white min-w-[50px] text-center">
                  {newHeadcountInput}
                </div>
                <button
                  type="button"
                  onClick={() => setNewHeadcountInput((prev) => prev + 1)}
                  className="w-11 h-11 rounded-xl border border-slate-600 bg-slate-800 text-white text-xl font-bold flex items-center justify-center active:scale-95"
                >
                  +
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full mt-1">
                <button
                  type="button"
                  onClick={() => setIsChangingHeadcount(false)}
                  className="min-h-10 rounded-lg border border-slate-600 bg-transparent text-slate-300 font-semibold text-xs uppercase"
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
              className="w-full min-h-12 rounded-xl border border-slate-600 bg-slate-800/80 hover:bg-slate-700 text-slate-100 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              CAMBIAR CANTIDAD DE PERSONAS
            </button>
          )}

          {/* Finish Button */}
          <button
            type="button"
            onClick={handleStop}
            disabled={loading || !hasLoaded || !!syncError}
            className="w-full min-h-14 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-base uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-lg shadow-rose-950/50 transition-all disabled:opacity-50"
          >
            <Square className="w-5 h-5 fill-current" />
            {loading ? 'Finalizando…' : 'FINALIZAR TRABAJO'}
          </button>
        </div>
      )}

      {/* Day summary: what has been worked today on this line */}
      {hasLoaded && (
        <section aria-label="Resumen de hoy" className="w-full rounded-2xl border border-slate-600/50 bg-[#171d29] shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-700/70 px-5 py-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300">Resumen de hoy</h2>
            <span className="font-mono text-xs text-slate-300">
              {hoursFormat.format(totalPersonHoursToday)} h-persona
            </span>
          </div>
          {todaySessions.length === 0 ? (
            <p className="px-5 py-4 text-xs text-slate-400">Todavía no hay trabajo registrado hoy.</p>
          ) : (
            <ul className="divide-y divide-slate-700/60">
              {todaySessions.map((item) => {
                const status = describeStatus(item.status);
                const running = item.status === 'RUNNING';
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-white">
                        {clockLabel(item.started_at)} – {running || !item.stopped_at ? 'en curso' : clockLabel(item.stopped_at)}
                      </p>
                      <p className="text-xs text-slate-300">{describeHeadcount(item)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${status.tone}`}>{status.text}</span>
                      {!running && (
                        <span className="font-mono text-xs text-slate-300">{hoursFormat.format(item.total_person_hours)} h-persona</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
