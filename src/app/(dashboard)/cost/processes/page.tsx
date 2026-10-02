import { AlertTriangle, ArrowRight, Factory } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { INITIAL_PROCESS_DEF } from '@/lib/db/seed-data';

export default function ProcessesPage() {
  const process = INITIAL_PROCESS_DEF;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold uppercase text-brand-400">Módulo 3</span>
            <span className="text-xs text-slate-600">/</span>
            <span className="text-xs text-slate-400">Cost Intelligence</span>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Procesos Productivos &amp; Rendimiento de Planta</h1>
          <p className="mt-1 text-xs text-slate-400">Modelado de etapas productivas, capacidad, energía, setup, rendimiento y cuellos de botella.</p>
          <p className="mt-2 text-[11px] font-mono text-slate-500">{process.sku} · {process.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">PREVIEW</Badge>
          <Badge variant="neutral">CONFIGURACIÓN DE EJEMPLO</Badge>
        </div>
      </header>

      <section aria-label="Alcance del módulo preview" className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-amber-800/50 bg-amber-950/15 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Factory className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <h2 className="text-sm font-semibold text-white">Módulo Industrial — Preview</h2>
            <p className="mt-1 max-w-4xl text-xs leading-relaxed text-slate-300">
              Esta superficie permite modelar procesos, capacidad, energía, mano de obra, setup y merma. Actualmente no participa del cálculo oficial de Cost Intelligence V1.
            </p>
            <p className="mt-2 text-[11px] text-amber-200/80">Los valores visibles son datos de demostración; no representan información productiva real de NIUPACK.</p>
          </div>
        </div>
        <Badge variant="warning" className="shrink-0">NO IMPACTA COSTO V1</Badge>
      </section>

      <section aria-labelledby="process-steps-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="process-steps-heading" className="text-sm font-semibold text-white">Etapas del flujo productivo</h2>
            <p className="mt-1 text-[11px] text-slate-500">Planta Industrial Asunción · configuración de ejemplo</p>
          </div>
          <span className="text-[11px] font-mono text-slate-500">{process.steps.length} etapas</span>
        </div>

        <div className="space-y-3">
          {process.steps.map((step) => (
            <article
              key={step.id}
              className={`space-y-3 rounded-lg border bg-[#141820] p-4 ${
                step.is_bottleneck ? 'border-red-900/60 bg-red-950/10' : 'border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-800 font-mono text-xs font-bold text-slate-200">
                    {String(step.step_order).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold tracking-tight text-white">{step.name}</h3>
                    <p className="mt-0.5 text-[11px] font-mono text-slate-400">Máquina: {step.machine_name} · Operadores: {step.operators_count}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {step.is_bottleneck && (
                    <Badge variant="danger" size="sm"><AlertTriangle className="mr-1 h-3 w-3" />Cuello de botella</Badge>
                  )}
                  <Badge variant="neutral" size="sm">Merma: {step.scrap_rate_percent}%</Badge>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3 xl:grid-cols-5">
                <div>
                  <dt className="text-[11px] text-slate-500">Tiempo de ciclo</dt>
                  <dd className="mt-0.5 font-mono font-medium text-slate-200">{step.cycle_time_seconds} s / ciclo</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Capacidad</dt>
                  <dd className="mt-0.5 font-mono font-medium tabular-nums text-slate-200">{step.capacity_units_per_hour.toLocaleString('es-PY')} u/h</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Setup / puesta a punto</dt>
                  <dd className="mt-0.5 font-mono font-medium text-slate-200">{step.setup_time_minutes} min</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Consumo energético</dt>
                  <dd className="mt-0.5 font-mono font-medium text-slate-200">{step.energy_kwh_per_hour} kWh/h</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-500">Costo horario (demo)</dt>
                  <dd className="mt-0.5 font-mono font-medium tabular-nums text-emerald-400">${step.hourly_cost_usd.toFixed(2)} USD/h</dd>
                </div>
              </dl>

              {step.notes && (
                <p className="border-t border-slate-800/60 pt-2 text-[11px] text-slate-400">
                  <strong className="text-slate-300">Control operativo:</strong> {step.notes}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="future-integration-heading" className="rounded-lg border border-slate-800 bg-[#11161d] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="future-integration-heading" className="text-sm font-semibold text-white">Integración futura</h2>
            <p className="mt-1 text-[11px] text-slate-500">Flujo conceptual, actualmente desconectado</p>
          </div>
          <Badge variant="neutral">INACTIVO</Badge>
        </div>
        <div className="mt-4 grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <div className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2.5 text-center text-xs font-medium text-slate-300">Procesos Industriales</div>
          <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-slate-600 sm:rotate-0" />
          <div className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2.5 text-center text-xs font-medium text-slate-300">Costo operativo calculado</div>
          <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-slate-600 sm:rotate-0" />
          <div className="rounded-md border border-slate-700 bg-[#0c0f14] px-3 py-2.5 text-center text-xs font-medium text-slate-300">Cost Intelligence</div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          En una futura versión, este módulo podrá alimentar automáticamente el costo operativo y la merma del motor de costos. En V1 esos valores se cargan manualmente.
        </p>
      </section>
    </div>
  );
}
