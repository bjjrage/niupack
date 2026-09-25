'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, ShieldCheck, ArrowRight, DollarSign, Clock, FileText, Check, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SupplierQuote } from '@/types';
import { QuoteCostMatcherModal } from '@/components/rfq/QuoteCostMatcherModal';

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<SupplierQuote[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [isMatcherOpen, setIsMatcherOpen] = useState<boolean>(false);

  useEffect(() => {
    fetchQuotes();
  }, []);

  const fetchQuotes = async () => {
    try {
      const res = await fetch('/api/rfq/quotes');
      if (res.ok) {
        const data = await res.json();
        setQuotes(data.quotes || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptQuote = async (id: string) => {
    setIsProcessing(id);
    try {
      const res = await fetch(`/api/rfq/quotes/${id}/accept`, { method: 'POST' });
      if (res.ok) {
        setFeedback('Cotización formal aceptada e incorporada exitosamente al benchmarking de Market Intelligence.');
        fetchQuotes();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Módulo 4</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Quote Extraction</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Cotizaciones Extraídas & Aprobación Humana
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Revisión técnica de condiciones extraídas desde correos de proveedores e incorporación directa a Market Intelligence.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsMatcherOpen(true)}
            className="flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            <span>Quote-to-Cost Matcher</span>
          </Button>

          <Link href="/market/prices">
            <Button variant="secondary" size="sm">
              Ver Observaciones de Mercado
            </Button>
          </Link>
        </div>
      </div>

      <QuoteCostMatcherModal
        isOpen={isMatcherOpen}
        onClose={() => setIsMatcherOpen(false)}
        onMatchSaved={(match) => {
          setFeedback(`✓ Cotización de ${match.external_quote.supplier_name} emparejada con ${match.matched_sku} ($${match.niupack_factory_unit_cost_usd.toFixed(5)} USD/u)`);
          setTimeout(() => setFeedback(null), 5000);
        }}
      />

      {feedback && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Protocol Banner */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded flex items-start gap-3 text-xs text-slate-300">
        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white">Protocolo de Incorporación a Market Intelligence:</strong> Cada propuesta comercial extraída por AI debe ser validada por un analista. Al presionar <em>&quot;Aceptar en Market Intelligence&quot;</em>, se genera automáticamente un registro con nivel de confianza de 95% (Cotización Formal), impactando el benchmark del país y SKU correspondiente.
        </div>
      </div>

      {/* Quotes Cards List */}
      <div className="space-y-4">
        {quotes.length === 0 ? (
          <div className="p-8 text-center bg-[#141820] border border-slate-800 rounded text-slate-500 text-xs">
            No hay cotizaciones pendientes de revisión. Sincroniza la bandeja de correo en el módulo de Inbox.
          </div>
        ) : (
          quotes.map((q) => {
            const item = q.items?.[0] || {
              sku: 'CUP-12OZ-SW',
              quantity: 300000,
              unit_price: 0.0495,
              normalized_unit_price_usd: 0.0495,
            };
            return (
              <div key={q.id} className="bg-[#141820] border border-slate-800 rounded p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white tracking-tight">{q.supplier_name}</h3>
                      <Badge
                        variant={q.status === 'ACCEPTED' ? 'success' : 'warning'}
                        size="sm"
                      >
                        {q.status === 'ACCEPTED' ? '✓ ACEPTADA EN MARKET INTEL' : 'REVISIÓN PENDIENTE'}
                      </Badge>
                    </div>
                    <span className="text-xs text-slate-400 font-mono mt-0.5 block">
                      Ref: {q.quote_reference || 'Cotización formal recibida vía correo'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block font-mono">Precio Unitario Normalizado:</span>
                    <span className="text-xl font-bold text-emerald-400 font-mono font-tabular">
                      ${Number(item.normalized_unit_price_usd).toFixed(4)} USD
                    </span>
                  </div>
                </div>

                {/* Raw email snippet */}
                {q.raw_quote_text && (
                  <div className="bg-[#0c0f14] p-3 rounded border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-line leading-relaxed">
                    <strong className="text-slate-500 text-[10px] block uppercase mb-1">Texto Original de la Propuesta:</strong>
                    {q.raw_quote_text}
                  </div>
                )}

                {/* Commercial Conditions Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[11px] block">SKU / Formato:</span>
                    <span className="text-white font-medium">{item.sku}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Cantidad:</span>
                    <span className="text-slate-200 font-tabular">{item.quantity.toLocaleString()} u</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Precio Original:</span>
                    <span className="text-slate-200 font-tabular">
                      {q.currency} {item.unit_price} / u
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Incoterm:</span>
                    <span className="text-slate-200">{q.incoterm || 'FOB'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Lead Time:</span>
                    <span className="text-slate-200">{q.lead_time_days || 25} días</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[11px] block">Confianza AI:</span>
                    <span className="text-emerald-400 font-bold">{Math.round(q.confidence_score * 100)}%</span>
                  </div>
                </div>

                {/* Action button */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {q.operator_notes || 'Extracción estructurada validada.'}
                  </span>

                  {q.status !== 'ACCEPTED' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={isProcessing === q.id}
                      onClick={() => handleAcceptQuote(q.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Aceptar en Market Intelligence (95% Confianza)
                    </Button>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 font-mono">
                      <Check className="h-4 w-4" /> Incorporada al benchmark regional
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
