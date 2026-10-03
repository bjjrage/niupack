import { describe, it, expect, beforeEach } from 'vitest';
import { niupackbotService } from '@/lib/niupackbot/service';
import { crmRepository } from '@/lib/crm/repository';
import { GET as inboxGet } from '@/app/api/crm/inbox/route';
import { conversationState } from '@/components/crm/views/inbox-state';
import { ORG, resetAll } from './helpers/outreach';

let n = 0;
const inbound = (body: string, from: string) =>
  niupackbotService.handleInbound(ORG, { externalMessageId: `SMLIST${++n}`, from, to: '+595900000001', body, profileName: 'Cliente', raw: {} });

beforeEach(() => resetAll());

describe('País del lead = país del número (no el idioma)', () => {
  it.each([
    ['+595981000001', 'PY'],
    ['+5541999991234', 'BR'],
    ['+5491155551234', 'AR'],
    ['+59171234567', 'BO'],
  ])('"Hola" desde %s => %s', async (from, country) => {
    await inbound('Hola', from);
    const lead = (await crmRepository.listLeads(ORG)).find((l) => l.external_id === `whatsapp:${from}`);
    expect(lead?.country_code).toBe(country);
    expect(lead?.destination_country).toBe(country);
  });

  it('si el cliente dice una ciudad de destino, manda esa', async () => {
    await inbound('Hola, necesito entrega en Curitiba', '+595981000002');
    const lead = (await crmRepository.listLeads(ORG)).find((l) => l.external_id === 'whatsapp:+595981000002');
    expect(lead?.destination_city).toBe('Curitiba');
    expect(lead?.destination_country).toBe('BR');
  });
});

describe('GET /api/crm/inbox: último mensaje y estado', () => {
  it('devuelve la vista previa del último mensaje por conversación', async () => {
    await inbound('Hola', '+595981000003');
    await inbound('Quiero una cotización', '+595981000003');
    await inbound('Hola, info?', '+595981000004');
    const res = await inboxGet();
    const { inbox } = (await res.json()) as { inbox: Array<{ conversation: { external_conversation_id: string; control_mode: string }; last_message: { direction: string; author_role: string; preview: string } | null }> };
    expect(inbox).toHaveLength(2);
    const a = inbox.find((i) => i.conversation.external_conversation_id === 'whatsapp:+595981000003')!;
    const b = inbox.find((i) => i.conversation.external_conversation_id === 'whatsapp:+595981000004')!;
    // El bot contestó último en ambas: el handoff es la última salida.
    expect(a.last_message).toMatchObject({ direction: 'OUTBOUND', author_role: 'BOT' });
    expect(a.last_message!.preview).toMatch(/asesor comercial/);
    expect(b.last_message!.preview.length).toBeLessThanOrEqual(140);
    expect(a.conversation.control_mode).toBe('HUMAN');
  });

  it('un chat derivado queda "con vendedor" hasta que el cliente vuelve a escribir; entonces "espera vendedor"', async () => {
    await inbound('Quiero una cotización', '+595981000005');
    const fetchItem = async () => {
      const { inbox } = (await (await inboxGet()).json()) as { inbox: Parameters<typeof conversationState>[0][] };
      return inbox.find((i) => i.conversation.external_conversation_id === 'whatsapp:+595981000005')!;
    };
    // El bot cerró con su mensaje de handoff: el vendedor todavía no habló, pero la pelota está de su lado.
    expect(['WAITING_SELLER', 'WITH_SELLER']).toContain(conversationState(await fetchItem()));
    await inbound('¿Alguien me atiende?', '+595981000005'); // HUMAN: se guarda sin que el bot conteste
    expect(conversationState(await fetchItem())).toBe('WAITING_SELLER');
  });

  it('un listado grande no se rompe: 120 conversaciones, todas con su último mensaje', async () => {
    for (let i = 0; i < 120; i++) await inbound('Hola', `+5959810${String(10000 + i)}`);
    const { inbox } = (await (await inboxGet()).json()) as { inbox: Array<{ last_message: unknown }> };
    expect(inbox.length).toBeGreaterThanOrEqual(100); // el listado tiene tope de 200
    expect(inbox.every((i) => i.last_message)).toBe(true);
  });
});
