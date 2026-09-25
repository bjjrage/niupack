'use client';

import React, { useState } from 'react';
import { Printer, FileText, Download, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<
    'visibility' | 'benchmark' | 'cost' | 'rfq' | 'strategy'
  >('strategy');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header (Hidden in Print) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-brand-400 font-semibold uppercase">Reportes Ejecutivos</span>
            <span className="text-slate-600 text-xs">/</span>
            <span className="text-xs text-slate-400">Dirección & Auditoría</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-1">
            Informes Imprimibles del Sistema Operativo
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Páginas formateadas listas para impresión en papel o guardado en PDF para comités ejecutivos y directores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" size="md" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir / Guardar PDF
          </Button>
        </div>
      </div>

      {/* Report Template Selector (Hidden in Print) */}
      <div className="no-print bg-[#141820] border border-slate-800 rounded p-4 flex flex-wrap gap-2">
        {[
          { id: 'strategy', label: 'Estrategia de Entrada a Mercados (Síntesis)' },
          { id: 'visibility', label: 'Reporte de Visibilidad AI (ChatGPT)' },
          { id: 'benchmark', label: 'Reporte de Benchmarking de Precios' },
          { id: 'cost', label: 'Informe de Competitividad de Costo Industrial' },
          { id: 'rfq', label: 'Reporte de Inteligencia de Adquisición RFQ' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedReport(tab.id as any)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
              selectedReport === tab.id
                ? 'bg-brand-500 text-white border-brand-500 font-semibold'
                : 'bg-[#10141b] text-slate-400 border-slate-800 hover:bg-slate-800 text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Printable Document Container */}
      <div className="printable-card bg-white text-slate-900 p-8 rounded shadow-lg border border-slate-300 min-h-[800px] space-y-6">
        {/* Document Header */}
        <div className="flex items-start justify-between pb-4 border-b-2 border-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-wider text-red-600">NIUPACK</span>
              <span className="text-slate-400 text-xs">|</span>
              <span className="text-xs font-semibold text-slate-700">GARDINER S.A.</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950 mt-1 uppercase">
              {selectedReport === 'strategy' && 'Informe Ejecutivo: Estrategia de Entrada Regional por País y SKU'}
              {selectedReport === 'visibility' && 'Informe de Visibilidad Comercial en Inteligencia Artificial (OpenAI)'}
              {selectedReport === 'benchmark' && 'Informe de Precios de Mercado y Benchmarking Regional (Mercosur)'}
              {selectedReport === 'cost' && 'Informe Industrial de Costeo Real y Estructura FSSC 22000'}
              {selectedReport === 'rfq' && 'Informe de Adquisición de Inteligencia Comercial y Cotizaciones RFQ'}
            </h2>
            <span className="text-xs text-slate-500 block font-mono mt-0.5">
              Generado automáticamente por NIU Intelligence OS · Fecha: {new Date().toLocaleDateString('es')}
            </span>
          </div>

          <div className="text-right text-xs font-mono">
            <span className="font-bold text-slate-800 block">CONFIDENCIAL INTERNO</span>
            <span className="text-slate-500">Planta Asunción, Paraguay</span>
            <span className="text-slate-500 block">Certificación FSSC 22000 SGS</span>
          </div>
        </div>

        {/* Report Content Body */}
        {selectedReport === 'strategy' && (
          <div className="space-y-6 text-xs text-slate-800 leading-relaxed">
            <div>
              <h3 className="font-bold text-sm text-slate-950 border-b border-slate-300 pb-1 mb-2">
                1. RESUMEN EJECUTIVO Y RESPUESTAS A LAS 5 PREGUNTAS DEL OS
              </h3>
              <p>
                Este documento consolida la posición comercial y tecnológica de NIUPACK en los mercados de Brasil, Argentina y Bolivia para la línea de vasos de polipapel y termoformados.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <strong className="text-slate-950 block">1. Visibilidad en ChatGPT:</strong>
                  Crecimiento del 8.4% (Día 1) al 22.7% (Día 30) en Brasil; 31.4% en Bolivia; 88.0% en Paraguay (Control).
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <strong className="text-slate-950 block">2. Precios Reales de Mercado:</strong>
                  Brasil: USD 0.0495/u (Copobras). Argentina: USD 0.0588/u (Pack Solutions). Bolivia: USD 0.0630/u.
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <strong className="text-slate-950 block">3. Costo Real de Producción (12 oz):</strong>
                  USD 0.0468/u en planta Asunción (lote base 300.000 u). Merma actual: 7.6% (USD 0.0036/u).
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <strong className="text-slate-950 block">4. Precios Competitivos & Rentabilidad:</strong>
                  Argentina: USD 0.0545 (16% margen). Bolivia: USD 0.0550 (18% margen). Brasil: USD 0.0500 con merma reducida.
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-sm text-slate-950 border-b border-slate-300 pb-1 mb-2">
                2. SÍNTESIS DE ESTRATEGIA POR MERCADO OBJETIVO
              </h3>
              <table className="w-full text-left text-xs border border-slate-300">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="p-2 border-b border-slate-300">Mercado</th>
                    <th className="p-2 border-b border-slate-300 text-right">Benchmark Mercado</th>
                    <th className="p-2 border-b border-slate-300 text-right">Costo NIUPACK</th>
                    <th className="p-2 border-b border-slate-300 text-right">Precio Sugerido</th>
                    <th className="p-2 border-b border-slate-300">Estrategia Recomendada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  <tr>
                    <td className="p-2 font-bold font-sans">Brasil (SP)</td>
                    <td className="p-2 text-right">$0.0495</td>
                    <td className="p-2 text-right">$0.0468</td>
                    <td className="p-2 text-right font-bold text-slate-950">$0.0500</td>
                    <td className="p-2 font-sans text-slate-600">Reducción de merma a 5% + lote 500k para igualar a Copobras.</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold font-sans">Argentina (BA)</td>
                    <td className="p-2 text-right">$0.0588</td>
                    <td className="p-2 text-right">$0.0468</td>
                    <td className="p-2 text-right font-bold text-slate-950">$0.0545</td>
                    <td className="p-2 font-sans text-slate-600">Ventaja competitiva directa con arancel cero Mercosur.</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-bold font-sans">Bolivia (SC)</td>
                    <td className="p-2 text-right">$0.0630</td>
                    <td className="p-2 text-right">$0.0468</td>
                    <td className="p-2 text-right font-bold text-slate-950">$0.0550</td>
                    <td className="p-2 font-sans text-slate-600">Penetración agresiva con 18% margen bruto garantizado.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="font-bold text-sm text-slate-950 border-b border-slate-300 pb-1 mb-2">
                3. ACCIONES OPERATIVAS INMEDIATAS
              </h3>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
                <li><strong>Planta Industrial:</strong> Calibración de formadora ultrasónica para bajar merma de 7.6% a 5.0% (Ahorro anual: USD 24.000).</li>
                <li><strong>Comercial Bolivia:</strong> Emitir propuesta formal a cadenas de Santa Cruz con precio USD 0.0550 FOB Asunción.</li>
                <li><strong>Presencia Digital:</strong> Publicar sitemap multilingüe en portugués con directivas explícitas para OAI-SearchBot.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Footer for Print */}
        <div className="pt-6 border-t border-slate-300 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>NIU INTELLIGENCE OS · GARDINER S.A.</span>
          <span>DOCUMENTO OFICIAL AUDITABLE · PÁGINA 1 DE 1</span>
        </div>
      </div>
    </div>
  );
}
