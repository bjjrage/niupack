import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { normalizePhone } from '@/lib/niupackbot/outreach/phone';
import { parseContactsCsv, previewContacts } from '@/lib/niupackbot/outreach/csv';
import { createTemplate, placeholders, renderTemplate, submitTemplate, syncTemplate, validateTemplateInput } from '@/lib/niupackbot/outreach/templates';
import {
  addRecipients,
  cancelCampaign,
  createCampaign,
  getCampaignSummary,
  launchCampaign,
  listCampaigns,
  pauseCampaign,
  processQueue,
  resumeCampaign,
  retryFailed,
  STUCK_QUEUE_MS,
} from '@/lib/niupackbot/outreach/campaigns';
import { outreachRepository } from '@/lib/niupackbot/outreach/repository';
import { sendWhatsappTemplate } from '@/lib/niupackbot/whatsapp/sender';
import { crmRepository } from '@/lib/crm/repository';
import { fakeSender, ORG, ORG_B, resetAll, runningCampaign, seedTemplate } from './helpers/outreach';

beforeEach(() => resetAll());
afterEach(() => vi.unstubAllGlobals());

describe('Teléfonos E.164 (BR, AR, BO, PY)', () => {
  it('normaliza formatos locales y con código de país', () => {
    expect(normalizePhone('0981 123 456')).toMatchObject({ ok: true, e164: '+595981123456', country: 'PY' });
    expect(normalizePhone('whatsapp:+595981123456').e164).toBe('+595981123456');
    expect(normalizePhone('+55 (41) 99999-1234')).toMatchObject({ ok: true, e164: '+5541999991234', country: 'BR' });
    expect(normalizePhone('+54 9 11 5555 1234')).toMatchObject({ ok: true, country: 'AR' });
    expect(normalizePhone('+591 7 123 4567')).toMatchObject({ ok: true, e164: '+59171234567', country: 'BO' });
  });
  it('rechaza inválidos y países fuera del alcance', () => {
    expect(normalizePhone('').ok).toBe(false);
    expect(normalizePhone('abc').ok).toBe(false);
    expect(normalizePhone('+1 305 555 1234').reason).toMatch(/no soportado/i);
    expect(normalizePhone('+595 98 1').ok).toBe(false);
    expect(normalizePhone('11 5555 1234').reason).toMatch(/código de país/i);
  });
});

describe('Importación CSV', () => {
  it('detecta encabezados, separador ; y deduplica por teléfono normalizado', () => {
    const rows = parseContactsCsv('nombre;telefono\nAna;0981 111 222\nBeto;+595981111222\nCaro;12345\n');
    const p = previewContacts(rows);
    expect(p.resumen).toEqual({ total: 3, validos: 1, invalidos: 1, duplicados: 1 });
    expect(p.rows[1].estado).toBe('duplicado');
  });
  it('sin encabezado: nombre,teléfono', () => {
    const p = previewContacts(parseContactsCsv('Ana,0981111222'));
    expect(p.rows[0]).toMatchObject({ nombre: 'Ana', phone_e164: '+595981111222', estado: 'valido' });
  });
});

describe('Templates', () => {
  it('valida nombre, variable única {{1}} y ejemplo obligatorio', () => {
    const base = { name: 'intro_niupack', language: 'es' as const, category: 'MARKETING' as const, body: 'Hola {{1}}', example1: 'María' };
    expect(validateTemplateInput(base)).toBeNull();
    expect(validateTemplateInput({ ...base, name: 'Nombre Inválido' })).toBe('TEMPLATE_NAME_INVALID');
    expect(validateTemplateInput({ ...base, body: 'Hola {{1}} {{2}}' })).toBe('TEMPLATE_ONLY_VARIABLE_1');
    expect(validateTemplateInput({ ...base, example1: '' })).toBe('TEMPLATE_EXAMPLE_REQUIRED');
    expect(validateTemplateInput({ ...base, body: 'x'.repeat(1025) })).toBe('TEMPLATE_BODY_INVALID');
    expect(placeholders('{{1}} y {{ 1 }}')).toEqual([1]);
    expect(renderTemplate('Hola {{1}}!', { '1': 'Ana' })).toBe('Hola Ana!');
  });

  it('crear → pedir aprobación → sincronizar, contra Twilio Content API (fetch simulado)', async () => {
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
        if (url.endsWith('/Content')) return { ok: true, status: 201, json: async () => ({ sid: 'HXabc' }) };
        if (url.includes('/ApprovalRequests/whatsapp')) return { ok: true, status: 201, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ whatsapp: { status: 'approved' } }) };
      }),
    );
    const t = await createTemplate(ORG, null, { name: 'intro_niupack', language: 'pt_BR', category: 'MARKETING', body: 'Olá {{1}}, aqui é a NIUPACK.', example1: 'Ana' });
    expect(t).toMatchObject({ status: 'DRAFT', twilio_content_sid: 'HXabc' });
    expect(calls[0].body).toMatchObject({ friendly_name: 'intro_niupack', language: 'pt_BR', variables: { '1': 'Ana' }, types: { 'twilio/text': { body: 'Olá {{1}}, aqui é a NIUPACK.' } } });

    expect((await submitTemplate(ORG, t.id)).status).toBe('PENDING');
    expect(calls[1].url).toContain('/Content/HXabc/ApprovalRequests/whatsapp');
    expect(calls[1].body).toEqual({ name: 'intro_niupack', category: 'MARKETING' });
    expect((await syncTemplate(ORG, t.id)).status).toBe('APPROVED');
    await expect(submitTemplate(ORG, t.id)).rejects.toThrow('TEMPLATE_NOT_SUBMITTABLE');
  });

  it('rechazado por WhatsApp guarda el motivo; nombre duplicado se rechaza', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.endsWith('/Content') ? { sid: 'HXrej' } : { whatsapp: { status: 'rejected', rejection_reason: 'INVALID_FORMAT' } }),
    })));
    const t = await createTemplate(ORG, null, { name: 'prueba_rej', language: 'es', category: 'UTILITY', body: 'Hola' });
    const synced = await syncTemplate(ORG, t.id);
    expect(synced).toMatchObject({ status: 'REJECTED', rejection_reason: 'INVALID_FORMAT' });
    await expect(createTemplate(ORG, null, { name: 'prueba_rej', language: 'es', category: 'UTILITY', body: 'Hola' })).rejects.toThrow('TEMPLATE_DUPLICATE');
  });
});

describe('Crear campaña', () => {
  it('crea en DRAFT con audiencia normalizada, deduplicada y con {{1}} = nombre de pila', async () => {
    const tpl = await seedTemplate();
    const { campaign, recipients } = await createCampaign(ORG, null, {
      name: 'Primer contacto',
      templateId: tpl.id,
      audience: { rows: [{ name: 'María López', phone: '0981 123 456' }, { name: 'Dup', phone: '+595981123456' }, { name: 'Mal', phone: '123' }] },
    });
    expect(campaign.status).toBe('DRAFT');
    expect(recipients).toMatchObject({ added: 1, skipped: 0 });
    const list = await outreachRepository.listRecipients(ORG, campaign.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ phone_e164: '+595981123456', status: 'PENDING', content_variables: { '1': 'María' } });
  });

  it('importar la misma audiencia dos veces es idempotente', async () => {
    const tpl = await seedTemplate();
    const { campaign } = await createCampaign(ORG, null, { name: 'Idem', templateId: tpl.id });
    const audience = { rows: [{ name: 'A', phone: '0981 000 001' }, { name: 'B', phone: '0981 000 002' }] };
    expect((await addRecipients(ORG, campaign.id, audience)).added).toBe(2);
    expect(await addRecipients(ORG, campaign.id, audience)).toMatchObject({ added: 0, skipped: 2 });
    expect(await outreachRepository.listRecipients(ORG, campaign.id)).toHaveLength(2);
  });

  it('une contactos del CRM con su cuenta y vincula filas CSV que ya son contactos', async () => {
    const company = await crmRepository.createCompany({ organization_id: ORG, name: 'Café Sur', lifecycle_stage: 'PROSPECT' } as never);
    const contact = await crmRepository.createContact({ organization_id: ORG, company_id: company.id, full_name: 'Juan Pérez', whatsapp_phone: '+595981777888' } as never);
    const tpl = await seedTemplate();
    const { campaign } = await createCampaign(ORG, null, {
      name: 'CRM',
      templateId: tpl.id,
      audience: { contactIds: [contact.id], rows: [{ name: '', phone: '0981 777 888' }] },
    });
    const list = await outreachRepository.listRecipients(ORG, campaign.id);
    expect(list).toHaveLength(1); // mismo teléfono: una sola fila
    expect(list[0]).toMatchObject({ contact_id: contact.id, company_id: company.id, name: 'Juan Pérez' });
  });

  it('un contacto de otra organización no se puede usar (CROSS_TENANT_REFERENCE)', async () => {
    const foreign = await crmRepository.createContact({ organization_id: ORG_B, full_name: 'Ajeno', whatsapp_phone: '+595981555666' } as never);
    const tpl = await seedTemplate();
    await expect(createCampaign(ORG, null, { name: 'Campaña X', templateId: tpl.id, audience: { contactIds: [foreign.id] } })).rejects.toThrow('CROSS_TENANT_REFERENCE');
  });
});

describe('Lanzar campaña', () => {
  it('NO se lanza sin template aprobado', async () => {
    for (const status of ['DRAFT', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED'] as const) {
      const tpl = await seedTemplate(status);
      const { campaign } = await createCampaign(ORG, null, { name: `C ${status}`, templateId: tpl.id, audience: { rows: [{ name: 'A', phone: '0981 000 001' }] } });
      await expect(launchCampaign(ORG, null, campaign.id)).rejects.toThrow('TEMPLATE_NOT_APPROVED');
      expect((await outreachRepository.getCampaign(campaign.id, ORG))?.status).toBe('DRAFT');
    }
  });

  it('NO se lanza sin Twilio configurado ni sin destinatarios', async () => {
    const tpl = await seedTemplate();
    const { campaign } = await createCampaign(ORG, null, { name: 'Vacía', templateId: tpl.id });
    await expect(launchCampaign(ORG, null, campaign.id)).rejects.toThrow('CAMPAIGN_WITHOUT_RECIPIENTS');
    await addRecipients(ORG, campaign.id, { rows: [{ name: 'A', phone: '0981 000 001' }] });
    delete process.env.TWILIO_AUTH_TOKEN;
    await expect(launchCampaign(ORG, null, campaign.id)).rejects.toThrow('TWILIO_NOT_CONFIGURED');
  });

  it('lanzar es atómico: el segundo lanzamiento falla y programada queda SCHEDULED', async () => {
    const tpl = await seedTemplate();
    const { campaign } = await createCampaign(ORG, null, { name: 'Campaña L', templateId: tpl.id, audience: { rows: [{ name: 'A', phone: '0981 000 001' }] } });
    expect((await launchCampaign(ORG, null, campaign.id)).status).toBe('RUNNING');
    await expect(launchCampaign(ORG, null, campaign.id)).rejects.toThrow('CAMPAIGN_NOT_LAUNCHABLE');

    const { campaign: later } = await createCampaign(ORG, null, {
      name: 'Futura',
      templateId: tpl.id,
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      audience: { rows: [{ name: 'B', phone: '0981 000 002' }] },
    });
    expect((await launchCampaign(ORG, null, later.id)).status).toBe('SCHEDULED');
  });

  it('pausar / reanudar / cancelar respetan los estados válidos', async () => {
    const { campaign } = await runningCampaign(1);
    expect((await pauseCampaign(ORG, null, campaign.id)).status).toBe('PAUSED');
    await expect(pauseCampaign(ORG, null, campaign.id)).rejects.toThrow('CAMPAIGN_NOT_PAUSABLE');
    expect((await resumeCampaign(ORG, null, campaign.id)).status).toBe('RUNNING');
    expect((await cancelCampaign(ORG, null, campaign.id)).status).toBe('CANCELLED');
    await expect(resumeCampaign(ORG, null, campaign.id)).rejects.toThrow('CAMPAIGN_NOT_RESUMABLE');
  });
});

describe('Cola de envío', () => {
  it('envía con ContentSid y ContentVariables, nunca texto libre, y guarda el MessageSid', async () => {
    const { campaign } = await runningCampaign(2);
    const s = fakeSender();
    const r = await processQueue(ORG, { send: s.send });
    expect(r).toMatchObject({ sent: 2, failed: 0 });
    expect(s.calls).toHaveLength(2);
    for (const c of s.calls) {
      expect(c.contentSid).toBe('HXtest000000000000000000000000001');
      expect(c.variables).toMatchObject({ '1': expect.stringMatching(/^Cliente$/) });
      expect(c).not.toHaveProperty('body');
    }
    const list = await outreachRepository.listRecipients(ORG, campaign.id);
    expect(list.every((x) => x.status === 'SENT' && x.message_sid && x.sent_at)).toBe(true);
    expect((await outreachRepository.getCampaign(campaign.id, ORG))?.status).toBe('COMPLETED');
  });

  it('el request REST a Twilio lleva ContentSid, ContentVariables (JSON), From, To y StatusCallback', async () => {
    let captured: URLSearchParams | null = null;
    let auth = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        captured = new URLSearchParams(String(init?.body));
        auth = String((init?.headers as Record<string, string>).Authorization);
        expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
        return { ok: true, status: 201, json: async () => ({ sid: 'SMreal', status: 'queued' }) };
      }),
    );
    const res = await sendWhatsappTemplate({ to: '+595981123456', contentSid: 'HX1', variables: { '1': 'María' } });
    expect(res).toEqual({ ok: true, sid: 'SMreal', status: 'queued' });
    expect(captured!.get('ContentSid')).toBe('HX1');
    expect(JSON.parse(captured!.get('ContentVariables')!)).toEqual({ '1': 'María' });
    expect(captured!.get('From')).toBe('whatsapp:+595900000001');
    expect(captured!.get('To')).toBe('whatsapp:+595981123456');
    expect(captured!.get('StatusCallback')).toBe('https://test.local/api/niupackbot/whatsapp/status');
    expect(captured!.has('Body')).toBe(false);
    expect(auth).toBe(`Basic ${Buffer.from('ACtest:tok_test').toString('base64')}`);
  });

  it('ticks concurrentes NO duplican envíos (claim atómico)', async () => {
    await runningCampaign(5);
    const s = fakeSender();
    await Promise.all([processQueue(ORG, { send: s.send }), processQueue(ORG, { send: s.send }), processQueue(ORG, { send: s.send })]);
    const phones = s.calls.map((c) => c.to);
    expect(new Set(phones).size).toBe(phones.length);
    expect(phones).toHaveLength(5);
  });

  it('un tick repetido o un retry de Vercel no reenvía lo ya enviado', async () => {
    await runningCampaign(2);
    const s = fakeSender();
    await processQueue(ORG, { send: s.send });
    await processQueue(ORG, { send: s.send });
    expect(s.calls).toHaveLength(2);
  });

  it('respeta el ritmo: como máximo send_rate_per_min por tick', async () => {
    const tpl = await seedTemplate();
    const { campaign } = await createCampaign(ORG, null, {
      name: 'Ritmo',
      templateId: tpl.id,
      sendRatePerMin: 2,
      audience: { rows: Array.from({ length: 5 }, (_, i) => ({ name: `C${i}`, phone: `0981 000 00${i + 1}` })) },
    });
    await launchCampaign(ORG, null, campaign.id);
    const s = fakeSender();
    expect((await processQueue(ORG, { send: s.send })).sent).toBe(2);
    expect((await getCampaignSummary(ORG, campaign.id))?.status).toBe('RUNNING');
    await processQueue(ORG, { send: s.send });
    await processQueue(ORG, { send: s.send });
    expect(s.calls).toHaveLength(5);
    expect((await outreachRepository.getCampaign(campaign.id, ORG))?.status).toBe('COMPLETED');
  });

  it('error transitorio reintenta (hasta 3), 429 corta el tick; error permanente falla sin reintentar', async () => {
    const { campaign } = await runningCampaign(2);
    const s = fakeSender({
      fail: (to) =>
        to.endsWith('001')
          ? { ok: false, code: 'HTTP_429', httpStatus: 429, transient: true, message: 'x' }
          : { ok: false, code: '21211', httpStatus: 400, transient: false, message: 'x' },
    });
    const r1 = await processQueue(ORG, { send: s.send });
    expect(r1).toMatchObject({ retried: 1, sent: 0, failed: 0 }); // 429 → vuelve a PENDING y corta
    expect(s.calls).toHaveLength(1);
    let list = await outreachRepository.listRecipients(ORG, campaign.id);
    expect(list[0]).toMatchObject({ status: 'PENDING', attempts: 1, last_error: 'HTTP_429' });
    await processQueue(ORG, { send: s.send });
    const r3 = await processQueue(ORG, { send: s.send });
    list = await outreachRepository.listRecipients(ORG, campaign.id);
    expect(list[0].status).toBe('FAILED'); // 3er intento fallido
    expect(r3.failed).toBeGreaterThanOrEqual(1);
    expect(list[1]).toMatchObject({ status: 'FAILED', last_error: '21211', attempts: 1 }); // permanente: 1 solo intento
  });

  it('retry_failed vuelve a poner los fallidos en cola y reabre la campaña', async () => {
    const { campaign } = await runningCampaign(1);
    await processQueue(ORG, { send: fakeSender({ fail: () => ({ ok: false, code: '21211', httpStatus: 400, transient: false, message: 'x' }) }).send });
    expect((await outreachRepository.getCampaign(campaign.id, ORG))?.status).toBe('COMPLETED');
    expect(await retryFailed(ORG, null, campaign.id)).toEqual({ requeued: 1 });
    expect((await outreachRepository.getCampaign(campaign.id, ORG))?.status).toBe('RUNNING');
    const s = fakeSender();
    await processQueue(ORG, { send: s.send });
    expect(s.calls).toHaveLength(1);
  });

  it('QUEUED viejo sin SID (worker caído) se marca DELIVERY_UNKNOWN: nunca se reenvía solo', async () => {
    const { campaign } = await runningCampaign(1);
    const [r] = await outreachRepository.listRecipients(ORG, campaign.id);
    await outreachRepository.updateRecipient(r.id, ORG, { status: 'QUEUED', claimed_at: new Date(Date.now() - STUCK_QUEUE_MS - 1000).toISOString() });
    const s = fakeSender();
    const res = await processQueue(ORG, { send: s.send });
    expect(s.calls).toHaveLength(0);
    expect(res.failed).toBe(1);
    expect((await outreachRepository.getRecipient(r.id, ORG))?.last_error).toBe('DELIVERY_UNKNOWN');
  });

  it('template que deja de estar aprobado frena la campaña y no envía nada', async () => {
    const { campaign, template } = await runningCampaign(2);
    await outreachRepository.updateTemplate(template.id, ORG, { status: 'PAUSED' });
    const s = fakeSender();
    await processQueue(ORG, { send: s.send });
    expect(s.calls).toHaveLength(0);
    expect((await outreachRepository.getCampaign(campaign.id, ORG))?.status).toBe('PAUSED');
  });

  it('campañas pausadas, canceladas o en borrador no envían', async () => {
    const { campaign } = await runningCampaign(2);
    await pauseCampaign(ORG, null, campaign.id);
    const s = fakeSender();
    await processQueue(ORG, { send: s.send });
    expect(s.calls).toHaveLength(0);
  });

  it('SCHEDULED vencida pasa a RUNNING y envía', async () => {
    const tpl = await seedTemplate();
    const { campaign } = await createCampaign(ORG, null, {
      name: 'Prog',
      templateId: tpl.id,
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      audience: { rows: [{ name: 'A', phone: '0981 000 001' }] },
    });
    await launchCampaign(ORG, null, campaign.id);
    const s = fakeSender();
    await processQueue(ORG, { send: s.send });
    expect(s.calls).toHaveLength(0); // todavía no es la hora
    await processQueue(ORG, { send: s.send, now: new Date(Date.now() + 120_000) });
    expect(s.calls).toHaveLength(1);
  });

  it('sin Twilio configurado la cola no envía ni marca fallos', async () => {
    const { campaign } = await runningCampaign(1);
    delete process.env.TWILIO_ACCOUNT_SID;
    const s = fakeSender();
    expect(await processQueue(ORG, { send: s.send })).toMatchObject({ blocked: 'TWILIO_NOT_CONFIGURED', sent: 0 });
    expect((await outreachRepository.listRecipients(ORG, campaign.id))[0].status).toBe('PENDING');
  });
});

describe('Aislamiento entre organizaciones', () => {
  it('la organización B no ve, edita, lanza ni envía la campaña de A', async () => {
    const { campaign } = await runningCampaign(2, ORG);
    expect(await getCampaignSummary(ORG_B, campaign.id)).toBeUndefined();
    expect(await listCampaigns(ORG_B)).toHaveLength(0);
    await expect(addRecipients(ORG_B, campaign.id, { rows: [{ name: 'X', phone: '0981 000 009' }] })).rejects.toThrow('CAMPAIGN_NOT_FOUND');
    await expect(pauseCampaign(ORG_B, null, campaign.id)).rejects.toThrow('CAMPAIGN_NOT_PAUSABLE');
    await expect(cancelCampaign(ORG_B, null, campaign.id)).rejects.toThrow('CAMPAIGN_NOT_CANCELLABLE');
    await expect(launchCampaign(ORG_B, null, campaign.id)).rejects.toThrow('CAMPAIGN_NOT_FOUND');
    const s = fakeSender();
    await processQueue(ORG_B, { send: s.send });
    expect(s.calls).toHaveLength(0);
    expect(await outreachRepository.listRecipients(ORG_B, campaign.id)).toHaveLength(0);
    expect(await outreachRepository.getTemplate(campaign.template_id, ORG_B)).toBeUndefined();
  });

  it('una campaña no puede usar el template de otra organización', async () => {
    const foreign = await seedTemplate('APPROVED', ORG_B);
    await expect(createCampaign(ORG, null, { name: 'Campaña X', templateId: foreign.id })).rejects.toThrow('TEMPLATE_NOT_FOUND');
  });
});
