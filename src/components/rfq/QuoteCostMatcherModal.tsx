'use client';

import React, { useState } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  X,
  Sparkles,
  DollarSign,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { QuoteMatchResult } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onMatchSaved?: (match: QuoteMatchResult) => void;
}

export function QuoteCostMatcherModal({ isOpen, onClose, onMatchSaved }: Props) {
  const [rawText, setRawText] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('Copobras S.A.');
  const [country, setCountry] = useState<string>('BR');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteMatchResult | null>(null);

  if (!isOpen) return null;

  const handleRunMatcher = async () => {
    if (!rawText.trim()) {
      setError('Por favor pegá o ingresá el texto o datos de la cotización externa');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/market/quote-matcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_text: rawText,
          supplier_name: supplierName,
          country,
          source_type: 'MANUAL_TEXT',
        }),
      });

      const data = await res.json();
      if (res.ok && data.match) {
        setResult(data.match);
        if (onMatchSaved) {
          onMatchSaved(data.match);
        }
      } else {
        setError(data.error || 'No se pudo procesar la cotización');
      }
    } catch (err: any) {
      setError(err?.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const loadExampleQuote = (type: 'BR' | 'AR') => {
    if (type === 'BR') {
      setSupplierName('Copobras S.A.');
      setCountry('BR');
      setRawText(`Prezados,
Confirmamos cotação para o item Copo 12oz (350ml) Papel Cupstock:
- Preço unitário: R$ 0.28 BRL por unidade
- Condição: FOB Santos
- Quantidade: 300.000 unidades
- Prazo de entrega: 25 dias`);
    } else {
      setSupplierName('Pack Solutions');
      setCountry('AR');
      setRawText(`Estimada gente de NIUPACK,
Por medio de la presente cotizamos vaso descartable 8 oz polipapel pared simple:
- Precio: USD 0.048 por unidad
- Condición: CIF Buenos Aires
- Tirada: 200.000 unidades
- Pago: 30 días fecha factura`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#141820] border border-slate-800 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-4">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c0f14]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-brand-500/10 text-brand-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Quote-to-Cost Matcher</h2>
              <p className="text-[11px] text-slate-400">
                Emparejamiento automático de cotizaciones externas contra el costo unitario de NIUPACK
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Quick template load */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Cargar ejemplo de cotización de competidor:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => loadExampleQuote('BR')}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium"
              >
                Ejemplo Brasil (BRL / FOB)
              </button>
              <button
                type="button"
                onClick={() => loadExampleQuote('AR')}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium"
              >
                Ejemplo Argentina (USD / CIF)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Nombre del Proveedor / Competidor</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">País de Origen</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-[#0c0f14] border border-slate-700 rounded px-3 py-1.5 text-white"
              >
                <option value="BR">Brasil</option>
                <option value="AR">Argentina</option>
                <option value="BO">Bolivia</option>
                <option value="PY">Paraguay</option>
                <option value="CN">China</option>
              </select>
            </div>
          </div>

          {/* Textarea */}
          <div>
            <label className="block text-xs text-slate-300 font-medium mb-1">
              Texto de la Cotización (Email, PDF o Carga Manual)
            </label>
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Pegá aquí el correo, mensaje o especificación recibida del competidor..."
              className="w-full bg-[#0c0f14] border border-slate-700 rounded p-3 text-xs text-white font-mono focus:border-brand-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleRunMatcher}
              disabled={loading}
            >
              {loading ? 'Analizando Cotización...' : 'Procesar & Comparar contra NIUPACK'}
            </Button>
          </div>

          {/* Results Comparison Matrix */}
          {result && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Emparejamiento Exitoso con Catálogo</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={result.competitive_status === 'COMPETITIVE' ? 'success' : result.competitive_status === 'PARITY' ? 'neutral' : 'warning'}>
                    STATUS: {result.competitive_status}
                  </Badge>
                  <span className="text-xs font-mono text-slate-400">Score: {Math.round(result.sku_similarity_score * 100)}%</span>
                </div>
              </div>

              {/* Matched SKU Card */}
              <div className="bg-[#0c0f14] p-3.5 rounded-lg border border-slate-700 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">SKU NIUPACK Emparejado:</span>
                    <span className="text-sm font-bold text-white font-mono">{result.matched_sku}</span>
                    <span className="text-[11px] text-slate-400 ml-2">({result.matched_sku_name})</span>
                  </div>
                  <div className="flex gap-1.5 text-[10px]">
                    {result.size_match && <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">Tamaño OK</span>}
                    {result.material_match && <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">Material OK</span>}
                  </div>
                </div>

                {/* 3-Column Comparative Card */}
                <div className="grid grid-cols-3 gap-3 font-mono">
                  <div className="bg-[#141820] p-2.5 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-sans block">Precio Competidor ({result.external_quote.incoterm || 'FOB'}):</span>
                    <span className="text-base font-bold text-white block mt-0.5">
                      ${result.external_unit_price_usd.toFixed(5)} USD/u
                    </span>
                    <span className="text-[10px] text-slate-500 font-sans">
                      ({result.external_quote.quoted_unit_price} {result.external_quote.currency})
                    </span>
                  </div>

                  <div className="bg-[#141820] p-2.5 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-sans block">Costo Planta NIUPACK (EXW):</span>
                    <span className="text-base font-bold text-sky-400 block mt-0.5">
                      ${result.niupack_factory_unit_cost_usd.toFixed(5)} USD/u
                    </span>
                    <span className="text-[10px] text-amber-400 font-sans">
                      Gs. {result.niupack_factory_unit_cost_pyg.toLocaleString('es-PY')} /u
                    </span>
                  </div>

                  <div className="bg-[#141820] p-2.5 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-sans block">Margen Potencial a su Precio:</span>
                    <span className={`text-base font-bold block mt-0.5 ${result.margin_at_external_price_percent >= 15 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {result.margin_at_external_price_percent}%
                    </span>
                    <span className="text-[10px] text-slate-500 font-sans">
                      Brecha: {result.price_gap_percent > 0 ? `+${result.price_gap_percent}%` : `${result.price_gap_percent}%`}
                    </span>
                  </div>
                </div>

                {/* Incoterm comparability warning */}
                {result.comparable_warning && (
                  <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded text-[11px] text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                    <p>{result.comparable_warning}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
