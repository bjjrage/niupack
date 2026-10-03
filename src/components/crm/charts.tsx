'use client';

// Gráficos SVG livianos con tema NIUPACK (rojo + slate). Sin dependencias externas.
// Todos toleran cero datos: se renderiza la estructura completa.

const RED = '#f53732';
const RED_DIM = ['#f53732', '#d92d29', '#b42320', '#8f1d1b', '#6e1413'];
const SLATE = '#3f4a5a';
const TRACK = '#1d232d';

export function fmtMoney(v: number | null | undefined, currency = 'USD'): string {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return `${n.toLocaleString('es-PY', { maximumFractionDigits: 0 })} ${currency}`;
}

export function StageBars({ data }: { data: Array<{ stage: string; count: number; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={d.stage}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-300">{d.stage}</span>
            <span className="text-[11px] tabular-nums text-slate-500">
              {d.count} · {fmtMoney(d.value)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.max(d.value > 0 ? 4 : 0, (d.value / max) * 100)}%`, background: RED_DIM[i % RED_DIM.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Funnel({ steps }: { steps: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-[11px] text-slate-400">{s.label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded" style={{ background: TRACK }}>
            <div
              className="flex h-full items-center justify-end rounded px-1.5"
              style={{
                width: `${Math.max(s.value > 0 ? 12 : 4, (s.value / max) * 100)}%`,
                background: i === 0 ? SLATE : RED_DIM[Math.min(i - 1, RED_DIM.length - 1)],
                opacity: 0.55 + (0.45 * (steps.length - i)) / steps.length,
              }}
            >
              <span className="text-[10px] font-semibold tabular-nums text-white">{s.value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketDonut({ data }: { data: Array<{ market: string; count: number; value: number }> }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  const colors = [RED, '#8f1d1b', '#5b6472', '#2f3844', '#c9d1dc'];
  const R = 44;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const segs = data.map((d, i) => {
    const frac = total > 0 ? d.count / total : 0;
    const s = { ...d, offset: acc, frac, color: colors[i % colors.length] };
    acc += frac;
    return s;
  });
  return (
    <div className="flex items-center gap-4">
      <svg width="110" height="110" viewBox="0 0 110 110" className="shrink-0">
        <circle cx="55" cy="55" r={R} fill="none" stroke={TRACK} strokeWidth="14" />
        {segs.map((s) =>
          s.frac > 0 ? (
            <circle
              key={s.market}
              cx="55"
              cy="55"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${s.frac * C} ${C}`}
              strokeDashoffset={-s.offset * C}
              transform="rotate(-90 55 55)"
              strokeLinecap="butt"
            />
          ) : null,
        )}
        <text x="55" y="52" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">
          {total}
        </text>
        <text x="55" y="66" textAnchor="middle" fill="#64748b" fontSize="9">
          opps
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {segs.map((s) => (
          <li key={s.market} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="text-slate-300">{s.market}</span>
            <span className="ml-auto tabular-nums text-slate-500">
              {s.count} · {fmtMoney(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WonLost({ won, lost }: { won: number; lost: number }) {
  const total = won + lost;
  const wonPct = total > 0 ? (won / total) * 100 : 50;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full" style={{ background: TRACK }}>
        <div className="h-full rounded-l-full bg-emerald-500/80" style={{ width: `${total > 0 ? wonPct : 0}%` }} />
        <div className="h-full flex-1 rounded-r-full" style={{ background: total > 0 ? RED : TRACK }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-emerald-400">
          Ganadas <strong className="tabular-nums">{won}</strong>
        </span>
        <span className="tabular-nums text-slate-500">{total > 0 ? `${Math.round(wonPct)}% cierre` : 'Sin resultados'}</span>
        <span style={{ color: RED }}>
          Perdidas <strong className="tabular-nums">{lost}</strong>
        </span>
      </div>
    </div>
  );
}
