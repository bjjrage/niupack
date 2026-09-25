import React from 'react';

export interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  delta?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  subtitle?: string;
  alert?: boolean;
  className?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  unit,
  delta,
  subtitle,
  alert,
  className = '',
}) => {
  return (
    <div
      className={`bg-[#141820] border ${
        alert ? 'border-amber-600/50' : 'border-slate-800'
      } rounded p-4 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between text-xs font-medium text-slate-400">
        <span>{title}</span>
        {alert && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" title="Requiere atención"></span>}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-white font-tabular">{value}</span>
        {unit && <span className="text-xs text-slate-400 font-medium">{unit}</span>}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-xs">
        {delta && (
          <div
            className={`inline-flex items-center gap-1 font-medium font-tabular ${
              delta.isPositive ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            <span>{delta.isPositive ? '▲' : '▼'}</span>
            <span>{delta.value}</span>
            {delta.label && <span className="text-slate-500 text-[11px] ml-1 font-normal">{delta.label}</span>}
          </div>
        )}
        {subtitle && !delta && <span className="text-slate-500 text-xs truncate">{subtitle}</span>}
      </div>
    </div>
  );
};
