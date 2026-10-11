'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Run { id: string; trigger: 'CRON' | 'MANUAL'; status: 'RUNNING' | 'OK' | 'PARTIAL' | 'FAILED'; started_at: string; finished_at: string | null; tenders_seen: number; tenders_imported: number; tenders_new: number; errors: Array<{ code: string; message: string }>; note: string | null }
interface ScanState { settings: { enabled: boolean }; runs: Run[]; role: string }

const STATUS_TEXT = { RUNNING: 'en curso', OK: 'sin problemas', PARTIAL: 'incompleta', FAILED: 'falló' } as const;

export function ScanBar({ onScanned }: { onScanned: () => void }) {
  const [state, setState] = useState<ScanState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'toggle' | 'scan' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/licitaciones/scan', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.message || data.error || `Error ${response.status}`);
    else { setError(null); setState(data); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (enabled: boolean) => {
    setBusy('toggle');
    setMessage(null);
    const response = await fetch('/api/licitaciones/scan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    setBusy(null);
    if (!response.ok) setMessage('No se pudo cambiar la activación (solo un administrador puede hacerlo).');
    await load();
  };

  const scanNow = async () => {
    setBusy('scan');
    setMessage(null);
    const response = await fetch('/api/licitaciones/scan', { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) setMessage(`No se pudo escanear: ${data.message || data.error || response.status}`);
    else setMessage(`Escaneo ${STATUS_TEXT[data.status as keyof typeof STATUS_TEXT] ?? ''}: ${data.tenders_new} licitaciones nuevas, ${data.tenders_imported} actualizadas.${data.errors?.length ? ` ${data.errors[0].message}` : ''}`);
    await load();
    onScanned();
  };

  if (error) return <p role="alert" className="rounded border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">No se pudo leer el estado del escaneo: {error}</p>;
  if (!state) return null;
  const last = state.runs[0];
  const canWrite = state.role === 'admin' || state.role === 'analyst';

  return (
    <section aria-label="Escaneo diario" className="rounded border border-slate-800 bg-[#141820] p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          {state.settings.enabled ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
          <span className="text-white font-medium">Escaneo diario automático: {state.settings.enabled ? 'ACTIVO' : 'APAGADO'}</span>
          <span className="text-slate-400">busca cada día en DNCP las licitaciones nuevas con inyectables</span>
        </div>
        <div className="flex items-center gap-2">
          {state.role === 'admin' && (
            <Button size="sm" variant={state.settings.enabled ? 'outline' : 'primary'} isLoading={busy === 'toggle'} onClick={() => toggle(!state.settings.enabled)}>
              {state.settings.enabled ? 'Apagar' : 'Activar escaneo diario'}
            </Button>
          )}
          {canWrite && <Button size="sm" variant="secondary" isLoading={busy === 'scan'} onClick={scanNow}><RefreshCw className="h-3.5 w-3.5" />Actualizar ahora</Button>}
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        {last
          ? <>Última corrida: {new Date(last.started_at).toLocaleString('es-PY', { timeZone: 'America/Asuncion' })} ({last.trigger === 'CRON' ? 'automática' : 'manual'}) · {STATUS_TEXT[last.status]} · {last.tenders_new} nuevas, {last.tenders_imported} actualizadas.
              {last.errors.length > 0 && <span className="text-amber-300"> {last.errors[0].message}</span>}{last.note && <span className="text-slate-500"> {last.note}</span>}</>
          : 'Todavía no se ejecutó ningún escaneo. Usá “Actualizar ahora” para la primera carga.'}
      </p>
      {message && <p role="status" className="text-[11px] text-slate-300">{message}</p>}
    </section>
  );
}
