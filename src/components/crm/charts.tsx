'use client';

import { fmtMoneyShort, fmtQty } from './commercial-ui';

export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function monthLabel(yyyyMm: string): string {
  return MONTHS[Number(yyyyMm.slice(5, 7)) - 1] ?? yyyyMm.slice(5);
}

/** Columnas con etiqueta inferior. La columna resaltada (última o pico) va en rojo NIUPACK. */
export function ColumnChart({
  data,
  format,
  height = 'h-36',
  highlight = 'peak',
}: {
  data: Array<{ label: string; value: number }>;
  format: (v: number) => string;
  height?: string;
  highlight?: 'peak' | 'last';
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const hiIdx = highlight === 'last' ? data.length - 1 : data.findIndex((d) => d.value === max && d.value > 0);
  return (
    <div>
      <div className={`flex ${height} items-end gap-1.5`}>
        {data.map((d, i) => {
          const hi = i === hiIdx;
          return (
            <div key={`${d.label}-${i}`} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.label}: ${format(d.value)}`}>
              <span className={`mb-1 truncate text-center text-[10px] tabular-nums ${hi ? 'text-slate-300' : 'text-transparent group-hover:text-slate-400'}`}>
                {d.value > 0 ? format(d.value) : ''}
              </span>
              <div
                className={`w-full rounded-t ${hi ? 'bg-brand-500' : 'bg-slate-700 group-hover:bg-slate-600'}`}
                style={{ height: `${d.value > 0 ? Math.max(4, (d.value / max) * 100) : 1}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 border-t border-slate-800 pt-1.5">
        {data.map((d, i) => (
          <span key={`${d.label}-${i}`} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Compras mensuales de una cuenta (12 m). */
export function MonthlyBars({ data, money = false }: { data: Array<{ month: string; quantity: number; value: number }>; money?: boolean }) {
  if (data.length === 0) return <p className="text-sm text-slate-500">Sin compras en los últimos 12 meses.</p>;
  return (
    <div className="rounded-xl border border-slate-800 bg-[#141820] p-4">
      <ColumnChart
        data={data.map((d) => ({ label: monthLabel(d.month), value: money ? d.value : d.quantity }))}
        format={(v) => (money ? fmtMoneyShort(v) : `${fmtQty(v)} u.`)}
      />
    </div>
  );
}
