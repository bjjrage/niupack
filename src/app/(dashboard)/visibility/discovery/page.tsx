import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { SearchDiscoveryService } from '@/lib/discovery/search-discovery';
import { SearchDiscoveryCheck } from '@/types';

export const revalidate = 0;

type Status = SearchDiscoveryCheck['overall_status'];

const technicalLabels: Array<[keyof SearchDiscoveryCheck['technical_checks'], string]> = [
  ['http_accessible', 'HTTP accesible'],
  ['response_code_ok', 'Código de respuesta'],
  ['robots_txt', 'robots.txt'],
  ['sitemap_xml', 'sitemap.xml'],
  ['oai_searchbot_allowed', 'OAI-SearchBot / crawlers'],
  ['title', 'Title'],
  ['meta_description', 'Meta description'],
  ['h1', 'H1'],
  ['canonical', 'Canonical'],
  ['hreflang', 'Hreflang'],
  ['organization_schema', 'Schema Organization'],
  ['website_schema', 'Schema WebSite'],
  ['image_alt_coverage', 'Cobertura image alt'],
  ['internal_links', 'Enlaces internos'],
  ['language_alternates', 'Alternates de idioma'],
  ['sitemap_urls', 'URLs del sitemap'],
  ['robots_sitemap_declaration', 'Sitemap declarado en robots'],
  ['noindex_nofollow_absent', 'Sin noindex/nofollow'],
  ['viewport', 'Meta viewport'],
  ['basic_seo_readiness', 'SEO readiness básico'],
];

function statusVariant(status: Status): 'success' | 'warning' | 'danger' {
  return status === 'GREEN' ? 'success' : status === 'YELLOW' ? 'warning' : 'danger';
}

function statusLabel(status: Status): string {
  return status === 'GREEN' ? 'GREEN' : status === 'YELLOW' ? 'YELLOW' : 'RED';
}

function statusIcon(status: Status) {
  if (status === 'GREEN') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === 'YELLOW') return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-red-400" />;
}

function StatusCard({ title, status, detail }: { title: string; status: Status; detail: string }) {
  return (
    <div className="p-4 bg-[#141820] border border-slate-800 rounded flex items-start gap-3">
      <div className="mt-0.5">{statusIcon(status)}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white text-sm">{title}</span>
          <Badge variant={statusVariant(status)} size="sm">{statusLabel(status)}</Badge>
        </div>
        <p className="text-slate-400 text-[11px] mt-1">{detail}</p>
      </div>
    </div>
  );
}

export default async function DiscoveryPage() {
  const check = await SearchDiscoveryService.checkDomain();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800">
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
            Auditoría técnica de accesibilidad, crawler AI y SEO de la web pública de NIUPACK.
          </p>
          <p className="text-[11px] text-slate-500 mt-2">
            Sitio auditado: <span className="font-mono text-brand-300">{check.url}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatusCard
          title="Live accessibility"
          status={check.live_accessibility_status}
          detail={`HTTP ${check.http_status || 'sin respuesta'} · target live, no dominio futuro`}
        />
        <StatusCard
          title="AI crawler access"
          status={check.ai_crawler_status}
          detail={check.oai_searchbot_allowed ? 'OAI-SearchBot no está bloqueado por robots.txt.' : 'OAI-SearchBot está bloqueado.'}
        />
        <StatusCard
          title="SEO readiness"
          status={check.seo_readiness_status}
          detail={`${check.title ? 'Title' : 'Sin title'} · ${check.meta_description ? 'description' : 'sin description'} · ${check.h1_count} H1`}
        />
        <div className="p-4 bg-[#141820] border border-slate-800 rounded flex items-start gap-3">
          <div className="mt-0.5">
            {check.future_domain_status === 'LIVE' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white text-sm">Future domain readiness</span>
              <Badge variant={check.future_domain_status === 'LIVE' ? 'success' : 'warning'} size="sm">
                {check.future_domain_status === 'LIVE' ? 'LIVE' : check.future_domain_status}
              </Badge>
            </div>
            <p className="text-slate-400 text-[11px] mt-1">
              {check.future_canonical_domain || 'No configurado'} · no afecta el healthcheck live
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#141820] border border-slate-800 rounded p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-white tracking-tight">Auditoría técnica completa</h2>
          <span className="text-[11px] text-slate-500">
            Última auditoría: {new Date(check.last_checked).toLocaleString('es')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
          {technicalLabels.map(([key, label]) => {
            const passed = check.technical_checks[key];
            return (
              <div key={key} className="p-2.5 bg-[#10141b] border border-slate-800 rounded flex items-center gap-2">
                {passed ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                <span className={passed ? 'text-slate-200' : 'text-amber-300'}>{label}</span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-400 pt-2 border-t border-slate-800">
          <div>
            <span className="text-slate-300 font-semibold">robots URL:</span> <span className="font-mono">{check.robots_url || '—'}</span>
          </div>
          <div>
            <span className="text-slate-300 font-semibold">sitemap URL:</span> <span className="font-mono">{check.sitemap_url || '—'}</span>
          </div>
          <div>
            <span className="text-slate-300 font-semibold">Canonical:</span> <span className="font-mono">{check.canonical_url || '—'}</span> · {check.canonical_classification}
          </div>
          <div>
            <span className="text-slate-300 font-semibold">Contenido:</span> {check.image_count} imágenes ({check.images_missing_alt} sin alt), {check.internal_link_count} enlaces internos, {check.sitemap_url_count} URLs en sitemap
          </div>
        </div>

        {check.warnings.length > 0 && (
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-white block">Alertas y recomendaciones</span>
            <ul className="space-y-1 text-xs text-slate-400 list-disc list-inside">
              {check.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
            </ul>
          </div>
        )}

        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded text-[11px] text-slate-400">
          <strong className="text-slate-300">Regla:</strong> NIU Intelligence OS audita, reporta y recomienda. No modifica automáticamente GitHub Pages, robots.txt, sitemap, canonical ni archivos HTML.
        </div>
      </div>
    </div>
  );
}
