import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, DollarSign, Database, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { repository } from '@/lib/db/repository';

export const revalidate = 0;

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await repository.getRun(id);
  const results = await repository.getRunResults(id);
  const mentions = await repository.getMentions();

  if (!run) {
    return (
      <div className="p-8 text-center text-slate-400">
        Run no encontrado.{' '}
        <Link href="/visibility/runs" className="text-brand-400 hover:underline">
          Volver a runs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Link href="/visibility/runs">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">{run.name}</h1>
            <p className="text-xs text-slate-400 font-mono">
              Modelo: {run.model} · {results.length} resultados registrados
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={run.status === 'COMPLETED' ? 'success' : 'warning'}>{run.status}</Badge>
          <span className="font-mono text-xs text-slate-300 font-tabular font-medium px-2 py-1 rounded bg-[#141820] border border-slate-800">
            Costo: ${Number(run.actual_cost_usd).toFixed(4)} USD
          </span>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {results.length === 0 ? (
          <div className="p-8 text-center bg-[#141820] border border-slate-800 rounded text-slate-500 text-xs">
            No hay resultados registrados todavía para este run. La ejecución puede estar en proceso.
          </div>
        ) : (
          results.map((r, idx) => {
            const mention = mentions.find((m) => m.result_id === r.id);
            return (
              <div key={r.id} className="bg-[#141820] border border-slate-800 rounded p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 pb-2 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
                      {r.country_code}
                    </span>
                    <span className="text-xs font-semibold text-white">Consulta #{idx + 1}: {r.raw_prompt}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {mention?.niupack_mentioned ? (
                      <Badge variant="success" size="sm">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> NIUPACK Mencionada ({mention.position})
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">
                        <XCircle className="h-3 w-3 mr-1 text-slate-500" /> No mencionada
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Raw Response Text */}
                <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed bg-[#0c0f14] p-3 rounded border border-slate-800/80">
                  {r.raw_response}
                </div>

                {/* Sources & Citations */}
                {r.sources_json && r.sources_json.length > 0 && (
                  <div className="pt-2 text-[11px] space-y-1">
                    <span className="font-medium text-slate-400 block">Fuentes citadas por OpenAI:</span>
                    <div className="flex flex-wrap gap-2">
                      {r.sources_json.map((s, sidx) => (
                        <a
                          key={sidx}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#10141b] border border-slate-800 text-slate-400 hover:text-brand-400 transition-colors"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          <span className="truncate max-w-[200px]">{s.title || s.url}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Execution Metadata Footer */}
                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500 font-tabular">
                  <span>Tokens: {r.total_tokens} (In: {r.tokens_input}, Out: {r.tokens_output})</span>
                  <span>Latencia: {r.latency_ms} ms</span>
                  <span>Costo: ${r.cost_usd.toFixed(5)} USD</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
