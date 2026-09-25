import React from 'react';
import { Eye, Trophy, ExternalLink, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { repository } from '@/lib/db/repository';
import { VisibilityEngine } from '@/lib/engines/visibility-engine';

export const revalidate = 0;

export default async function CompetitorsPage() {
  const mentions = await repository.getMentions();
  const metrics = VisibilityEngine.calculateScore(mentions);

  // Competitor list sorted by frequency
  const competitors = Object.entries(metrics.competitorShare)
    .map(([name, count]) => ({
      name,
      count,
      share: mentions.length > 0 ? Number(((count / mentions.length) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 1</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">AI Visibility</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Competidores en Búsquedas de ChatGPT
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Participación de mercado y frecuencia de aparición de competidores en respuestas de OpenAI para el sector packaging.
          </p>
        </div>
      </div>

      {/* Competitor Frequency Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {competitors.length === 0 ? (
          <div className="col-span-3 p-8 text-center bg-[#141820] border border-slate-800 rounded text-slate-500 text-xs">
            No se han registrado menciones de competidores todavía. Ejecuta un run de visibilidad para poblar esta tabla.
          </div>
        ) : (
          competitors.map((c, idx) => (
            <div key={c.name} className="bg-[#141820] border border-slate-800 rounded p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between">
                  <span className="text-xs font-mono font-bold text-slate-500">#{idx + 1} RANKING</span>
                  <Badge variant={idx === 0 ? 'brand' : 'neutral'} size="sm">
                    {c.share}% Share
                  </Badge>
                </div>
                <h3 className="text-base font-semibold text-white tracking-tight mt-2">{c.name}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Mencionado en {c.count} respuestas de OpenAI para consultas de vasos y envases.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="bg-brand-500 h-full rounded-full" style={{ width: `${Math.min(100, c.share * 2)}%` }}></div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
