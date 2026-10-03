'use client';

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

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-[11px]';
  return (
    <span
      className={`inline-flex ${cls} shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 font-semibold text-slate-200`}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function fmtDateLabel(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((day.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
}

export function isOverdue(iso?: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
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
  return `${n.toLocaleString('es-PY', { maximumFractionDigits: 0 })} ${currency}`;
}
