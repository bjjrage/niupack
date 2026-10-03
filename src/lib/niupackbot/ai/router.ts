// AI Router V1: determinista por defecto, OpenAI opcional para refinar la EXTRACCIÓN.
// El bot NO cotiza: decide entre presentar NIUPACK o derivar a un vendedor.
// Nunca tumba el CRM: si OpenAI falla/no está configurado, usa extractor local + templates.

import { OpenAIService } from '@/lib/openai/openai-service';
import type { CrmIntent, Qualification } from '@/lib/crm/types';
import { detectLanguageStrict, extractCommercial } from '../qualification/extractor';
import { qualify } from '../qualification/rules';
import { normalizePhone } from '../outreach/phone';
import { templateReply, type ReplyKind } from './prompts';
import type { BotContext, BotLanguage, BotTurnResult, ExtractedCommercial } from '../types';

function norm(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** El cliente pidió explícitamente una persona. */
const HUMAN_RE = /humano|humana|asesor|vendedor|atendente|representante|quiero hablar con|quero falar com|hablar con alguien|falar com alguem|llamenme|me llamen|ligue pra mim|me liguem/;
/** Precio, cotización, pedido o compra: lo resuelve un vendedor, nunca el bot. */
const COMMERCIAL_RE = /precio|preco|cotiz|cotacao|presupuesto|orcamento|comprar|quiero (hacer )?(un )?pedido|quero (fazer )?(um )?pedido|hacer un pedido|fazer um pedido|hacer una compra|fazer uma compra/;
/** "¿Cuánto cuesta/sale…?": es precio salvo que hable de flete/logística. */
const HOW_MUCH_RE = /cuanto (cuesta|sale|vale)|quanto (custa|sai)/;
const LOGISTICS_RE = /flete|frete|logistica|transporte|envio|despacho/;
/** Negociación / condiciones comerciales / reclamos: siempre a humano. */
const SENSITIVE_RE = /descuento|desconto|negociar|negociacao|condicion|condicoes|plazo de pago|prazo de pagamento|financi|reclamo|reclamacao|queja|problema con|problema com|devolucion|devolucao|factura|nota fiscal/;
/** Llamada comercial / avanzar: señal de oportunidad. */
const ADVANCE_RE = /llamada|llamen|ligacao|ligar|reunion|reuniao|visita|avanzar|avancar|cerrar|fechar|empezar|comecar/;

export interface TurnDecision {
  kind: ReplyKind;
  handoff: boolean;
  /** Señal comercial concreta: cotización, compra, muestra comercial, llamada, RFQ real. */
  opportunity: boolean;
}

/**
 * Decide qué hace el bot con el mensaje. Responder NO crea oportunidad: hace falta una señal
 * comercial concreta (no alcanza con que la calificación sea MEDIUM/HIGH).
 */
export function decideTurn(input: { text: string; intent: CrmIntent; extracted: ExtractedCommercial; turnCount: number }): TurnDecision {
  const t = norm(input.text);
  const { intent, extracted } = input;

  const wantsHuman = intent === 'HUMAN_REQUEST' || HUMAN_RE.test(t);
  const logistics = LOGISTICS_RE.test(t);
  const commercialWords = COMMERCIAL_RE.test(t) || (HOW_MUCH_RE.test(t) && !logistics) || (intent === 'PRICE_REQUEST' && !logistics);
  const sample = intent === 'SAMPLE_REQUEST';
  const advance = ADVANCE_RE.test(t);
  // RFQ real = pide cotización/compra explícita, o describe necesidad con volumen concreto.
  const rfqReal = commercialWords || (intent === 'RFQ' && Boolean(extracted.estimated_volume));
  const opportunity = rfqReal || sample || (advance && (Boolean(extracted.product_interest) || commercialWords));

  if (opportunity) return { kind: 'HANDOFF_COMMERCIAL', handoff: true, opportunity: true };
  if (wantsHuman) return { kind: 'HANDOFF_HUMAN', handoff: true, opportunity: false };
  if (SENSITIVE_RE.test(t) || logistics || intent === 'LOGISTICS_REQUEST' || intent === 'FOLLOW_UP' || intent === 'SPEC_REQUEST') {
    return { kind: 'HANDOFF_INFO', handoff: true, opportunity: false };
  }
  // Sin respuesta confiable después de dos vueltas: no seguimos adivinando.
  if (intent === 'OTHER' && input.turnCount >= 2) return { kind: 'HANDOFF_INFO', handoff: true, opportunity: false };
  return { kind: 'PRESENT', handoff: false, opportunity: false };
}

export async function runBotTurn(input: { text: string; context: BotContext }): Promise<BotTurnResult> {
  const { text, context } = input;
  const extracted: ExtractedCommercial = extractCommercial(text);

  // Refinar con OpenAI solo si está configurado; fallo => fallback local.
  if (OpenAIService.isConfigured()) {
    try {
      const apiKey = OpenAIService.getApiKey();
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Extraé datos comerciales packaging a JSON. Campos: country, language (es|pt-BR), product_interest, capacity, material, printing, estimated_volume (número), volume_period (ONE_OFF|WEEKLY|MONTHLY|ANNUAL), destination_city, destination_country, intent (PRODUCT_INFO|SPEC_REQUEST|SAMPLE_REQUEST|RFQ|PRICE_REQUEST|LOGISTICS_REQUEST|FOLLOW_UP|HUMAN_REQUEST|OTHER), qualification (LOW|MEDIUM|HIGH). No inventes valores ausentes: usá null.' },
            { role: 'user', content: text.slice(0, 2000) },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(content) as Partial<ExtractedCommercial>;
        // Merge conservador: solo completa nulos, nunca pisa lo determinista.
        for (const [k, v] of Object.entries(parsed)) {
          if (v !== null && v !== undefined && (extracted as Record<string, unknown>)[k] == null) {
            (extracted as Record<string, unknown>)[k] = v;
          }
        }
      }
    } catch {
      // Fallback silencioso a extractor local.
    }
  }

  // La calificación queda como dato del lead; ya NO decide oportunidades.
  const qualification: Qualification = qualify(extracted);
  extracted.qualification = qualification;
  const intent: CrmIntent = extracted.intent ?? 'OTHER';
  // Idioma: señal del texto → idioma ya usado en la charla → país del número (+55 = PT-BR) → español.
  const fromNumber: BotLanguage = context.externalConversationId.replace(/[^0-9]/g, '').startsWith('55') ? 'pt-BR' : 'es';
  const language: BotLanguage = detectLanguageStrict(text) ?? (context.state.language === 'pt-BR' || context.state.language === 'es' ? context.state.language : fromNumber);
  extracted.language = language;
  // Sin ciudad de destino dicha por el cliente, el país es el de su número (no el del idioma: un paraguayo
  // que escribe en portugués sigue siendo PY, y uno que dice "Hola" no es BR por un empate de idioma).
  if (!extracted.destination_city) {
    const phone = normalizePhone(context.externalConversationId);
    const country = phone.ok ? phone.country : null;
    if (country) {
      extracted.country = country;
      extracted.destination_country = country;
    }
  }
  const decision = decideTurn({ text, intent, extracted, turnCount: context.state.turn_count });

  return {
    reply: templateReply(language, decision.kind),
    language,
    extracted,
    intent,
    qualification,
    shouldRequestHandoff: decision.handoff,
    shouldCreateOpportunity: decision.opportunity,
    confidence: qualification === 'HIGH' ? 'HIGH' : qualification === 'MEDIUM' ? 'MEDIUM' : 'LOW',
  };
}
