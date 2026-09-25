'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useCopilot } from './CopilotContext';
import { X, Send, Sparkles, Check, ArrowRight, CornerDownLeft, RotateCcw } from 'lucide-react';
import { CopilotMessage, CopilotAction } from '@/types';

export const NiuCopilotDrawer: React.FC = () => {
  const { isOpen, closeDrawer, screenContext, executeAction } = useCopilot();
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [confirmedActionIds, setConfirmedActionIds] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Suggestions by module
  const getSuggestions = () => {
    const mod = screenContext.module;
    if (mod === 'cost') {
      return [
        '¿Qué variable está pesando más en este costo?',
        '¿Qué pasa si bajo la merma de 6,5% a 4%?',
        '¿Qué pasa si paso de 300.000 a 500.000 unidades?',
        'Buscar mayor oportunidad de ahorro',
        'Comparar contra benchmark de Brasil',
      ];
    }
    if (mod === 'pricing') {
      return [
        '¿Qué precio puedo ofrecer con 12% de margen?',
        'Comparame el escenario actual contra uno con flexo propia',
        '¿Cuánto debería bajar impresión para alcanzar a Brasil?',
        '¿Qué volumen mínimo justifica comprar una impresora?',
        '¿Qué tengo que modificar para llegar a USD 0,043/u?',
      ];
    }
    if (mod === 'rfq') {
      return [
        '¿Cómo se compara la cotización de Klabin contra el mercado?',
        '¿Qué proveedor ofrece mejores plazos de pago?',
        'Generar borrador de negociación para volumen anual',
      ];
    }
    if (mod === 'visibility') {
      return [
        '¿Por qué ChatGPT cita a competidores locales en Brasil?',
        '¿Qué fuentes clave alimentan las recomendaciones de IA?',
        'Recomendar 3 acciones para posicionar a NIUPACK',
      ];
    }
    return [
      '¿Cuál es la rentabilidad proyectada en Brasil?',
      '¿Qué variable de costo tiene mayor impacto hoy?',
      'Calcular precio con 12% de margen',
    ];
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    setInput('');
    setLoading(true);

    // Optimistic user message
    const tempUserMsg: CopilotMessage = {
      id: `temp-${Date.now()}`,
      thread_id: threadId || 'temp',
      role: 'user',
      content: query,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          screenContext,
          threadId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.threadId && !threadId) {
          setThreadId(data.threadId);
        }
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
      } else {
        // Fallback error message
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            thread_id: threadId || 'err',
            role: 'assistant',
            content: 'No se pudo conectar con el servicio. Verificá tu conexión o la clave de OpenAI.',
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          thread_id: threadId || 'err',
          role: 'assistant',
          content: 'Error de comunicación al procesar la respuesta.',
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (action: CopilotAction) => {
    setConfirmedActionIds((prev) => new Set(prev).add(action.id));
    executeAction(action);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex select-none">
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-over panel: Pure B2B SaaS palette (Graphite, Black, White, Niupack Red) */}
      <div className="relative w-full max-w-[440px] bg-[#0c0f14] border-l border-slate-800 shadow-2xl flex flex-col h-full z-10">
        {/* Header */}
        <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between bg-[#0a0d12]">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded bg-brand-500 flex items-center justify-center font-bold text-white text-xs tracking-wider">
              NIU
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-white tracking-wide">COPILOT</span>
                <span className="text-[9px] font-mono bg-slate-800 text-slate-300 px-1 py-0.2 rounded border border-slate-700">
                  REAL-TIME OS
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono">Asistente Analítico & Comercial</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setMessages([]);
                setThreadId(null);
              }}
              title="Nueva conversación"
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800/80 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={closeDrawer}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800/80 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Current Screen Context Capsule */}
        <div className="p-3 bg-[#10141b] border-b border-slate-800/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Contexto Actual de la Pantalla
            </span>
            <span className="text-[10px] font-mono text-slate-500 truncate max-w-[180px]">
              {screenContext.route}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
            <div className="bg-[#141820] p-1.5 rounded border border-slate-800/80">
              <span className="text-slate-500 block text-[9px]">SKU:</span>
              <span className="font-bold text-white truncate block">{screenContext.sku || 'CUP-12OZ-SW'}</span>
            </div>
            <div className="bg-[#141820] p-1.5 rounded border border-slate-800/80">
              <span className="text-slate-500 block text-[9px]">Mercado / Vol:</span>
              <span className="font-bold text-white block">
                {screenContext.market || 'BR'} · {((screenContext.volume || 300000) / 1000)}k
              </span>
            </div>
            <div className="bg-[#141820] p-1.5 rounded border border-slate-800/80">
              <span className="text-slate-500 block text-[9px]">Costo Real:</span>
              <span className="font-bold text-emerald-400 block font-tabular">
                ${(screenContext.unitCostUSD || 0.04609).toFixed(5)}
              </span>
            </div>
            <div className="bg-[#141820] p-1.5 rounded border border-slate-800/80">
              <span className="text-slate-500 block text-[9px]">Benchmark:</span>
              <span className="font-bold text-slate-300 block font-tabular">
                ${(screenContext.benchmarkUSD || 0.0490).toFixed(4)}
              </span>
            </div>
            <div className="bg-[#141820] p-1.5 rounded border border-slate-800/80 col-span-2 flex items-center justify-between px-2">
              <span className="text-slate-500 text-[9px]">Brecha Competitiva:</span>
              <span
                className={`font-bold font-tabular ${
                  (screenContext.gapPercent || -5.9) <= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {(screenContext.gapPercent || -5.9) > 0 ? '+' : ''}
                {(screenContext.gapPercent || -5.9).toFixed(1)}% vs mercado
              </span>
            </div>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-[#10141b] rounded-lg border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-white block mb-1">
                  NIU Copilot conectado al contexto de {screenContext.module.toUpperCase()}.
                </span>
                Tengo cargada la estructura real de costos, precios y parámetros productivos. Hacé una consulta analítica o seleccioná una sugerencia rápida:
              </div>

              {/* Suggestions */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block px-1">
                  Sugerencias Rápidas para esta Pantalla
                </span>
                <div className="space-y-1">
                  {getSuggestions().map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSend(sug)}
                      className="w-full text-left p-2 rounded bg-[#10141b] hover:bg-[#161c26] border border-slate-800/80 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition-colors flex items-center justify-between group"
                    >
                      <span className="truncate pr-2">{sug}</span>
                      <ArrowRight className="h-3 w-3 text-slate-600 group-hover:text-brand-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[92%] rounded-lg p-3 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-brand-950/80 border border-brand-800/60 text-white rounded-br-xs'
                      : 'bg-[#141820] border border-slate-800 text-slate-200 rounded-bl-xs'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

                  {/* Proposed Actions Block (Requires explicit user confirmation) */}
                  {msg.proposed_actions && msg.proposed_actions.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Acción Propuesta (Confirmación Requerida)
                      </span>
                      {msg.proposed_actions.map((act) => {
                        const isConfirmed = confirmedActionIds.has(act.id);
                        return (
                          <div
                            key={act.id}
                            className="p-2 bg-[#0c0f14] rounded border border-slate-700 flex items-center justify-between gap-2"
                          >
                            <span className="text-[11px] text-white font-medium truncate">
                              {act.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleConfirmAction(act)}
                              disabled={isConfirmed}
                              className={`px-2.5 py-1 text-[10px] font-bold rounded flex items-center gap-1 transition-colors shrink-0 ${
                                isConfirmed
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 cursor-default'
                                  : 'bg-brand-500 hover:bg-brand-600 text-white shadow-xs'
                              }`}
                            >
                              {isConfirmed ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  <span>Aplicado</span>
                                </>
                              ) : (
                                <span>Confirmar</span>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <span className="text-[9px] font-mono text-slate-600 mt-1 px-1">
                  {msg.role === 'user' ? 'Vos' : 'NIU Copilot'} ·{' '}
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2 p-3 bg-[#141820] border border-slate-800 rounded-lg text-xs text-slate-400 max-w-[80%]">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-500 animate-ping" />
              <span>Calculando análisis sobre datos del OS...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-800 bg-[#0a0d12]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Preguntale a NIU Copilot sobre este costo..."
              className="flex-1 bg-[#141820] border border-slate-700 focus:border-brand-500 rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-3 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded text-xs font-bold transition-colors flex items-center justify-center shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
          <span className="text-[9px] text-slate-500 font-mono mt-1.5 block text-center">
            Respuestas estrictamente numéricas basadas en datos reales de NIUPACK.
          </span>
        </div>
      </div>
    </div>
  );
};
