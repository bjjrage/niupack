// AI Router V1: determinista por defecto, OpenAI opcional para refinar extracción.
// Nunca tumba el CRM: si OpenAI falla/no está configurado, usa extractor local + templates.

import { OpenAIService } from '@/lib/openai/openai-service';
import type { CrmIntent, Qualification } from '@/lib/crm/types';
import { extractCommercial } from '../qualification/extractor';
import { missingFields, qualify } from '../qualification/rules';
import { templateReply } from './prompts';
import type { BotContext, BotLanguage, BotTurnResult, ExtractedCommercial } from '../types';

function decideHandoff(intent: CrmIntent, text: string): boolean {
  if (intent === 'HUMAN_REQUEST') return true;
  return /humano|humana|asesor|atendente humano|quiero hablar con alguien/i.test(text);
}

export async function runBotTurn(input: { text: string; context: BotContext }): Promise<BotTurnResult> {
  const { text, context } = input;
  let extracted: ExtractedCommercial = extractCommercial(text);

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
        // Merge conservador: solo completa nulos, nunca inventa por sobre lo determinista salvo volumen/ciudad claros.
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

  // Recalificar con reglas (autoridad local, no ML).
  const qualification: Qualification = qualify(extracted);
  extracted.qualification = qualification;
  const intent: CrmIntent = extracted.intent ?? 'OTHER';
  const language: BotLanguage = extracted.language ?? 'es';
  const missing = missingFields(extracted);
  const shouldRequestHandoff = decideHandoff(intent, text);
  // Crear oportunidad cuando hay señal comercial mínima (MEDIUM+) y no es solo saludo.
  const shouldCreateOpportunity = (qualification === 'HIGH' || (qualification === 'MEDIUM' && intent === 'RFQ')) && !shouldRequestHandoff;
  const reply = shouldRequestHandoff
    ? templateReply(language, 'HUMAN_REQUEST', [])
    : templateReply(language, intent, missing);

  return {
    reply,
    language,
    extracted,
    intent,
    qualification,
    shouldRequestHandoff,
    shouldCreateOpportunity,
    confidence: qualification === 'HIGH' ? 'HIGH' : qualification === 'MEDIUM' ? 'MEDIUM' : 'LOW',
  };
}
