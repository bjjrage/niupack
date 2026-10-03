'use client';

import { useState } from 'react';
import {
  Bot,
  Building2,
  Columns3,
  Inbox,
  ListTodo,
  MessageSquareText,
  Sparkles,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

type View = 'dashboard' | 'pipeline' | 'accounts' | 'inbox' | 'tasks';

const views: Array<{ key: View; label: string; icon: typeof Users }> = [
  { key: 'dashboard', label: 'Dashboard', icon: Sparkles },
  { key: 'pipeline', label: 'Pipeline', icon: Columns3 },
  { key: 'accounts', label: 'Empresas & Leads', icon: Building2 },
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'tasks', label: 'Tareas', icon: ListTodo },
];

const stages = ['NUEVO', 'CONTACTADO', 'CALIFICADO', 'COTIZACIÓN', 'NEGOCIACIÓN'] as const;

function EmptyPanel({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: typeof Users;
}) {
  return (
    <div className="grid min-h-[280px] place-items-center p-8 text-center">
      <div className="max-w-md">
        <Icon className="mx-auto h-6 w-6 text-brand-400" />
        <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export function CommercialCrmWorkspace() {
  const [view, setView] = useState<View>('dashboard');

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold uppercase text-brand-400">Commercial CRM</span>
            <Badge variant="brand" size="sm">V1</Badge>
            <Badge variant="neutral" size="sm">NIUPACKBOT · PENDING</Badge>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Ventas & Conversaciones NIUPACK</h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            Shell comercial nativo de NIUPACK OS. El CRM será la fuente de verdad comercial y NIUPACKBOT vivirá como módulo interno del mismo backend y Supabase.
          </p>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-[#11161d] p-2">
        {views.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`inline-flex items-center gap-2 rounded px-3 py-2 text-xs font-medium transition ${
              view === key
                ? 'bg-brand-500/15 text-white ring-1 ring-brand-800/70'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      <div className="rounded-lg border border-brand-900/40 bg-brand-950/10 p-4">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
          <div>
            <p className="text-xs font-semibold text-slate-200">Arquitectura preparada para NIUPACKBOT</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              No existe dependencia productiva con AutoLeadBot. NIUPACKBOT se implementará dentro de este mismo OS y utilizará servicios CRM internos, manteniendo separación lógica para permitir extracción futura si la escala lo exige.
            </p>
          </div>
        </div>
      </div>

      {view === 'dashboard' && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Leads', '—', 'Pendiente de persistencia CRM'],
              ['Conversaciones', '—', 'Pendiente de NIUPACKBOT'],
              ['Oportunidades', '—', 'Pendiente de pipeline persistente'],
              ['Tareas abiertas', '—', 'Pendiente de persistencia CRM'],
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-[#141820] p-4">
                <p className="text-xs font-medium text-slate-400">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
                <p className="mt-2 text-[11px] text-slate-500">{note}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <section className="rounded-lg border border-slate-800 bg-[#141820] p-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-semibold text-white">Pipeline comercial</h2>
                <p className="mt-1 text-[11px] text-slate-500">La superficie existe; la persistencia se implementa en el siguiente hito.</p>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {stages.map((stage) => (
                  <div key={stage} className="rounded border border-slate-800 bg-[#0c0f14] p-3">
                    <p className="text-[10px] font-mono text-slate-500">{stage}</p>
                    <p className="mt-2 text-xl font-semibold text-white">0</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-[#141820]">
              <div className="flex items-center gap-2 border-b border-slate-800 p-4">
                <MessageSquareText className="h-4 w-4 text-brand-400" />
                <h2 className="text-sm font-semibold text-white">Últimas conversaciones</h2>
              </div>
              <EmptyPanel
                title="Sin conversaciones"
                description="NIUPACKBOT todavía no fue implementado. Esta superficie queda reservada para conversaciones comerciales reales."
                icon={Inbox}
              />
            </section>
          </div>
        </div>
      )}

      {view === 'pipeline' && (
        <div className="overflow-x-auto pb-3">
          <div className="grid min-w-[1250px] grid-cols-5 gap-3">
            {stages.map((stage) => (
              <section key={stage} className="rounded-lg border border-slate-800 bg-[#0f1319]">
                <header className="flex items-center justify-between border-b border-slate-800 px-3 py-3">
                  <span className="text-[11px] font-semibold text-slate-300">{stage}</span>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">0</span>
                </header>
                <p className="py-10 text-center text-[11px] text-slate-600">Sin oportunidades</p>
              </section>
            ))}
          </div>
        </div>
      )}

      {view === 'accounts' && (
        <section className="rounded-lg border border-slate-800 bg-[#141820]">
          <header className="border-b border-slate-800 p-4">
            <h2 className="text-sm font-semibold text-white">Empresas & Leads</h2>
            <p className="mt-1 text-[11px] text-slate-500">La identidad empresa/contacto se implementará sobre las tablas CRM propias de NIUPACK.</p>
          </header>
          <EmptyPanel
            title="Sin empresas ni leads"
            description="No se importan datos desde AutoLead. Esta vista será alimentada por la persistencia CRM nativa."
            icon={Building2}
          />
        </section>
      )}

      {view === 'inbox' && (
        <div className="grid min-h-[620px] gap-4 lg:grid-cols-[340px_1fr_320px]">
          <section className="rounded-lg border border-slate-800 bg-[#141820]">
            <header className="border-b border-slate-800 p-3">
              <h2 className="text-xs font-semibold text-white">Conversaciones</h2>
            </header>
            <EmptyPanel
              title="Inbox vacío"
              description="Las conversaciones llegarán desde NIUPACKBOT dentro del mismo OS."
              icon={Inbox}
            />
          </section>

          <section className="rounded-lg border border-slate-800 bg-[#141820]">
            <header className="border-b border-slate-800 p-4">
              <p className="text-sm font-semibold text-white">Conversación</p>
            </header>
            <EmptyPanel
              title="Seleccioná una conversación"
              description="El historial se renderizará acá cuando NIUPACKBOT y la persistencia de conversaciones estén implementados."
              icon={MessageSquareText}
            />
          </section>

          <aside className="rounded-lg border border-slate-800 bg-[#141820] p-4">
            <h2 className="text-xs font-semibold text-white">Lead 360°</h2>
            <div className="mt-4 space-y-4">
              {['Contacto', 'Empresa', 'Producto', 'Volumen', 'Etapa', 'Owner', 'Next action'].map((label) => (
                <div key={label} className="border-b border-slate-800/70 pb-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
                  <p className="mt-1 text-xs text-slate-500">—</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {view === 'tasks' && (
        <section className="rounded-lg border border-slate-800 bg-[#141820]">
          <header className="flex items-center gap-3 border-b border-slate-800 p-4">
            <ListTodo className="h-5 w-5 text-brand-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">Tareas comerciales</h2>
              <p className="mt-1 text-xs text-slate-500">La superficie está preparada; escritura y asignación llegan con la persistencia CRM y RLS.</p>
            </div>
          </header>
          <EmptyPanel
            title="Sin tareas"
            description="Las tareas serán persistentes y podrán originarse tanto por acciones humanas como por NIUPACKBOT mediante el servicio CRM interno."
            icon={ListTodo}
          />
        </section>
      )}
    </div>
  );
}
