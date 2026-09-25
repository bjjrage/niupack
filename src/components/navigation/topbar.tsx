'use client';

import React from 'react';
import Link from 'next/link';
import { DollarSign, ShieldAlert, Sparkles, Plus, RefreshCw, Mail, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const Topbar: React.FC = () => {
  return (
    <header className="h-14 bg-[#0a0d12] border-b border-slate-800 px-6 flex items-center justify-between shrink-0 select-none z-20">
      {/* Left: Organization & Market status pills */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white tracking-tight">NIUPACK</span>
          <span className="text-slate-600 text-xs">/</span>
          <span className="text-xs text-slate-400 font-medium">GARDINER S.A. Operaciones</span>
        </div>

        <div className="h-4 w-[1px] bg-slate-800 mx-1 hidden sm:block"></div>

        {/* Target Markets */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono">
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> BR
          </span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> AR
          </span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> BO
          </span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400" title="Mercado de control">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span> PY (Ctrl)
          </span>
        </div>
      </div>

      {/* Right: Cost Gauge, Quick Actions, Profile */}
      <div className="flex items-center gap-3">
        {/* OpenAI Cost Budget Tracker */}
        <Link
          href="/settings"
          className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded bg-[#10141b] border border-slate-800 hover:border-slate-700 transition-colors text-xs"
          title="Consumo mensual OpenAI vs Presupuesto asignado"
        >
          <div className="flex items-center gap-1 text-slate-400">
            <Sparkles className="h-3 w-3 text-amber-400" />
            <span className="text-[11px]">AI Spend:</span>
          </div>
          <span className="font-mono font-medium text-slate-200 font-tabular">$14.85</span>
          <span className="text-[11px] text-slate-500 font-mono">/ $250</span>
          <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: '6%' }}></div>
          </div>
        </Link>

        {/* Gmail Status */}
        <Link
          href="/rfq/inbox"
          className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs"
        >
          <Mail className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[11px]">Gmail</span>
        </Link>

        {/* Quick Action: New Query Battery */}
        <Link href="/visibility/generator">
          <Button variant="primary" size="sm">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Generar Consultas
          </Button>
        </Link>

        {/* Ajustes Button */}
        <Link
          href="/settings"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs transition-colors"
          title="Ajustes del Sistema (OpenAI & Correo Flexibles)"
        >
          <Settings className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium text-xs">Ajustes</span>
        </Link>

        {/* User Avatar */}
        <div className="h-7 w-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
          OP
        </div>
      </div>
    </header>
  );
};
