import { describe, it, expect, beforeEach } from 'vitest';
import { searchProducts, getProductSpec } from '@/lib/niupackbot/tools/catalog';
import { runBotTurn } from '@/lib/niupackbot/ai/router';
import { niupackbotService } from '@/lib/niupackbot/service';
import { crmRepository, resetCrmMemory } from '@/lib/crm/repository';
import { resetBotMemory } from '@/lib/niupackbot/repository';
import type { BotContext } from '@/lib/niupackbot/types';

const ORG = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  resetCrmMemory();
  resetBotMemory();
});

function makeContext(
  org: string,
  state?: Record<string, unknown>,
  recentMessages?: Array<{ direction: 'INBOUND' | 'OUTBOUND'; author_role: 'CUSTOMER' | 'BOT'; body: string; occurred_at: string }>,
): BotContext {
  return {
    organizationId: org,
    conversationId: 'c-test-catalog',
    externalConversationId: 'whatsapp:+595981123456',
    controlMode: 'BOT',
    recentMessages: recentMessages ?? [],
    state: {
      bot_status: 'ACTIVE',
      turn_count: 0,
      extracted: state ?? {},
    },
    leadId: null,
  };
}

describe('NIUPACKBOT SKU Master Catalog Context', () => {
  // 1. "vaso 12 oz" → EXACT si existe
  it('1. "vaso 12 oz" -> EXACT si existe en catálogo', async () => {
    const res = await searchProducts('vaso 12 oz', ORG);
    expect(res.status).toBe('OK');
    expect(res.data?.match).toBe('EXACT');
    expect(res.data?.items[0].sku).toBe('CUP-12OZ-SW');
    expect(res.data?.items[0].sizeOz).toBe(12);
  });

  // 2. "vaso doble pared 12 oz" → respeta wall_type
  it('2. "vaso doble pared 12 oz" -> respeta wall_type', async () => {
    const res = await searchProducts('vaso doble pared 12 oz', ORG);
    expect(res.status).toBe('OK');
    expect(res.data?.match).toBe('EXACT');
    expect(res.data?.items[0].sku).toBe('CUP-12OZ-DW');
    expect(res.data?.items[0].wallType).toBe('double');
  });

  // 3. "vaso 14 oz" → NONE. No inventa SKU
  it('3. "vaso 14 oz" -> NONE. No inventa SKU ni sustituto', async () => {
    const res = await searchProducts('vaso 14 oz', ORG);
    expect(res.status).toBe('OK');
    expect(res.data?.match).toBe('NONE');
    expect(res.data?.items).toHaveLength(0);

    const turn = await runBotTurn({ text: '¿Tienen vaso de 14 oz?', context: makeContext(ORG) });
    expect(turn.catalog?.match).toBe('NONE');
    expect(turn.reply).toMatch(/no encuentro 14 oz|no veo/i);
    expect(turn.reply).not.toMatch(/CUP-14OZ/i);
    expect(turn.reply).not.toMatch(/\b(12 oz|16 oz)\b/i);
  });

  // 4. consulta genérica de familia → MULTIPLE
  it('4. consulta genérica de familia -> MULTIPLE', async () => {
    const res = await searchProducts('vasos para café', ORG);
    expect(res.status).toBe('OK');
    expect(res.data?.match).toBe('MULTIPLE');
    expect(res.data?.items.length).toBeGreaterThan(1);

    const turn = await runBotTurn({ text: '¿Tienen vasos para café?', context: makeContext(ORG) });
    expect(turn.catalog?.match).toBe('MULTIPLE');
    expect(turn.reply).toMatch(/varias opciones|qué capacidad/i);
  });

  // 5. "¿cuánto cuesta el vaso 12 oz?" → HANDOFF. No precio
  it('5. "¿cuánto cuesta el vaso 12 oz?" -> HANDOFF comercial sin exponer precio', async () => {
    const turn = await runBotTurn({ text: '¿Cuánto cuesta el vaso de 12 oz?', context: makeContext(ORG) });
    expect(turn.shouldRequestHandoff).toBe(true);
    expect(turn.shouldCreateOpportunity).toBe(true);
    expect(turn.catalog?.matched_sku).toBe('CUP-12OZ-SW');
    expect(turn.reply).not.toMatch(/\$\s?\d+|\b\d+\s?(usd|pyg|dolares|guaranies|reales)/i);
    expect(turn.reply).toMatch(/asesor comercial|propuesta/i);
  });

  // 6. "¿es doble pared?" con contexto/match confiable → responde atributo real
  it('6. "¿es doble pared?" con contexto confiable responde atributo real', async () => {
    const turnDW = await runBotTurn({
      text: '¿Es doble pared?',
      context: makeContext(ORG, { matched_sku: 'CUP-12OZ-DW' }),
    });
    expect(turnDW.reply).toMatch(/sí.*doble pared/i);

    const turnSW = await runBotTurn({
      text: '¿Es doble pared?',
      context: makeContext(ORG, { matched_sku: 'CUP-12OZ-SW' }),
    });
    expect(turnSW.reply).toMatch(/pared simple/i);
  });

  // 7. "¿qué tapa usa?" → solo responde compatible_lids real
  it('7. "¿qué tapa usa?" solo responde compatible_lids real', async () => {
    const turn = await runBotTurn({
      text: '¿Qué tapa usa?',
      context: makeContext(ORG, { matched_sku: 'CUP-12OZ-SW' }),
    });
    expect(turn.reply).toContain('LID-12OZ-PICO');
    expect(turn.reply).toMatch(/tapa compatible/i);
  });

  // 8. Campo prohibido aunque exista internamente → jamás se devuelve
  it('8. campos prohibidos (True Cost, costos, precios, stock, MOQ) jamás se devuelven', async () => {
    const queries = ['vaso 12 oz', 'vaso doble pared 12 oz', '¿es doble pared?', '¿qué tapa usa?', 'CUP-12OZ-SW'];
    for (const q of queries) {
      const turn = await runBotTurn({ text: q, context: makeContext(ORG, { matched_sku: 'CUP-12OZ-SW' }) });
      expect(turn.reply).not.toMatch(/\b(true cost|costo industrial|costos industriales|materia prima|margen|margenes|descuento|descuentos|moq\b|stock\b|lead time)\b/i);
      expect(turn.reply).not.toMatch(/\$\s?\d+/);
    }
  });

  // 9. tenant A → jamás devuelve productos tenant B
  it('9. tenant isolation: tenant A jamás devuelve productos de tenant B', async () => {
    const TENANT_A = ORG;
    const TENANT_B = '00000000-0000-0000-0000-00000000bb99';

    const resA = await searchProducts('vaso 12 oz', TENANT_A);
    const resB = await searchProducts('vaso 12 oz', TENANT_B);

    expect(resA.data?.match).toBe('EXACT');
    expect(resB.data?.match === 'NONE' || resB.status === 'UNAVAILABLE').toBe(true);
  });

  // 10. Si catálogo falla/no está configurado → fail-safe. No inventa catálogo
  it('10. fail-safe cuando catálogo no está disponible', async () => {
    const res = await searchProducts('vaso 12 oz', undefined);
    expect(res.status).toBe('UNAVAILABLE');

    const turn = await runBotTurn({ text: 'Tienen vaso 12 oz', context: makeContext('') });
    expect(turn.reply).toMatch(/no puedo consultar el catálogo|asesor comercial/i);
    expect(turn.reply).not.toMatch(/CUP-12OZ/i);
  });

  // 11. SKU conectado a oportunidad CRM en consulta comercial
  it('11. vincula SKU del catálogo a la oportunidad comercial en CRM', async () => {
    const res = await niupackbotService.handleInbound(ORG, {
      externalMessageId: 'MSG-CATALOG-01',
      from: '+595981123456',
      to: '+595900000001',
      body: 'Quiero cotización del vaso de 12 oz para 50.000 unidades por mes',
      profileName: 'Cliente Mayorista',
      raw: {},
    });

    expect(res.opportunityId).toBeTruthy();
    const opp = await crmRepository.getOpportunity(res.opportunityId!, ORG);
    expect(opp).toBeDefined();
    expect(opp?.sku).toBe('CUP-12OZ-SW');
  });
});
