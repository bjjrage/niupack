'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Eye,
  Link as LinkIcon,
  Database,
  Layers,
  Sparkles,
  DollarSign,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { VisibilityStepper } from '@/components/visibility/VisibilityStepper';
import { QueryRun, QueryResult, QueryMentionAnalysis, VisibilitySnapshot } from '@/types';

interface RunAuditViewProps {
  run: QueryRun;
  results: QueryResult[];
  mentions: QueryMentionAnalysis[];
  snapshots: VisibilitySnapshot[];
}

export const RunAuditView: React.FC<RunAuditViewProps> = ({ run, results, mentions, snapshots }) => {
  const [activeTab, setActiveTab] = useState<'RESUMEN' | 'GANADAS' | 'PERDIDAS' | 'COMPETIDORES' | 'FUENTES' | 'RAW'>('RESUMEN');
  const [selectedMarketFilter, setSelectedMarketFilter] = useState<string>('ALL');

  // Compute stats for this run
  const total = results.length;
  const wonResults = results.filter((r) => {
    const m = mentions.find((men) => men.result_id === r.id);
    return m?.niupack_mentioned;
  });
  const lostResults = results.filter((r) => {
    const m = mentions.find((men) => men.result_id === r.id);
    return !m?.niupack_mentioned;
  });

  // Competitors mentioned aggregation
  const competitorMap: Record<string, { count: number; markets: Set<string> }> = {};
  mentions.forEach((m) => {
    const comps = m.competitors?.map((c) => c.name) ?? m.competitors_mentioned ?? [];
    comps.forEach((comp) => {
      const normalized = comp.trim();
      if (!competitorMap[normalized]) {
        competitorMap[normalized] = { count: 0, markets: new Set() };
      }
      competitorMap[normalized].count += 1;
      const res = results.find((r) => r.id === m.result_id);
      if (res) competitorMap[normalized].markets.add(res.country_code);
    });
  });

  const competitorList = Object.entries(competitorMap)
    .map(([name, data]) => ({
      name,
      count: data.count,
      share: total > 0 ? Math.round((data.count / total) * 100) : 0,
      markets: Array.from(data.markets),
    }))
    .sort((a, b) => b.count - a.count);

  // Sources aggregation
  const sourceDomainMap: Record<string, { count: number; urls: string[] }> = {};
  results.forEach((r) => {
    r.sources_json?.forEach((s: { url: string; title?: string }) => {
      try {
        const domain = new URL(s.url).hostname.replace(/^www\./, '');
        if (!sourceDomainMap[domain]) {
          sourceDomainMap[domain] = { count: 0, urls: [] };
        }
        sourceDomainMap[domain].count += 1;
        if (!sourceDomainMap[domain].urls.includes(s.url)) {
          sourceDomainMap[domain].urls.push(s.url);
        }
      } catch (e) {
        // fallback
      }
    });
  });

  const sourceDomainList = Object.entries(sourceDomainMap)
    .map(([domain, data]) => ({
      domain,
      count: data.count,
      urls: data.urls,
    }))
    .sort((a, b) => b.count - a.count);

  // Market metrics from snapshots or fallback
  const markets = ['TOTAL', 'BR', 'AR', 'BO', 'PY'];
  const marketKPIs = markets.map((mCode) => {
    const snap = snapshots.find((s) => s.market_code === mCode);
    if (snap) {
      return {
        market: mCode,
        visibility_score: snap.visibility_score ?? snap.overall_score,
        mention_rate: snap.mention_rate,
        link_rate: snap.link_rate,
        source_rate: snap.source_rate,
      };
    }
    // Calculate on the fly for this market
    const mResults = mCode === 'TOTAL' ? results : results.filter((r) => r.country_code === mCode);
    const mMentions = mentions.filter((men) => {
      const res = results.find((r) => r.id === men.result_id);
      return mCode === 'TOTAL' ? true : res?.country_code === mCode;
    });
    const mTotal = mResults.length || 1;
    const mentioned = mMentions.filter((m) => m.niupack_mentioned).length;
    const linked = mMentions.filter((m) => m.niupack_linked).length;
    const sourced = mMentions.filter((m) => m.niupack_as_source ?? m.niupack_sourced).length;

    const mScore = Math.round(
      (mentioned / mTotal) * 40 + (linked / mTotal) * 35 + (sourced / mTotal) * 25
    );

    return {
      market: mCode,
      visibility_score: mScore,
      mention_rate: Math.round((mentioned / mTotal) * 100),
      link_rate: Math.round((linked / mTotal) * 100),
      source_rate: Math.round((sourced / mTotal) * 100),
    };
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 7-Step Navigation Stepper */}
      <VisibilityStepper currentStep={5} />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Link href="/visibility/runs">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Historial
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-brand-950 text-brand-400 border border-brand-800/60">
                {run.execution_label || 'RUN'}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {new Date(run.created_at).toLocaleString('es')}
              </span>
              {run.is_simulated && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60">
                  DEMO / SIMULADO
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-1">{run.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <Badge variant={run.status === 'COMPLETED' ? 'success' : 'warning'}>{run.status}</Badge>
          <span className="text-slate-300 px-2.5 py-1 rounded bg-[#141820] border border-slate-800">
            Modelo: <strong className="text-white">{run.model}</strong>
          </span>
          <span className="text-slate-300 px-2.5 py-1 rounded bg-[#141820] border border-slate-800">
            Costo: <strong className="text-emerald-400">${Number(run.actual_cost_usd || 0).toFixed(4)} USD</strong>
          </span>
        </div>
      </div>

      {/* Executive KPI Summary Cards by Market */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 font-mono">
        {marketKPIs.map((kpi) => (
          <div
            key={kpi.market}
            className={`p-3.5 rounded-lg border ${
              kpi.market === 'TOTAL'
                ? 'bg-gradient-to-b from-[#161f2c] to-[#10141b] border-brand-500/50'
                : 'bg-[#11161d] border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-400 pb-1.5 border-b border-slate-800/80">
              <span className="font-bold text-white">
                {kpi.market === 'TOTAL' ? 'CONSOLIDADO' : `MERCADO ${kpi.market}`}
              </span>
              <span className="text-[10px] text-brand-400">Score AI</span>
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-2">
              {kpi.visibility_score}%
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-slate-400">
              <div className="flex justify-between">
                <span>Mención:</span>
                <span className="text-slate-200">{kpi.mention_rate}%</span>
              </div>
              <div className="flex justify-between">
                <span>Link Web:</span>
                <span className="text-slate-200">{kpi.link_rate}%</span>
              </div>
              <div className="flex justify-between">
                <span>Fuente Citada:</span>
                <span className="text-slate-200">{kpi.source_rate}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 6 Tabs Navigation */}
      <div className="border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs font-mono">
        {[
          { id: 'RESUMEN', label: '1. RESUMEN EJECUTIVO' },
          { id: 'GANADAS', label: `2. QUERIES GANADAS (${wonResults.length})` },
          { id: 'PERDIDAS', label: `3. QUERIES PERDIDAS (${lostResults.length})` },
          { id: 'COMPETIDORES', label: `4. COMPETIDORES (${competitorList.length})` },
          { id: 'FUENTES', label: `5. FUENTES CITADAS (${sourceDomainList.length})` },
          { id: 'RAW', label: `6. RESPUESTAS RAW (${results.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-2.5 border-b-2 font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-brand-500 text-white font-bold bg-brand-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: RESUMEN EJECUTIVO */}
      {activeTab === 'RESUMEN' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#141820] border border-slate-800 p-4 rounded-lg space-y-3">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                Eficacia de Búsqueda
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Total Consultas Auditadas:</span>
                  <span className="text-white font-bold">{total}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Ganadas (Mención NIUPACK):</span>
                  <span className="text-emerald-400 font-bold">{wonResults.length} ({total > 0 ? Math.round((wonResults.length / total) * 100) : 0}%)</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Perdidas (Sin mención):</span>
                  <span className="text-red-400 font-bold">{lostResults.length} ({total > 0 ? Math.round((lostResults.length / total) * 100) : 0}%)</span>
                </div>
              </div>
            </div>

            <div className="bg-[#141820] border border-slate-800 p-4 rounded-lg space-y-3">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                Consumo y Rendimiento OpenAI
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Tokens de Entrada:</span>
                  <span className="text-white font-bold">{results.reduce((acc, r) => acc + (r.tokens_input || 0), 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tokens de Salida:</span>
                  <span className="text-white font-bold">{results.reduce((acc, r) => acc + (r.tokens_output || 0), 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Latencia Media:</span>
                  <span className="text-white font-bold">
                    {results.length > 0 ? Math.round(results.reduce((acc, r) => acc + (r.latency_ms || 0), 0) / results.length) : 0} ms
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-[#141820] border border-slate-800 p-4 rounded-lg flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                  Siguiente Paso: Plan de Acción
                </h3>
                <p className="text-xs text-slate-400 mt-2">
                  Los resultados de esta auditoría generan automáticamente oportunidades de indexación y optimización.
                </p>
              </div>
              <Link href="/actions" className="mt-4">
                <Button variant="primary" size="sm" className="w-full font-semibold">
                  Ver Centro de Acciones <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: QUERIES GANADAS */}
      {activeTab === 'GANADAS' && (
        <div className="space-y-3">
          {wonResults.length === 0 ? (
            <div className="p-8 text-center bg-[#141820] border border-slate-800 rounded text-slate-400 text-xs">
              No hubo consultas ganadas en esta ejecución. Revise las consultas perdidas para identificar oportunidades de posicionamiento.
            </div>
          ) : (
            wonResults.map((r, idx) => {
              const m = mentions.find((men) => men.result_id === r.id);
              return (
                <div key={r.id} className="bg-[#141820] border border-emerald-950 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
                        {r.country_code}
                      </span>
                      <span className="text-xs font-semibold text-white">{r.raw_prompt}</span>
                    </div>
                    <Badge variant="success" size="sm">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Mencionada (Pos #{m?.position || 1})
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-line bg-[#0c0f14] p-3 rounded">
                    {r.raw_response}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: QUERIES PERDIDAS */}
      {activeTab === 'PERDIDAS' && (
        <div className="space-y-3">
          {lostResults.length === 0 ? (
            <div className="p-8 text-center bg-[#141820] border border-slate-800 rounded text-emerald-400 text-xs font-semibold">
              ¡100% de visibilidad! Todas las consultas mencionaron a NIUPACK.
            </div>
          ) : (
            lostResults.map((r, idx) => {
              const m = mentions.find((men) => men.result_id === r.id);
              const comps = m?.competitors?.map((c) => c.name) ?? m?.competitors_mentioned ?? [];
              return (
                <div key={r.id} className="bg-[#141820] border border-red-950/60 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
                        {r.country_code}
                      </span>
                      <span className="text-xs font-semibold text-white">{r.raw_prompt}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {comps.length > 0 && (
                        <span className="text-[10px] font-mono text-amber-300 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded">
                          Ganó: {comps.join(', ')}
                        </span>
                      )}
                      <Badge variant="danger" size="sm">
                        <XCircle className="h-3 w-3 mr-1" /> Sin mención
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 whitespace-pre-line bg-[#0c0f14] p-3 rounded">
                    {r.raw_response}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: COMPETIDORES */}
      {activeTab === 'COMPETIDORES' && (
        <div className="bg-[#141820] border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead className="bg-[#0e1218] border-b border-slate-800 text-slate-400">
              <tr>
                <th className="p-3 text-left">Competidor Detectado</th>
                <th className="p-3 text-center">Menciones en este Run</th>
                <th className="p-3 text-center">Share de Mención (%)</th>
                <th className="p-3 text-left">Mercados de Presencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {competitorList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-500 font-sans">
                    No se detectaron competidores nombrados en las respuestas.
                  </td>
                </tr>
              ) : (
                competitorList.map((comp) => (
                  <tr key={comp.name} className="hover:bg-slate-800/30">
                    <td className="p-3 font-semibold text-white">{comp.name}</td>
                    <td className="p-3 text-center text-amber-400 font-bold">{comp.count}</td>
                    <td className="p-3 text-center text-slate-300">{comp.share}%</td>
                    <td className="p-3 text-slate-400">{comp.markets.join(', ')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: FUENTES CITADAS */}
      {activeTab === 'FUENTES' && (
        <div className="bg-[#141820] border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead className="bg-[#0e1218] border-b border-slate-800 text-slate-400">
              <tr>
                <th className="p-3 text-left">Dominio Citado</th>
                <th className="p-3 text-center">Citas en este Run</th>
                <th className="p-3 text-left">URLs de Referencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sourceDomainList.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-slate-500 font-sans">
                    No se registraron enlaces o fuentes citadas en esta ejecución.
                  </td>
                </tr>
              ) : (
                sourceDomainList.map((src) => (
                  <tr key={src.domain} className="hover:bg-slate-800/30">
                    <td className="p-3 font-semibold text-brand-400">{src.domain}</td>
                    <td className="p-3 text-center text-white font-bold">{src.count}</td>
                    <td className="p-3 text-slate-400 max-w-md truncate">
                      <div className="flex flex-wrap gap-1.5">
                        {src.urls.slice(0, 3).map((u, uidx) => (
                          <a
                            key={uidx}
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            <span className="truncate max-w-[200px]">{u}</span>
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 6: RESPUESTAS RAW */}
      {activeTab === 'RAW' && (
        <div className="space-y-4">
          {results.map((r, idx) => (
            <div key={r.id} className="bg-[#141820] border border-slate-800 rounded-lg p-4 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
                <span className="text-white font-semibold">
                  [#{idx + 1}] {r.country_code} — {r.raw_prompt}
                </span>
                <span className="text-[11px]">
                  Tokens: {r.total_tokens} | Latencia: {r.latency_ms}ms | Costo: ${r.cost_usd.toFixed(5)}
                </span>
              </div>
              <div className="p-3 bg-[#0c0f14] border border-slate-800/80 rounded text-slate-300 font-sans whitespace-pre-line leading-relaxed">
                {r.raw_response}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
