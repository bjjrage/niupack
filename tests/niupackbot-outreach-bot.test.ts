import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { niupackbotService } from '@/lib/niupackbot/service';
import { niupackbotRepository } from '@/lib/niupackbot/repository';
import { outreachRepository } from '@/lib/niupackbot/outreach/repository';
import { addRecipients, createCampaign, launchCampaign, processQueue } from '@/lib/niupackbot/outreach/campaigns';
import { sendManualReply, REPLY_WINDOW_MS } from '@/lib/niupackbot/outreach/manual-reply';
import { detectNoInterest, detectOptOut } from '@/lib/niupackbot/outreach/signals';
import { templateReply, type ReplyKind } from '@/lib/niupackbot/ai/prompts';
import { crmRepository } from '@/lib/crm/repository';
import { POST as replyRoute } from '@/app/api/crm/inbox/[id]/reply/route';
import { POST as createCampaignRoute } from '@/app/api/crm/campaigns/route';
import { POST as actionRoute } from '@/app/api/crm/campaigns/[id]/action/route';
import { GET as processRoute } from '@/app/api/niupackbot/campaigns/process/route';
import { fakeSender, ORG, ORG_B, resetAll, seedTemplate } from './helpers/outreach';

const PHONE_LOCAL = '0981 123 456';
const PHONE = '+595981123456';
let n = 0;
const inbound = (body: string, from = PHONE) =>
  niupackbotService.handleInbound(ORG, { externalMessageId: `SMIN${++n}`, from, to: '+595900000001', body, profileName: 'Cliente', raw: {} });

/** Campaña enviada a un teléfono; devuelve el destinatario ya SENT con MessageSid. */
async function contacted(phoneLocal = PHONE_LOCAL, name = 'María López', extra: { contactId?: string } = {}) {
  const template = await seedTemplate();
  const { campaign } = await createCampaign(ORG, null, {
    name: 'Campaña bot',
    templateId: template.id,
    audience: extra.contactId ? { contactIds: [extra.contactId] } : { rows: [{ name, phone: phoneLocal }] },
  });
  await launchCampaign(ORG, null, campaign.id);
  await processQueue(ORG, { send: fakeSender().send });
  const [r] = await outreachRepository.listRecipients(ORG, campaign.id);
  return { campaign, template, recipient: r };
}

const conv = async (from = PHONE) => (await crmRepository.listConversations(ORG)).find((c) => c.external_conversation_id === `whatsapp:${from}`);

beforeEach(() => resetAll());
afterEach(() => vi.unstubAllGlobals());

describe('Respuesta a una campaña → NIUPACKBOT → CRM', () => {
  it('vincula destinatario → teléfono → conversación → contacto y deja el template como contexto', async () => {
    const company = await crmRepository.createCompany({ organization_id: ORG, name: 'Café Sur', lifecycle_stage: 'PROSPECT' } as never);
    const contact = await crmRepository.createContact({ organization_id: ORG, company_id: company.id, full_name: 'María López', whatsapp_phone: PHONE } as never);
    const { campaign, recipient } = await contacted(PHONE_LOCAL, '', { contactId: contact.id });
    expect(recipient.contact_id).toBe(contact.id);

    await outreachRepository.updateRecipient(recipient.id, ORG, { sent_at: new Date(Date.now() - 3_600_000).toISOString() });
    const res = await inbound('Hola, ¿qué productos tienen?');
    expect(res.replySkipped).toBe(false);
    const c = (await conv())!;
    const r = (await outreachRepository.listRecipients(ORG, campaign.id))[0];
    expect(r).toMatchObject({ status: 'REPLIED', conversation_id: c.id });
    expect(r.replied_at).toBeTruthy();
    expect(c.contact_id).toBe(contact.id);

    const msgs = (await niupackbotRepository.listMessages(c.id, ORG, 20)).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)); // la base ordena por occurred_at
    const seeded = msgs.find((m) => m.author_role === 'SYSTEM');
    expect(seeded).toMatchObject({ direction: 'OUTBOUND', external_message_id: recipient.message_sid });
    expect(seeded?.body).toBe('Hola María, somos NIUPACK. ¿Te interesa conocer nuestros vasos y potes?');
    expect(seeded?.metadata).toMatchObject({ campaign_id: campaign.id });
    // el template se ordena antes de la respuesta del cliente
    expect(msgs.findIndex((m) => m.author_role === 'SYSTEM')).toBeLessThan(msgs.findIndex((m) => m.direction === 'INBOUND'));
  });

  it('el bot presenta NIUPACK y pregunta qué necesita; no cotiza, no deriva, no crea oportunidad', async () => {
    await contacted();
    const res = await inbound('Hola, ¿qué productos tienen?');
    expect(res.reply).toBe(templateReply('es', 'PRESENT'));
    expect(res.opportunityId ?? null).toBeNull();
    expect((await conv())?.control_mode).toBe('BOT');
    expect(await crmRepository.listOpportunities(ORG)).toHaveLength(0);
    expect(await crmRepository.listTasks(ORG)).toHaveLength(0);
  });

  it('responder NO es oportunidad: ni con calificación MEDIA/ALTA sin señal comercial', async () => {
    await contacted();
    const res = await inbound('Tienen vasos de 12 oz para café? Estamos en Asunción');
    expect(res.qualification).not.toBe('LOW'); // el lead queda calificado...
    expect(res.opportunityId ?? null).toBeNull(); // ...pero no hay oportunidad
    expect(await crmRepository.listOpportunities(ORG)).toHaveLength(0);
    expect((await conv())?.control_mode).toBe('BOT');
  });

  it('señal comercial real (cotización con volumen) → oportunidad NUEVO + handoff a HUMAN + destinatario HUMAN', async () => {
    const { campaign } = await contacted();
    const res = await inbound('Necesito cotización de vasos de 12 oz, 100 mil por mes, entrega en Asunción');
    expect(res.reply).toBe(templateReply('es', 'HANDOFF_COMMERCIAL'));
    expect(res.opportunityId).toBeTruthy();
    const opps = await crmRepository.listOpportunities(ORG);
    expect(opps).toHaveLength(1);
    expect(opps[0].stage).toBe('NUEVO');
    expect((await conv())?.control_mode).toBe('HUMAN');
    const tasks = await crmRepository.listTasks(ORG);
    expect(tasks.some((t) => t.source === 'NIUPACKBOT')).toBe(true);
    expect((await outreachRepository.listRecipients(ORG, campaign.id))[0].status).toBe('HUMAN');
  });

  it.each([
    ['pide precio', '¿Cuánto cuesta el vaso de 8 oz?'],
    ['pide cotización', 'Me pasan una cotización por favor'],
    ['quiere comprar', 'Quiero comprar 50 mil vasos'],
    ['muestra comercial', 'Me pueden mandar una muestra de los potes?'],
    ['pide llamada comercial', 'Prefiero una llamada para ver los vasos'],
  ])('%s → oportunidad + handoff', async (_label, text) => {
    await contacted();
    const res = await inbound(text);
    expect(res.opportunityId).toBeTruthy();
    expect((await conv())?.control_mode).toBe('HUMAN');
    expect(res.reply).toBe(templateReply('es', 'HANDOFF_COMMERCIAL'));
  });

  it.each([
    ['pide un humano', 'Quiero hablar con un asesor humano', 'HANDOFF_HUMAN'],
    ['descuento', 'Me pueden hacer un descuento?', 'HANDOFF_INFO'],
    ['condiciones comerciales', 'Cuáles son las condiciones de pago?', 'HANDOFF_INFO'],
    ['reclamo', 'Tengo un reclamo por el último pedido', 'HANDOFF_INFO'],
    ['ficha técnica (sin fuente confiable)', 'Me pasan la ficha técnica del vaso?', 'HANDOFF_INFO'],
    ['logística', 'Cuánto sale el flete a Santa Cruz?', 'HANDOFF_INFO'],
  ] as Array<[string, string, ReplyKind]>)('%s → handoff sin oportunidad', async (_label, text, kind) => {
    await contacted();
    const res = await inbound(text);
    expect(res.reply).toBe(templateReply('es', kind));
    expect((await conv())?.control_mode).toBe('HUMAN');
    expect(await crmRepository.listOpportunities(ORG)).toHaveLength(0);
  });

  it('sin respuesta confiable tras dos vueltas, el bot deriva en vez de seguir adivinando', async () => {
    await contacted();
    await inbound('asdf qwer zxcv');
    expect((await conv())?.control_mode).toBe('BOT');
    await inbound('lorem ipsum dolor');
    expect((await conv())?.control_mode).toBe('BOT');
    const third = await inbound('sit amet consectetur');
    expect(third.reply).toBe(templateReply('es', 'HANDOFF_INFO'));
    expect((await conv())?.control_mode).toBe('HUMAN');
  });

  it('con HUMAN en control el bot deja de responder (el mensaje se guarda)', async () => {
    await contacted();
    await inbound('Necesito cotización de 50 mil vasos 12 oz');
    const next = await inbound('Hola? alguien?');
    expect(next).toMatchObject({ replySkipped: true, reply: null });
    const c = (await conv())!;
    const bodies = (await niupackbotRepository.listMessages(c.id, ORG, 50)).map((m) => m.body);
    expect(bodies).toContain('Hola? alguien?');
  });

  it('el mismo inbound reenviado por Twilio no duplica vínculo ni mensajes', async () => {
    await contacted();
    const msg = { externalMessageId: 'SMDUP1', from: PHONE, to: '+595900000001', body: 'Hola, info?', profileName: null, raw: {} };
    await niupackbotService.handleInbound(ORG, msg);
    const c = (await conv())!;
    const before = (await niupackbotRepository.listMessages(c.id, ORG, 50)).length;
    expect((await niupackbotService.handleInbound(ORG, msg)).duplicate).toBe(true);
    expect((await niupackbotRepository.listMessages(c.id, ORG, 50)).length).toBe(before);
  });
});

describe('Bajas y rechazos', () => {
  it.each(['STOP', 'baja', 'Dar de baja', 'No quiero recibir más mensajes', 'unsubscribe'])('"%s" es una baja', (t) => {
    expect(detectOptOut(t)).toBe(true);
  });
  it.each(['Cancelar mi pedido de ayer', 'Quiero cancelar la cotización y pedir otra', 'no tengo baja stock de vasos, necesito reponer mucho más material para esta semana'])('"%s" NO es una baja', (t) => {
    expect(detectOptOut(t)).toBe(false);
  });
  it('"no me interesa" es rechazo, salvo que pida precio/muestra', () => {
    expect(detectNoInterest('No me interesa, gracias')).toBe(true);
    expect(detectNoInterest('No me interesa pero pasame el precio')).toBe(false);
  });

  it('STOP: registra la baja, confirma, no crea lead ni handoff y bloquea todo envío futuro', async () => {
    const { campaign } = await contacted();
    // otra campaña con el mismo teléfono aún pendiente
    const t2 = await seedTemplate();
    const { campaign: second } = await createCampaign(ORG, null, { name: 'Segunda', templateId: t2.id, audience: { rows: [{ name: 'María', phone: PHONE_LOCAL }] } });

    const res = await inbound('STOP');
    expect(res.reply).toBe(templateReply('es', 'OPT_OUT'));
    expect(await crmRepository.listLeads(ORG)).toHaveLength(0);
    expect(await crmRepository.listTasks(ORG)).toHaveLength(0);
    expect(await outreachRepository.isOptedOut(ORG, PHONE)).toBe(true);
    expect((await outreachRepository.listRecipients(ORG, campaign.id))[0].status).toBe('OPT_OUT');
    expect((await outreachRepository.listRecipients(ORG, second.id))[0].status).toBe('OPT_OUT');

    // campaña nueva con el mismo número: entra como OPT_OUT y jamás se envía
    const t3 = await seedTemplate();
    const { campaign: third, recipients } = await createCampaign(ORG, null, { name: 'Tercera', templateId: t3.id, audience: { rows: [{ name: 'María', phone: '+595 981 123 456' }, { name: 'Otro', phone: '0981 999 888' }] } });
    expect(recipients.optOut).toBe(1);
    await launchCampaign(ORG, null, third.id);
    const s = fakeSender();
    await processQueue(ORG, { send: s.send });
    expect(s.calls.map((c) => c.to)).toEqual(['+595981999888']);
  });

  it('una baja que llega después de importar también se respeta justo antes de enviar', async () => {
    const template = await seedTemplate();
    const { campaign } = await createCampaign(ORG, null, { name: 'Tarde', templateId: template.id, audience: { rows: [{ name: 'Ana', phone: PHONE_LOCAL }] } });
    await launchCampaign(ORG, null, campaign.id);
    await outreachRepository.addOptOut(ORG, PHONE, 'MANUAL');
    const s = fakeSender();
    const r = await processQueue(ORG, { send: s.send });
    expect(s.calls).toHaveLength(0);
    expect(r.optOut).toBe(1);
  });

  it('la baja se honra aunque un vendedor tenga el chat, y en portugués contesta en portugués', async () => {
    await contacted('+55 41 99999-1234', 'Ana Souza');
    await inbound('Quero falar com humano', '+5541999991234');
    expect((await conv('+5541999991234'))?.control_mode).toBe('HUMAN');
    const res = await inbound('PARE', '+5541999991234');
    expect(res.reply).toBe(templateReply('pt-BR', 'OPT_OUT'));
    expect(await outreachRepository.isOptedOut(ORG, '+5541999991234')).toBe(true);
  });

  it('rechazo cortés: NO_INTEREST, una respuesta amable, sin lead/oportunidad/handoff', async () => {
    const { campaign } = await contacted();
    const res = await inbound('No me interesa, gracias');
    expect(res.reply).toBe(templateReply('es', 'NO_INTEREST'));
    expect((await outreachRepository.listRecipients(ORG, campaign.id))[0].status).toBe('NO_INTEREST');
    expect(await crmRepository.listOpportunities(ORG)).toHaveLength(0);
    expect(await crmRepository.listTasks(ORG)).toHaveLength(0);
    expect((await conv())?.control_mode).toBe('BOT');
  });

  it('una baja de otra organización no afecta a esta', async () => {
    await outreachRepository.addOptOut(ORG_B, PHONE, 'MANUAL');
    expect(await outreachRepository.isOptedOut(ORG, PHONE)).toBe(false);
    const template = await seedTemplate();
    const { campaign } = await createCampaign(ORG, null, { name: 'Aislada', templateId: template.id });
    expect((await addRecipients(ORG, campaign.id, { rows: [{ name: 'A', phone: PHONE_LOCAL }] })).optOut).toBe(0);
  });
});

describe('El bot no cotiza: ninguna respuesta contiene precio, plazo, stock ni descuento', () => {
  const KINDS: ReplyKind[] = ['PRESENT', 'HANDOFF_COMMERCIAL', 'HANDOFF_HUMAN', 'HANDOFF_INFO', 'OPT_OUT', 'NO_INTEREST'];
  it.each(KINDS.flatMap((k) => (['es', 'pt-BR'] as const).map((l) => [k, l] as const)))('%s / %s', (kind, lang) => {
    const text = templateReply(lang, kind);
    expect(text).not.toMatch(/\$|usd|us\$|gs\.?|guaran|real(es)?\b|r\$/i);
    expect(text).not.toMatch(/\d+[.,]\d+/); // sin importes
    expect(text.replace('22000', '')).not.toMatch(/\d{2,}/); // única cifra permitida: la norma FSSC 22000
    expect(text).not.toMatch(/descuento|desconto|stock|estoque|dias h[aá]beis|días hábiles|lead time|en \d+ d[ií]as/i);
  });
  it('la presentación menciona solo hechos ya documentados de NIUPACK', () => {
    expect(templateReply('es', 'PRESENT')).toMatch(/NIUPACK.*Asunción.*FSSC 22000.*vasos de polipapel, potes y tapas/s);
  });
});

describe('Respuesta manual del vendedor', () => {
  async function humanConversation(minutesAgo = 5) {
    await inbound('Quiero hablar con un asesor humano');
    const c = (await conv())!;
    const msgs = await niupackbotRepository.listMessages(c.id, ORG, 50);
    const last = [...msgs].reverse().find((m) => m.direction === 'INBOUND')!;
    last.occurred_at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    return c;
  }
  const cap = () => {
    const sent: Array<{ to: string; body: string }> = [];
    return { sent, send: async (i: { to: string; body: string }) => (sent.push(i), { ok: true as const, sid: `SMMAN${sent.length}`, status: 'queued' }) };
  };

  it('envía texto libre dentro de la ventana de 24h y lo registra como HUMAN_AGENT + actividad CRM', async () => {
    const c = await humanConversation();
    const s = cap();
    const msg = await sendManualReply(ORG, null, c.id, ' Hola, soy Marcelo de NIUPACK ', { send: s.send });
    expect(s.sent).toEqual([{ to: PHONE, body: 'Hola, soy Marcelo de NIUPACK' }]);
    expect(msg).toMatchObject({ author_role: 'HUMAN_AGENT', external_message_id: 'SMMAN1', direction: 'OUTBOUND' });
    const acts = await crmRepository.listActivities(ORG, { conversation_id: c.id });
    expect(acts.some((a) => a.type === 'HUMAN_MESSAGE')).toBe(true);
  });

  it('NO envía si la conversación no está en HUMAN', async () => {
    await inbound('Hola, info?');
    const c = (await conv())!;
    const s = cap();
    await expect(sendManualReply(ORG, null, c.id, 'Hola', { send: s.send })).rejects.toThrow('NOT_HUMAN_CONTROL');
    expect(s.sent).toHaveLength(0);
  });

  it('NO envía texto libre fuera de la ventana de 24h', async () => {
    const c = await humanConversation();
    const s = cap();
    await expect(sendManualReply(ORG, null, c.id, 'Hola', { send: s.send, now: new Date(Date.now() + REPLY_WINDOW_MS + 60_000) })).rejects.toThrow('OUTSIDE_24H_WINDOW');
    expect(s.sent).toHaveLength(0);
  });

  it('NO envía a quien dio de baja, ni mensajes vacíos o de otra organización', async () => {
    const c = await humanConversation();
    const s = cap();
    await expect(sendManualReply(ORG, null, c.id, '   ', { send: s.send })).rejects.toThrow('REPLY_BODY_INVALID');
    await expect(sendManualReply(ORG_B, null, c.id, 'Hola', { send: s.send })).rejects.toThrow('CONVERSATION_NOT_FOUND');
    await outreachRepository.addOptOut(ORG, PHONE, 'MANUAL');
    await expect(sendManualReply(ORG, null, c.id, 'Hola', { send: s.send })).rejects.toThrow('OPTED_OUT');
    expect(s.sent).toHaveLength(0);
  });

  it('falla de Twilio no guarda un mensaje que no salió', async () => {
    const c = await humanConversation();
    const before = (await niupackbotRepository.listMessages(c.id, ORG, 50)).length;
    await expect(sendManualReply(ORG, null, c.id, 'Hola', { send: async () => ({ ok: false, code: '21211', httpStatus: 400, transient: false, message: 'x' }) })).rejects.toThrow('SEND_FAILED');
    expect((await niupackbotRepository.listMessages(c.id, ORG, 50)).length).toBe(before);
  });

  it('ruta: 409 si no está en HUMAN, y nunca llama a Twilio', async () => {
    await inbound('Hola, info?');
    const c = (await conv())!;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await replyRoute(new Request('https://t.local/x', { method: 'POST', body: JSON.stringify({ body: 'Hola' }) }), { params: Promise.resolve({ id: c.id }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'NOT_HUMAN_CONTROL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Rutas: campaña de punta a punta', () => {
  it('crear → lanzar → primer lote enviado con ContentSid; el scheduler por Bearer continúa', async () => {
    const template = await seedTemplate();
    const sent: URLSearchParams[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent.push(new URLSearchParams(String(init?.body)));
        return { ok: true, status: 201, json: async () => ({ sid: `SMROUTE${sent.length}`, status: 'queued' }) };
      }),
    );
    const created = await createCampaignRoute(
      new Request('https://t.local/c', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ruta e2e', templateId: template.id, sendRatePerMin: 1, audience: { rows: [{ name: 'Ana', phone: '0981 111 111' }, { name: 'Beto', phone: '0981 222 222' }] } }),
      }),
    );
    expect(created.status).toBe(201);
    const { campaign } = await created.json();
    expect(campaign.status).toBe('DRAFT');
    expect(sent).toHaveLength(0); // crear no envía nada

    const launched = await actionRoute(new Request('https://t.local/a', { method: 'POST', body: JSON.stringify({ action: 'launch' }) }), { params: Promise.resolve({ id: campaign.id }) });
    expect(launched.status).toBe(200);
    expect((await launched.json()).tick).toMatchObject({ sent: 1 }); // ritmo 1/min
    expect(sent).toHaveLength(1);
    expect(sent[0].get('ContentSid')).toBe('HXtest000000000000000000000000001');
    expect(sent[0].has('Body')).toBe(false);

    process.env.CRON_SECRET = 'cron_test';
    const tick = await processRoute(new Request('https://t.local/p', { headers: { authorization: 'Bearer cron_test' } }));
    expect((await tick.json()).sent).toBe(1);
    expect(sent).toHaveLength(2);
    delete process.env.CRON_SECRET;
  });

  it('lanzar con template sin aprobar => 409 y nada sale', async () => {
    const template = await seedTemplate('PENDING');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const created = await createCampaignRoute(new Request('https://t.local/c', { method: 'POST', body: JSON.stringify({ name: 'Sin aprobar', templateId: template.id, audience: { rows: [{ name: 'Ana', phone: '0981 111 111' }] } }) }));
    const { campaign } = await created.json();
    const res = await actionRoute(new Request('https://t.local/a', { method: 'POST', body: JSON.stringify({ action: 'launch' }) }), { params: Promise.resolve({ id: campaign.id }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'TEMPLATE_NOT_APPROVED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
