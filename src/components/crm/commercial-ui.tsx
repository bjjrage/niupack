'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/* ================= Formatting ================= */

export interface OwnerRef {
  id: string;
  full_name: string;
  email?: string | null;
}

export function ownerName(owners: OwnerRef[], id?: string | null): string {
  if (!id) return 'Sin asignar';
  const o = owners.find((x) => x.id === id);
  if (o) return o.full_name;
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function fmtDateLabel(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = daysFromToday(iso);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
}

/** Días calendario entre hoy y la fecha (negativo = pasado). */
export function daysFromToday(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

export function isOverdue(iso?: string | null): boolean {
  const d = daysFromToday(iso);
  return d !== null && d < 0;
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'Ahora';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Ayer';
  if (d < 30) return `Hace ${d} días`;
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
}

export function fmtMoney(v: number | null | undefined, currency = 'USD'): string {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return `${currency === 'USD' ? 'US$ ' : `${currency} `}${n.toLocaleString('es-PY', { maximumFractionDigits: 0 })}`;
}

/** Monto abreviado para KPIs y encabezados: US$ 12,4k · US$ 1,2M. */
export function fmtMoneyShort(v: number | null | undefined): string {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  if (Math.abs(n) >= 1_000_000) return `US$ ${(n / 1_000_000).toLocaleString('es-PY', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(n) >= 1000) return `US$ ${(n / 1000).toLocaleString('es-PY', { maximumFractionDigits: 1 })}k`;
  return fmtMoney(n);
}

export function fmtQty(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString('es-PY');
}

/* ================= Domain labels (nunca mostrar enums crudos) ================= */

export const OPEN_STAGES = ['NUEVO', 'CONTACTADO', 'CALIFICADO', 'COTIZACIÓN', 'NEGOCIACIÓN'] as const;
export const ALL_STAGES = [...OPEN_STAGES, 'GANADO', 'PERDIDO'] as const;

export const STAGE_LABEL: Record<string, string> = {
  NUEVO: 'Nuevo',
  CONTACTADO: 'Contactado',
  CALIFICADO: 'Calificado',
  COTIZACIÓN: 'Cotización',
  NEGOCIACIÓN: 'Negociación',
  GANADO: 'Ganada',
  PERDIDO: 'Perdida',
};

export const QUALIFICATION_LABEL: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };

export const TASK_TYPE_LABEL: Record<string, string> = {
  CALL: 'Llamada',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  MEETING: 'Reunión',
  FOLLOW_UP: 'Seguimiento',
  QUOTE: 'Cotización',
  OTHER: 'Otra',
};

export const PERIOD_LABEL: Record<string, string> = { ONE_OFF: 'única vez', WEEKLY: 'semana', MONTHLY: 'mes', ANNUAL: 'año' };

export function fmtVolume(qty?: number | null, period?: string | null): string {
  if (!qty) return '—';
  const p = period ? PERIOD_LABEL[period] ?? period.toLowerCase() : null;
  return `${fmtQty(qty)} u.${p ? (period === 'ONE_OFF' ? ` (${p})` : ` / ${p}`) : ''}`;
}

export const PRIORITY_LABEL: Record<string, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente' };

export const REPURCHASE_LABEL: Record<string, string> = {
  OVERDUE: 'Recompra vencida',
  CONTACT_SOON: 'Contactar pronto',
  ON_CYCLE: 'En ciclo',
};

export const ACTIVITY_LABEL: Record<string, string> = {
  LEAD_CREATED: 'Lead creado',
  LEAD_UPDATED: 'Lead actualizado',
  STAGE_CHANGED: 'Cambio de etapa',
  NOTE: 'Nota',
  TASK_CREATED: 'Tarea creada',
  TASK_COMPLETED: 'Tarea completada',
  BOT_MESSAGE: 'NIUPACKBOT',
  HUMAN_MESSAGE: 'Mensaje vendedor',
  HUMAN_HANDOFF: 'Derivado a vendedor',
  QUOTE_REQUESTED: 'Pidió cotización',
  QUOTE_CREATED: 'Cotización enviada',
  WON: 'Ganada',
  LOST: 'Perdida',
};

export function label(map: Record<string, string>, key?: string | null): string {
  if (!key) return '—';
  return map[key] ?? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ');
}

/* ================= Primitives ================= */

export type Tone = 'neutral' | 'danger' | 'warning' | 'success' | 'brand' | 'info';

const TONE_PILL: Record<Tone, string> = {
  neutral: 'border-slate-700 text-slate-300',
  danger: 'border-red-900/70 bg-red-500/10 text-red-400',
  warning: 'border-amber-900/70 bg-amber-500/10 text-amber-400',
  success: 'border-emerald-900/70 bg-emerald-500/10 text-emerald-400',
  brand: 'border-brand-800/70 bg-brand-500/10 text-red-300',
  info: 'border-blue-900/70 bg-blue-500/10 text-blue-400',
};

const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-slate-600',
  danger: 'bg-red-500',
  warning: 'bg-amber-400',
  success: 'bg-emerald-500',
  brand: 'bg-brand-500',
  info: 'bg-blue-500',
};

export function Pill({ tone = 'neutral', children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_PILL[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />}
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} />;
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-[11px]';
  const unassigned = name === 'Sin asignar';
  return (
    <span
      className={`inline-flex ${cls} shrink-0 items-center justify-center rounded-full border font-semibold ${
        unassigned ? 'border-dashed border-slate-700 text-slate-600' : 'border-slate-700 bg-slate-800 text-slate-200'
      }`}
      title={name}
    >
      {unassigned ? '?' : initials(name)}
    </span>
  );
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ key: K; label: string; count?: number }>;
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-slate-800 bg-[#0c0f14] p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            value === o.key ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
          {typeof o.count === 'number' && <span className={`tabular-nums ${value === o.key ? 'text-slate-300' : 'text-slate-600'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-800 bg-[#141820] ${className}`}>{children}</section>;
}

export function CardHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label: text, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-slate-400">{text}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-slate-700 bg-[#0c0f14] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-brand-500 focus:outline-none';

/** Panel lateral derecho. Escape cierra. */
export function Drawer({ onClose, children, width = 'max-w-2xl' }: { onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className={`flex h-full w-full ${width} flex-col overflow-hidden border-l border-slate-800 bg-[#11161d] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function DrawerClose({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white">
      <X className="h-4 w-4" />
    </button>
  );
}

/* ================= Data ================= */

export function useCrmFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      setData((await res.json()) as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, loading, error, reload };
}

export async function sendJson(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<unknown> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json().catch(() => null);
}

/** Muestra los primeros `limit` ítems y un "Ver todos (n)" — las fichas no crecen sin fin. */
export function Capped<T>({ items, limit = 5, children }: { items: T[]; limit?: number; children: (visible: T[]) => ReactNode }) {
  const [all, setAll] = useState(false);
  const visible = all ? items : items.slice(0, limit);
  return (
    <>
      {children(visible)}
      {items.length > limit && (
        <button onClick={() => setAll((v) => !v)} className="w-full border-t border-slate-800/70 px-5 py-2.5 text-left text-xs font-medium text-slate-400 hover:text-white">
          {all ? 'Ver menos' : `Ver todos (${items.length})`}
        </button>
      )}
    </>
  );
}
