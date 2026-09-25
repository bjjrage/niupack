'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Eye,
  TrendingUp,
  Calculator,
  Mail,
  Compass,
  CheckSquare,
  FileText,
  Settings,
  ShieldCheck,
  ChevronRight,
  Database,
  Layers,
  Cpu,
  Target,
  Sparkles,
  Inbox,
  DollarSign,
  Search,
  Factory,
  Truck,
} from 'lucide-react';

interface NavSection {
  title: string;
  items: Array<{
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }>;
}

export const Sidebar: React.FC = () => {
  const pathname = usePathname();

  const navigation: NavSection[] = [
    {
      title: 'VISTA GENERAL',
      items: [
        { name: 'Dashboard Ejecutivo', href: '/', icon: LayoutDashboard },
        { name: 'Estrategia País × SKU', href: '/strategy', icon: Compass, badge: 'CORE' },
        { name: 'Centro de Acciones', href: '/actions', icon: CheckSquare, badge: '4' },
      ],
    },
    {
      title: '1. AI VISIBILITY',
      items: [
        { name: 'Generador de Consultas', href: '/visibility/generator', icon: Sparkles },
        { name: 'Baterías & Congelado', href: '/visibility/batteries', icon: Layers },
        { name: 'Historial de Ejecuciones', href: '/visibility/runs', icon: Target },
        { name: 'Competidores', href: '/visibility/competitors', icon: Eye },
        { name: 'Fuentes & Dominios', href: '/visibility/sources', icon: Database },
        { name: 'OpenAI Discovery Status', href: '/visibility/discovery', icon: ShieldCheck },
      ],
    },
    {
      title: '2. MARKET INTELLIGENCE',
      items: [
        { name: 'Precios Regionales', href: '/market/prices', icon: DollarSign },
        { name: 'Maestro de Fabricantes', href: '/market/suppliers', icon: Factory },
        { name: 'Benchmarks SKU × País', href: '/market/benchmarks', icon: TrendingUp },
      ],
    },
    {
      title: '3. COST INTELLIGENCE',
      items: [
        { name: 'Productos & SKUs', href: '/cost/skus', icon: Database },
        { name: 'Hojas de Costo Real', href: '/cost/cost-sheets', icon: Calculator },
        { name: 'Procesos Industriales', href: '/cost/processes', icon: Cpu },
        { name: 'Export Logistics', href: '/cost/logistics', icon: Truck, badge: 'NEW' },
        { name: 'Simulador de Escenarios', href: '/cost/scenarios', icon: Compass },
        { name: 'Oportunidades de Eficiencia', href: '/cost/efficiency', icon: TrendingUp },
      ],
    },
    {
      title: '4. PRICING STRATEGY',
      items: [
        { name: 'Estrategias de Precio', href: '/pricing/strategy', icon: DollarSign, badge: 'CORE' },
      ],
    },
    {
      title: '5. RFQ INTELLIGENCE',
      items: [
        { name: 'Descubrimiento AI', href: '/rfq/discovery', icon: Search },
        { name: 'Especificaciones RFQ', href: '/rfq/rfqs', icon: FileText },
        { name: 'Bandeja Gmail Corporativa', href: '/rfq/inbox', icon: Inbox },
        { name: 'Extracción de Cotizaciones', href: '/rfq/quotes', icon: CheckSquare },
      ],
    },
    {
      title: 'SISTEMA & REPORTES',
      items: [
        { name: 'Reportes Ejecutivos', href: '/reports', icon: FileText },
        { name: 'Ajustes del Sistema (Bots & SMTP)', href: '/settings', icon: Settings, badge: 'BOTS' },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-[#0a0d12] border-r border-slate-800 flex flex-col shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded bg-brand-500 flex items-center justify-center font-bold text-white text-xs tracking-wider shadow-sm">
            NIU
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-xs text-white tracking-wide leading-none">INTELLIGENCE OS</span>
            <span className="text-[10px] text-slate-500 font-mono tracking-tight leading-none mt-1">GARDINER S.A.</span>
          </div>
        </Link>
        <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60">
          v1.0
        </span>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
        {navigation.map((section, idx) => (
          <div key={idx} className="space-y-0.5">
            <h4 className="px-2 text-[10px] font-semibold text-slate-500 tracking-wider uppercase mb-1">
              {section.title}
            </h4>
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center justify-between px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                    isActive
                      ? 'bg-brand-500/10 text-white border-l-2 border-brand-500 rounded-l-none'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`h-4 w-4 shrink-0 transition-colors ${
                        isActive ? 'text-brand-500' : 'text-slate-500 group-hover:text-slate-300'
                      }`}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[10px] font-mono px-1 py-0.2 rounded font-semibold ${
                        item.badge === 'CORE'
                          ? 'bg-brand-950 text-brand-400 border border-brand-800/60'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 bg-[#080b0f] flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
          <span>Planta Asunción</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">FSSC 22000</span>
      </div>
    </aside>
  );
};
