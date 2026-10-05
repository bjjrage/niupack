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
import { searchProducts, getProductSpec, type CatalogItem, type CatalogMatchStatus } from '../tools/catalog';

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
/** Ficha técnica formal / laudo / certificado: siempre a humano. */
const FORMAL_SPEC_RE = /ficha tecnica|ficha formal|datasheet|laudo|certificado/;
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
  if (SENSITIVE_RE.test(t) || logistics || intent === 'LOGISTICS_REQUEST' || intent === 'FOLLOW_UP' || FORMAL_SPEC_RE.test(t)) {
    return { kind: 'HANDOFF_INFO', handoff: true, opportunity: false };
  }
  // Sin respuesta confiable después de dos vueltas: no seguimos adivinando.
  if (intent === 'OTHER' && input.turnCount >= 2) return { kind: 'HANDOFF_INFO', handoff: true, opportunity: false };
  return { kind: 'PRESENT', handoff: false, opportunity: false };
}

function assertSafeBotReply(reply: string): string {
  // Prohibido exponer: true cost, costos industriales, formulas internas, precios, descuentos, moq, stock, lead time
  const forbidden = /\b(true cost|costo industrial|costos industriales|materia prima|margen|margenes|descuento|descuentos|moq\b|stock\b|lead time)\b/i;
  if (forbidden.test(reply)) {
    return 'Podemos brindarte esa información con un asesor comercial.';
  }
  return reply;
}

export async function runBotTurn(input: { text: string; context: BotContext }): Promise<BotTurnResult> {
  const { text, context } = input;
  const t = norm(text);
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

  // Búsqueda en el Maestro de Productos / SKU real
  const catalogLookup = await searchProducts(text, context.organizationId);
  let matchedCatalogItem: CatalogItem | null = null;
  let catalogMatch: CatalogMatchStatus | null = null;

  if (catalogLookup.status === 'OK' && catalogLookup.data) {
    catalogMatch = catalogLookup.data.match;
    if (catalogLookup.data.match === 'EXACT' && catalogLookup.data.items.length > 0) {
      matchedCatalogItem = catalogLookup.data.items[0];
      extracted.matched_sku = matchedCatalogItem.sku;
      extracted.catalog_match = 'EXACT';
    } else if (catalogLookup.data.match === 'MULTIPLE') {
      extracted.catalog_match = 'MULTIPLE';
    } else if (catalogLookup.data.match === 'NONE') {
      extracted.catalog_match = 'NONE';
    }
  }

  const decision = decideTurn({ text, intent, extracted, turnCount: context.state.turn_count });

  // Si requiere handoff (comercial, humano, logística, etc.): respetar reglas comerciales
  if (decision.handoff) {
    return {
      reply: assertSafeBotReply(templateReply(language, decision.kind)),
      language,
      extracted,
      intent,
      qualification,
      shouldRequestHandoff: decision.handoff,
      shouldCreateOpportunity: decision.opportunity,
      confidence: qualification === 'HIGH' ? 'HIGH' : qualification === 'MEDIUM' ? 'MEDIUM' : 'LOW',
      catalog: catalogMatch
        ? {
            match: catalogMatch,
            matched_sku: matchedCatalogItem?.sku ?? null,
            items: catalogLookup.data?.items,
          }
        : undefined,
    };
  }

  // Consultas de especificación (pared simple/doble, tapas compatibles, material)
  const isWallQuestion = /\b(doble pared|pared doble|pared simple|simple pared|parede dupla|parede simples)\b|\b(es doble pared|e parede dupla|es pared simple|e parede simples)\b/i.test(t);
  const isLidQuestion = /\b(tapa|tapas|tampa|tampas|lid|lids)\b.*\b(usa|lleva|compatible|tiene|qual|que)\b|\b(que|qual)\b.*\b(tapa|tampa|lid)\b|\b(tapa compatible|tampa compativel)\b/i.test(t);
  const isMaterialQuestion = /\b(de que material|que material|qual material|de que e feito|de que esta hecho)\b/i.test(t);

  if (isWallQuestion || isLidQuestion || isMaterialQuestion) {
    let specItem: CatalogItem | null = null;
    const contextSku = (context.state.extracted?.matched_sku as string) || null;
    if (contextSku) {
      const specLookup = await getProductSpec(contextSku, context.organizationId);
      if (specLookup.status === 'OK' && specLookup.data) {
        specItem = specLookup.data;
      }
    }
    if (!specItem) {
      specItem = matchedCatalogItem;
    }
    if (!specItem && context.recentMessages.length > 0) {
      for (const msg of context.recentMessages.slice(-5)) {
        const msgLookup = await searchProducts(msg.body, context.organizationId);
        if (msgLookup.status === 'OK' && msgLookup.data?.items.length) {
          specItem = msgLookup.data.items[0];
          break;
        }
      }
    }

    if (specItem) {
      let specReply = '';
      if (isWallQuestion) {
        const isDouble = specItem.wallType === 'double';
        specReply = language === 'pt-BR'
          ? (isDouble ? `Sim, o ${specItem.productName} (${specItem.sku}) é de parede dupla.` : `O ${specItem.productName} (${specItem.sku}) é de parede simples.`)
          : (isDouble ? `Sí, el ${specItem.productName} (${specItem.sku}) es de doble pared.` : `El ${specItem.productName} (${specItem.sku}) es de pared simple.`);
      } else if (isLidQuestion) {
        specReply = language === 'pt-BR'
          ? (specItem.compatibleLids ? `Utiliza a tampa compatível ${specItem.compatibleLids}.` : 'Não consta tampa compatível no catálogo vigente. Se precisar, posso te encaminhar a um consultor.')
          : (specItem.compatibleLids ? `Usa la tapa compatible ${specItem.compatibleLids}.` : 'No figura una tapa compatible en el catálogo vigente. Si necesitás, puedo derivarte con un asesor.');
      } else if (isMaterialQuestion) {
        const mat = specItem.material || (language === 'pt-BR' ? 'papel grau alimentício' : 'polipapel grado alimenticio');
        specReply = language === 'pt-BR' ? `O material é ${mat}.` : `El material es ${mat}.`;
      }
      return {
        reply: assertSafeBotReply(specReply),
        language,
        extracted: { ...extracted, matched_sku: specItem.sku, catalog_match: 'EXACT' },
        intent: 'SPEC_REQUEST',
        qualification,
        shouldRequestHandoff: false,
        shouldCreateOpportunity: false,
        confidence: 'HIGH',
        catalog: { match: 'EXACT', matched_sku: specItem.sku, items: [specItem] },
      };
    }
  }

  // Presentación general ("¿qué productos tienen?")
  const isGeneralPresentation =
    /^(hola|buenas|ola|olá|bom dia|boa tarde)?\s*,?\s*¿?\s*(que productos tienen|quais produtos voces tem|quais produtos vocês têm|que tienen|que fabrican|cuales son sus productos|info|informacion)\??$/i.test(t.trim());

  if (isGeneralPresentation) {
    return {
      reply: assertSafeBotReply(templateReply(language, 'PRESENT')),
      language,
      extracted,
      intent: 'PRODUCT_INFO',
      qualification,
      shouldRequestHandoff: false,
      shouldCreateOpportunity: false,
      confidence: 'MEDIUM',
    };
  }

  // Consultas de catálogo / disponibilidad
  const isCatalogQuery =
    /\b(tienen|tenes|hay|venden|trabajan|tem|voces tem|fabrican|producen|catalogo|medidas|tamanos|tamanhos|opciones|opcoes)\b/i.test(t) ||
    /\b(vaso|vasos|copo|copos|pote|potes|bowl|bowls|tapa|tapas|tampa|tampas|bandeja|bandejas)\b/i.test(t) ||
    /\d+\s*(oz|ml)\b/i.test(t) ||
    Boolean(extracted.product_interest || extracted.capacity) ||
    catalogMatch != null;

  if (isCatalogQuery) {
    if (catalogLookup.status !== 'OK') {
      const failSafeReply = language === 'pt-BR'
        ? 'No momento não consigo consultar o catálogo atualizado. Se quiser, posso te conectar com um consultor comercial.'
        : 'En este momento no puedo consultar el catálogo actualizado. Si querés, puedo derivarte con un asesor comercial.';
      return {
        reply: assertSafeBotReply(failSafeReply),
        language,
        extracted,
        intent: 'PRODUCT_INFO',
        qualification,
        shouldRequestHandoff: false,
        shouldCreateOpportunity: false,
        confidence: 'LOW',
      };
    }

    if (catalogMatch === 'EXACT' && matchedCatalogItem) {
      const item = matchedCatalogItem;
      const sizeOzStr = item.sizeOz ? `${item.sizeOz} oz` : '';
      const sizeMlStr = item.sizeMl ? `${item.sizeMl} ml` : '';
      const sizeStr = [sizeOzStr, sizeMlStr ? `(${sizeMlStr})` : ''].filter(Boolean).join(' ');
      const wallStr = language === 'pt-BR'
        ? (item.wallType === 'double' ? 'dupla' : 'simples')
        : (item.wallType === 'double' ? 'doble' : 'simple');
      const reply = language === 'pt-BR'
        ? `Sim, temos ${item.productName}${sizeStr ? ` de ${sizeStr}` : ''} em parede ${wallStr}. De qual quantidade você precisa?`
        : `Sí, tenemos ${item.productName}${sizeStr ? ` de ${sizeStr}` : ''} en pared ${wallStr}. ¿Qué cantidad o formato estás necesitando?`;
      return {
        reply: assertSafeBotReply(reply),
        language,
        extracted: { ...extracted, matched_sku: item.sku, catalog_match: 'EXACT' },
        intent: 'PRODUCT_INFO',
        qualification,
        shouldRequestHandoff: false,
        shouldCreateOpportunity: false,
        confidence: 'HIGH',
        catalog: { match: 'EXACT', matched_sku: item.sku, items: [item] },
      };
    }

    if (catalogMatch === 'MULTIPLE') {
      const reply = language === 'pt-BR'
        ? 'Sim. Temos várias opções. De qual capacidade você precisa?'
        : 'Sí. Tenemos varias opciones. ¿Qué capacidad necesitás?';
      return {
        reply: assertSafeBotReply(reply),
        language,
        extracted: { ...extracted, catalog_match: 'MULTIPLE' },
        intent: 'PRODUCT_INFO',
        qualification,
        shouldRequestHandoff: false,
        shouldCreateOpportunity: false,
        confidence: 'MEDIUM',
        catalog: { match: 'MULTIPLE', items: catalogLookup.data?.items },
      };
    }

    if (catalogMatch === 'NONE') {
      const cap = extracted.capacity || (text.match(/(\d+(?:[.,]\d+)?)\s*oz/i) ? `${text.match(/(\d+(?:[.,]\d+)?)\s*oz/i)![1]} oz` : null);
      const reply = language === 'pt-BR'
        ? (cap
            ? `Não encontro ${cap} no catálogo vigente. Se precisar de uma medida especial, posso te encaminhar a um consultor.`
            : 'Não encontro esse produto no catálogo vigente. Se precisar de uma medida especial, posso te encaminhar a um consultor.')
        : (cap
            ? `No encuentro ${cap} en el catálogo vigente. Si necesitás una medida especial, puedo derivarte con un asesor.`
            : 'No veo ese producto en nuestro catálogo vigente. Si necesitás una medida especial, puedo derivarte con un asesor.');
      return {
        reply: assertSafeBotReply(reply),
        language,
        extracted: { ...extracted, catalog_match: 'NONE' },
        intent: 'PRODUCT_INFO',
        qualification,
        shouldRequestHandoff: false,
        shouldCreateOpportunity: false,
        confidence: 'LOW',
        catalog: { match: 'NONE', items: [] },
      };
    }
  }

  return {
    reply: assertSafeBotReply(templateReply(language, decision.kind)),
    language,
    extracted,
    intent,
    qualification,
    shouldRequestHandoff: decision.handoff,
    shouldCreateOpportunity: decision.opportunity,
    confidence: qualification === 'HIGH' ? 'HIGH' : qualification === 'MEDIUM' ? 'MEDIUM' : 'LOW',
    catalog: catalogMatch
      ? {
          match: catalogMatch,
          matched_sku: matchedCatalogItem?.sku ?? null,
          items: catalogLookup.data?.items,
        }
      : undefined,
  };
}
