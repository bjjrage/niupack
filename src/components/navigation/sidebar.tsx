'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Eye,
  TrendingUp,
  Calculator,
  Compass,
  CheckSquare,
  FileText,
  Settings,
  ShieldCheck,
  ChevronDown,
  Database,
  Layers,
  Target,
  Sparkles,
  Inbox,
  DollarSign,
  Search,
  Factory,
  Truck,
  Users,
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

/** Nombre completo + qué hace cada sección. Se muestra al pasar el mouse. */
const HINTS: Record<string, [string, string]> = {
  '/': ['Dashboard ejecutivo', 'Vista general del negocio: indicadores clave de todas las áreas.'],
  '/strategy': ['Estrategia país × SKU', 'Qué producto empujar en qué mercado, cruzando costo, precio y demanda.'],
  '/actions': ['Centro de acciones', 'Pendientes y recomendaciones que el sistema detectó para resolver.'],
  '/visibility/generator': ['Generador de consultas', 'Crea las preguntas que se hacen a las IA para medir si recomiendan a NIUPACK.'],
  '/visibility/batteries': ['Baterías y congelado', 'Conjuntos fijos de consultas para comparar resultados en el tiempo.'],
  '/visibility/runs': ['Historial de ejecuciones', 'Cada corrida de consultas a las IA, con su costo y resultados.'],
  '/visibility/competitors': ['Competidores', 'Qué marcas aparecen en las respuestas de las IA y con qué frecuencia.'],
  '/visibility/sources': ['Fuentes y dominios', 'Sitios que las IA citan al responder sobre el rubro.'],
  '/visibility/discovery': ['OpenAI discovery', 'Estado de indexación de NIUPACK en los buscadores de OpenAI.'],
  '/market/prices': ['Precios regionales', 'Precios de mercado por producto y país (BR, AR, BO, PY).'],
  '/market/suppliers': ['Maestro de fabricantes', 'Fabricantes y competidores de la región, con su oferta.'],
  '/market/benchmarks': ['Benchmarks SKU × país', 'Compara precio NIUPACK contra el mercado por SKU y país.'],
  '/cost/skus': ['Productos y SKUs', 'Maestro de productos: medidas, material, MOQ. El CRM toma los productos de acá.'],
  '/cost/cost-sheets': ['Hojas de costo real', 'Costo unitario por SKU: materia prima, proceso y gastos.'],
  '/cost/processes': ['Procesos industriales', 'Máquinas, velocidades y mermas que alimentan el costo.'],
  '/cost/logistics': ['Costo de exportación', 'Flete y gastos de exportación sumados al costo del producto.'],
  '/cost/scenarios': ['Simulador de escenarios', 'Qué pasa con el margen si cambia el papel, el dólar o el volumen.'],
  '/cost/efficiency': ['Oportunidades de eficiencia', 'Dónde bajar costo: procesos, compras y mermas.'],
  '/pricing/strategy': ['Estrategia de precios', 'Precio sugerido por SKU y mercado según costo y competencia.'],
  '/rfq/discovery': ['Descubrimiento de RFQs', 'Busca con IA pedidos de cotización y compradores potenciales.'],
  '/rfq/rfqs': ['Especificaciones RFQ', 'Pedidos de cotización recibidos, con sus especificaciones técnicas.'],
  '/rfq/inbox': ['Bandeja Gmail corporativa', 'Correos de cotización detectados en la casilla de la empresa.'],
  '/rfq/quotes': ['Extracción de cotizaciones', 'Lee cotizaciones de proveedores y las pasa a datos comparables.'],
  '/logistics': ['Logística · resumen', 'Estado general de fletes, rutas y transportistas.'],
  '/logistics/ocean': ['Flete marítimo', 'Cotizaciones y rutas de contenedores.'],
  '/logistics/road': ['Flete terrestre', 'Cotizaciones de camión a la región.'],
  '/logistics/providers': ['Transportistas', 'Proveedores de flete, contactos y rutas que cubren.'],
  '/logistics/history': ['Histórico logístico', 'Cotizaciones y envíos anteriores para comparar.'],
  '/commercial': ['CRM comercial', 'Agenda del día, pipeline de ventas, cuentas, recompras y WhatsApp.'],
  '/reports': ['Reportes ejecutivos', 'Informes listos para compartir con la dirección.'],
  '/settings': ['Ajustes del sistema', 'Bots, correo SMTP, claves de IA y configuración general.'],
};

export const Sidebar: React.FC = () => {
  const [hint, setHint] = useState<{ href: string; top: number; left: number } | null>(null);
  const pathname = usePathname();

  const navigation: NavSection[] = [
    {
      title: 'General',
      items: [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Estrategia', href: '/strategy', icon: Compass, badge: 'CORE' },
        { name: 'Acciones', href: '/actions', icon: CheckSquare, badge: '4' },
      ],
    },
    {
      title: 'AI Visibility',
      items: [
        { name: 'Consultas', href: '/visibility/generator', icon: Sparkles },
        { name: 'Baterías', href: '/visibility/batteries', icon: Layers },
        { name: 'Ejecuciones', href: '/visibility/runs', icon: Target },
        { name: 'Competidores', href: '/visibility/competitors', icon: Eye },
        { name: 'Fuentes', href: '/visibility/sources', icon: Database },
        { name: 'Discovery', href: '/visibility/discovery', icon: ShieldCheck },
      ],
    },
    {
      title: 'Mercado',
      items: [
        { name: 'Precios', href: '/market/prices', icon: DollarSign },
        { name: 'Fabricantes', href: '/market/suppliers', icon: Factory },
        { name: 'Benchmarks', href: '/market/benchmarks', icon: TrendingUp },
      ],
    },
    {
      title: 'Costos',
      items: [
        { name: 'Productos', href: '/cost/skus', icon: Database },
        { name: 'Hojas de costo', href: '/cost/cost-sheets', icon: Calculator },
        { name: 'Procesos', href: '/cost/processes', icon: Factory, badge: 'PREVIEW' },
        { name: 'Export', href: '/cost/logistics', icon: Truck, badge: 'NEW' },
        { name: 'Escenarios', href: '/cost/scenarios', icon: Compass },
        { name: 'Eficiencia', href: '/cost/efficiency', icon: TrendingUp },
      ],
    },
    {
      title: 'Pricing',
      items: [
        { name: 'Estrategias de precio', href: '/pricing/strategy', icon: DollarSign, badge: 'CORE' },
      ],
    },
    {
      title: 'RFQ',
      items: [
        { name: 'Descubrimiento', href: '/rfq/discovery', icon: Search },
        { name: 'Especificaciones', href: '/rfq/rfqs', icon: FileText },
        { name: 'Bandeja Gmail', href: '/rfq/inbox', icon: Inbox },
        { name: 'Cotizaciones', href: '/rfq/quotes', icon: CheckSquare },
      ],
    },
    {
      title: 'Logística',
      items: [
        { name: 'Resumen', href: '/logistics', icon: Truck, badge: 'NEW' },
        { name: 'Marítimo', href: '/logistics/ocean', icon: Compass },
        { name: 'Terrestre', href: '/logistics/road', icon: Truck },
        { name: 'Transportistas', href: '/logistics/providers', icon: Factory },
        { name: 'Histórico', href: '/logistics/history', icon: Database },
      ],
    },
    {
      title: 'Comercial',
      items: [
        { name: 'CRM', href: '/commercial', icon: Users, badge: 'NEW' },
      ],
    },
    {
      title: 'Sistema',
      items: [
        { name: 'Reportes', href: '/reports', icon: FileText },
        { name: 'Ajustes', href: '/settings', icon: Settings, badge: 'BOTS' },
      ],
    },
  ];

  // "General" son accesos directos; el resto son módulos desplegables (uno abierto a la vez).
  const [general, ...modules] = navigation;
  // Activo = la ruta más específica que contiene la URL actual (/logistics vs /logistics/ocean).
  const activeHref = navigation
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((h) => pathname === h || (h !== '/' && pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const isItemActive = (href: string) => href === activeHref;
  const activeModule = modules.find((m) => m.items.some((i) => isItemActive(i.href)))?.title ?? null;
  const [openModule, setOpenModule] = useState<string | null>(activeModule);
  useEffect(() => {
    if (activeModule) setOpenModule(activeModule);
  }, [activeModule]);

  const hintHandlers = (href: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setHint({ href, top: r.top + r.height / 2, left: r.right + 8 });
    },
    onMouseLeave: () => setHint(null),
    onClick: () => setHint(null),
  });

  const renderItem = (item: NavSection['items'][number], nested = false) => {
    const isActive = isItemActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        {...hintHandlers(item.href)}
        className={`group flex items-center justify-between rounded-md text-xs font-medium transition-colors ${nested ? 'px-2 py-1.5' : 'px-2.5 py-2'} ${
          isActive ? 'bg-brand-500/10 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-3.5 w-3.5 shrink-0 transition-colors ${isActive ? 'text-brand-500' : 'text-slate-500 group-hover:text-slate-300'}`} />
          <span className="truncate">{item.name}</span>
        </div>
        {item.badge && (
          <span
            className={`text-[10px] font-mono px-1 py-0.2 rounded font-semibold ${
              item.badge === 'CORE'
                ? 'bg-brand-950 text-brand-400 border border-brand-800/60'
                : item.badge === 'PREVIEW'
                  ? 'bg-amber-950/50 text-amber-300 border border-amber-800/60'
                  : 'bg-slate-800 text-slate-300'
            }`}
          >
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="w-48 bg-[#0a0d12] border-r border-slate-800 flex flex-col shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-14 px-3 border-b border-slate-800 flex items-center">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 shrink-0 rounded bg-brand-500 flex items-center justify-center font-bold text-white text-[10px] tracking-wider shadow-sm">
            NIU
          </div>
          <div className="flex flex-col min-w-0">
            <span className="whitespace-nowrap font-semibold text-xs text-white tracking-wide leading-none">INTELLIGENCE OS</span>
            <span className="text-[10px] text-slate-500 font-mono tracking-tight leading-none mt-1">GARDINER S.A.</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5" onScroll={() => setHint(null)}>
        {general.items.map((item) => renderItem(item))}

        <div className="my-2 border-t border-slate-800/70" />

        {modules.map((section) => {
          const ModuleIcon = MODULE_ICON[section.title] ?? Layers;
          const containsActive = section.title === activeModule;
          // El CRM es un único destino: va directo, sin desplegable.
          if (section.title === 'Comercial') {
            const only = section.items[0];
            return renderItem({ ...only, name: section.title, icon: ModuleIcon });
          }
          const open = openModule === section.title;
          return (
            <div key={section.title}>
              <button
                onClick={() => setOpenModule(open ? null : section.title)}
                aria-expanded={open}
                className={`group flex w-full items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                  open ? 'text-white' : containsActive ? 'text-slate-200' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <ModuleIcon className={`h-3.5 w-3.5 shrink-0 ${containsActive ? 'text-brand-500' : 'text-slate-500 group-hover:text-slate-300'}`} />
                  <span className="truncate">{section.title}</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="mb-1 ml-2 mt-0.5 space-y-0.5 rounded-lg border border-slate-800 bg-[#0e1218] p-1">
                  {section.items.map((item) => renderItem(item, true))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="px-3 py-2.5 border-t border-slate-800 bg-[#080b0f] flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
          <span className="truncate">Planta Asunción</span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">v1.0</span>
      </div>
      {hint && HINTS[hint.href] && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[70] w-64 -translate-y-1/2 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2.5 shadow-2xl backdrop-blur-md"
          style={{ top: hint.top, left: hint.left }}
        >
          <p className="text-xs font-semibold text-white/95">{HINTS[hint.href][0]}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-white/70">{HINTS[hint.href][1]}</p>
        </div>
      )}
    </aside>
  );
};

const MODULE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  'AI Visibility': Eye,
  Mercado: TrendingUp,
  Costos: Calculator,
  Pricing: DollarSign,
  RFQ: FileText,
  Logística: Truck,
  Comercial: Users,
  Sistema: Settings,
};
