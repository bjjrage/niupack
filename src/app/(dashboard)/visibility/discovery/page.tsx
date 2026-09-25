import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Globe, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchDiscoveryService } from '@/lib/discovery/search-discovery';

export const revalidate = 0;

export default async function DiscoveryPage() {
  const check = await SearchDiscoveryService.checkDomain();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 1</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">OpenAI Search Discovery</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Estado de Descubrimiento e Indexación para OpenAI
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Diagnóstico técnico de accesibilidad de la web pública de NIUPACK para el bot de búsqueda web de OpenAI (OAI-SearchBot).
          </p>
        </div>
      </div>

      {/* Main Status Traffic Light Banner */}
      <div
        className={`p-5 rounded border ${
          check.overall_status === 'GREEN'
            ? 'bg-emerald-950/20 border-emerald-800/60'
            : check.overall_status === 'YELLOW'
            ? 'bg-amber-950/20 border-amber-800/60'
            : 'bg-red-950/20 border-red-800/60'
        } flex flex-wrap items-center justify-between gap-4`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`h-12 w-12 rounded flex items-center justify-center font-bold text-lg ${
              check.overall_status === 'GREEN'
                ? 'bg-emerald-500 text-black'
                : check.overall_status === 'YELLOW'
                ? 'bg-amber-500 text-black'
                : 'bg-red-600 text-white'
            }`}
          >
            {check.overall_status === 'GREEN' ? 'OK' : check.overall_status === 'YELLOW' ? 'WARN' : 'CRIT'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                Estado General: {check.overall_status}
              </h2>
              <Badge
                variant={
                  check.overall_status === 'GREEN'
                    ? 'success'
                    : check.overall_status === 'YELLOW'
                    ? 'warning'
                    : 'danger'
                }
              >
                {check.overall_status === 'GREEN'
                  ? 'Óptimo para Indexación'
                  : check.overall_status === 'YELLOW'
                  ? 'Requiere Ajustes Menores'
                  : 'Bloqueado para Búsqueda AI'}
              </Badge>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Última verificación técnica realizada: {new Date(check.last_checked).toLocaleString('es')} sobre {check.url}
            </p>
          </div>
        </div>
      </div>

      {/* Technical Audit Checklist */}
      <div className="bg-[#141820] border border-slate-800 rounded p-5 space-y-4">
        <h3 className="text-xs font-semibold text-white tracking-tight">Verificaciones Técnicas de Indexabilidad</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-[#10141b] border border-slate-800 rounded flex items-start gap-3">
            {check.accessible ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-semibold text-white block">Sitio Web Accesible</span>
              <span className="text-slate-400 text-[11px]">
                Código HTTP {check.http_status || 200}. El servidor responde dentro de la ventana de timeout.
              </span>
            </div>
          </div>

          <div className="p-3 bg-[#10141b] border border-slate-800 rounded flex items-start gap-3">
            {check.oai_searchbot_allowed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-semibold text-white block">OAI-SearchBot Permitido</span>
              <span className="text-slate-400 text-[11px]">
                {check.oai_searchbot_allowed
                  ? 'El bot de búsqueda web de OpenAI tiene acceso no bloqueado a las URLs del sitio.'
                  : 'El archivo robots.txt bloquea a OAI-SearchBot o ChatGPT-User.'}
              </span>
            </div>
          </div>

          <div className="p-3 bg-[#10141b] border border-slate-800 rounded flex items-start gap-3">
            {check.robots_txt_exists ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-semibold text-white block">Archivo robots.txt</span>
              <span className="text-slate-400 text-[11px]">
                {check.robots_txt_exists
                  ? 'Archivo robots.txt presente y analizable en la raíz del servidor.'
                  : 'No se detectó archivo robots.txt explícito.'}
              </span>
            </div>
          </div>

          <div className="p-3 bg-[#10141b] border border-slate-800 rounded flex items-start gap-3">
            {check.sitemap_exists ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-semibold text-white block">Sitemap XML</span>
              <span className="text-slate-400 text-[11px]">
                {check.sitemap_exists
                  ? 'Sitemap indexado disponible con URLs para idiomas ES y PT.'
                  : 'Se recomienda publicar un sitemap.xml con URLs multilingües (/pt.html, /en.html).'}
              </span>
            </div>
          </div>
        </div>

        {/* Warning and Recommendations */}
        {check.warnings.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-white block">Alertas y Sugerencias de Optimización:</span>
            <ul className="space-y-1 text-xs text-slate-400 list-disc list-inside">
              {check.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded text-[11px] text-slate-400">
          <strong className="text-slate-300">Regla Estricta:</strong> El NIU Intelligence OS nunca modifica automáticamente el sitio público ni archivos de servidor. Solo audita y genera recomendaciones tecnológicas para el equipo de desarrollo web.
        </div>
      </div>
    </div>
  );
}
