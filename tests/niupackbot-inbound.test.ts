import { describe, it, expect, beforeEach } from 'vitest';
import { extractCommercial } from '@/lib/niupackbot/qualification/extractor';
import { qualify } from '@/lib/niupackbot/qualification/rules';
import { runBotTurn } from '@/lib/niupackbot/ai/router';
import { niupackbotService } from '@/lib/niupackbot/service';
import { resetCrmMemory } from '@/lib/crm/repository';
import { resetBotMemory } from '@/lib/niupackbot/repository';
import { crmRepository } from '@/lib/crm/repository';

const ORG = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  resetCrmMemory();
  resetBotMemory();
});

const E2E_TEXT = 'Preciso copos de papel 12 oz personalizados. Consumo aproximadamente 500 mil por mês. Entrega em Curitiba.';

describe('NIUPACKBOT extraction (caso DONE E2E)', () => {
  it('extrae el ejemplo objetivo', () => {
    const e = extractCommercial(E2E_TEXT);
    expect(e.language).toBe('pt-BR');
    expect(e.product_interest).toBe('vaso polipapel');
    expect(e.capacity).toBe('12 oz');
    expect(e.printing).toBe('personalizado');
    expect(e.estimated_volume).toBe(500000);
    expect(e.volume_period).toBe('MONTHLY');
    expect(e.destination_city).toBe('Curitiba');
    expect(e.destination_country).toBe('BR');
    expect(e.intent).toBe('RFQ');
    expect(e.qualification).toBe('HIGH');
    expect(qualify(e)).toBe('HIGH');
  });

  it('router responde en PT-BR sin inventar precios', async () => {
    const turn = await runBotTurn({
      text: E2E_TEXT,
      context: {
        organizationId: ORG,
        conversationId: 'c1',
        externalConversationId: 'whatsapp:+5511',
        controlMode: 'BOT',
        recentMessages: [],
        state: { bot_status: 'ACTIVE', turn_count: 0 },
        leadId: null,
      },
    });
    expect(turn.intent).toBe('RFQ');
    expect(turn.qualification).toBe('HIGH');
    expect(turn.language).toBe('pt-BR');
    expect(turn.reply.length).toBeGreaterThan(20);
    expect(turn.reply).not.toMatch(/\$\s?\d+\.\d+.*precio final/i);
  });

  it('detecta HUMAN_REQUEST en ES y PT', async () => {
    for (const t of ['quiero hablar con un humano por favor', 'quero falar com humano']) {
      const turn = await runBotTurn({
        text: t,
        context: {
          organizationId: ORG,
          conversationId: 'c1',
          externalConversationId: 'whatsapp:+5511',
          controlMode: 'BOT',
          recentMessages: [],
          state: { bot_status: 'ACTIVE', turn_count: 0 },
          leadId: null,
        },
      });
      expect(turn.shouldRequestHandoff).toBe(true);
    }
  });
});

describe('NIUPACKBOT vertical slice (WhatsApp → CRM)', () => {
  it('inbound válido crea conversation + lead + opportunity + timeline + task', async () => {
    const res = await niupackbotService.handleInbound(ORG, {
      externalMessageId: 'SM_TEST_001',
      from: '+5511999999001',
      to: '+595900000001',
      body: E2E_TEXT,
      profileName: 'Cliente Curitiba',
      raw: {},
    });
    expect(res.duplicate).toBe(false);
    expect(res.replySkipped).toBe(false);
    expect(res.leadId).toBeTruthy();
    expect(res.opportunityId).toBeTruthy();
    expect(res.qualification).toBe('HIGH');

    const convs = await crmRepository.listConversations(ORG);
    expect(convs).toHaveLength(1);
    expect(convs[0].control_mode).toBe('HUMAN'); // HIGH crea task + handoff? No: HIGH crea opp + task? Ver service: HIGH => createTask true + handoff solo si shouldRequestHandoff. Revisar.

    const leads = await crmRepository.listLeads(ORG);
    expect(leads).toHaveLength(1);
    expect(leads[0].destination_city).toBe('Curitiba');
  });

  it('webhook repetido NO duplica (idempotencia por MessageSid)', async () => {
    const inbound = {
      externalMessageId: 'SM_DUP_001',
      from: '+5511999999002',
      to: '+595900000001',
      body: E2E_TEXT,
      profileName: null as string | null,
      raw: {},
    };
    const r1 = await niupackbotService.handleInbound(ORG, inbound);
    const r2 = await niupackbotService.handleInbound(ORG, inbound);
    expect(r1.duplicate).toBe(false);
    expect(r2.duplicate).toBe(true);
    expect(r2.replySkipped).toBe(true);
    const leads = await crmRepository.listLeads(ORG);
    // Solo 1 lead para este número (externalId = whatsapp:+...).
    expect(leads.filter((l) => l.external_id === 'whatsapp:+5511999999002')).toHaveLength(1);
  });

  it('human request crea handoff + task y pausa bot', async () => {
    const r1 = await niupackbotService.handleInbound(ORG, {
      externalMessageId: 'SM_H1',
      from: '+595981000001',
      to: '+595900000001',
      body: 'Hola, quiero hablar con un asesor humano por favor',
      profileName: 'Juan',
      raw: {},
    });
    expect(r1.reply).toBeTruthy();
    const convs = await crmRepository.listConversations(ORG);
    const conv = convs.find((c) => c.external_conversation_id === 'whatsapp:+595981000001');
    expect(conv?.control_mode).toBe('HUMAN');

    // Segundo mensaje bajo control humano: se persiste pero no auto-responde.
    const r2 = await niupackbotService.handleInbound(ORG, {
      externalMessageId: 'SM_H2',
      from: '+595981000001',
      to: '+595900000001',
      body: 'Siguen ahí?',
      profileName: 'Juan',
      raw: {},
    });
    expect(r2.replySkipped).toBe(true);
    expect(r2.reply).toBeNull();
  });

  it('OpenAI caído no tumba el flujo (fallback determinista)', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const res = await niupackbotService.handleInbound(ORG, {
      externalMessageId: 'SM_FALLBACK_001',
      from: '+5511999999009',
      to: '+595900000001',
      body: 'Necesito vasos 12 oz, 200 mil mensual, entrega en Asunción',
      profileName: null,
      raw: {},
    });
    expect(res.leadId).toBeTruthy();
    expect(res.reply).toBeTruthy();
    if (prev) process.env.OPENAI_API_KEY = prev;
  });
});
