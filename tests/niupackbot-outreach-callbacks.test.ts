import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { applyStatusCallback } from '@/lib/niupackbot/outreach/status-callback';
import { processQueue } from '@/lib/niupackbot/outreach/campaigns';
import { outreachRepository } from '@/lib/niupackbot/outreach/repository';
import { crmRepository } from '@/lib/crm/repository';
import { POST as statusRoute } from '@/app/api/niupackbot/whatsapp/status/route';
import { middleware } from '@/middleware';
import { fakeSender, ORG, ORG_B, resetAll, runningCampaign, sign, WEBHOOK } from './helpers/outreach';

const STATUS_URL = `${WEBHOOK}/status`;

async function sentRecipient() {
  const { campaign } = await runningCampaign(1);
  await processQueue(ORG, { send: fakeSender().send });
  const [r] = await outreachRepository.listRecipients(ORG, campaign.id);
  return r;
}

const snap = (r: object) => JSON.stringify({ ...r, updated_at: undefined });

beforeEach(() => resetAll());

describe('Status callback: sent / delivered / read / failed', () => {
  it('avanza SENT → DELIVERED → READ y fija cada timestamp', async () => {
    const r = await sentRecipient();
    const sid = r.message_sid!;
    expect(await applyStatusCallback(ORG, { MessageSid: sid, MessageStatus: 'sent' }, '2026-01-01T10:00:00.000Z')).toMatchObject({ matched: true, to: 'SENT' });
    await applyStatusCallback(ORG, { MessageSid: sid, MessageStatus: 'delivered' }, '2026-01-01T10:00:05.000Z');
    expect(await outreachRepository.getRecipient(r.id, ORG)).toMatchObject({ status: 'DELIVERED', delivered_at: '2026-01-01T10:00:05.000Z' });
    await applyStatusCallback(ORG, { MessageSid: sid, MessageStatus: 'read' }, '2026-01-01T10:01:00.000Z');
    expect(await outreachRepository.getRecipient(r.id, ORG)).toMatchObject({ status: 'READ', read_at: '2026-01-01T10:01:00.000Z' });
  });

  it('failed y undelivered marcan FAILED con el código de Twilio', async () => {
    const r = await sentRecipient();
    await applyStatusCallback(ORG, { MessageSid: r.message_sid!, MessageStatus: 'undelivered', ErrorCode: '63016' });
    expect(await outreachRepository.getRecipient(r.id, ORG)).toMatchObject({ status: 'FAILED', last_error: 'TWILIO_63016' });
    expect(await outreachRepository.getRecipient(r.id, ORG)).toHaveProperty('failed_at');
  });

  it('callback duplicado es idempotente (mismo estado, mismos timestamps)', async () => {
    const r = await sentRecipient();
    const p = { MessageSid: r.message_sid!, MessageStatus: 'delivered' };
    const first = await applyStatusCallback(ORG, p, '2026-01-01T10:00:00.000Z');
    const after1 = snap((await outreachRepository.getRecipient(r.id, ORG))!);
    const second = await applyStatusCallback(ORG, p, '2026-01-01T11:30:00.000Z');
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(snap((await outreachRepository.getRecipient(r.id, ORG))!)).toBe(after1);
  });

  it('tolera desorden: nunca retrocede de READ/DELIVERED', async () => {
    const r = await sentRecipient();
    const sid = r.message_sid!;
    await applyStatusCallback(ORG, { MessageSid: sid, MessageStatus: 'read' });
    await applyStatusCallback(ORG, { MessageSid: sid, MessageStatus: 'delivered' });
    await applyStatusCallback(ORG, { MessageSid: sid, MessageStatus: 'sent' });
    const got = await outreachRepository.getRecipient(r.id, ORG);
    expect(got?.status).toBe('READ');
    expect(got?.delivered_at).toBeTruthy(); // read implica delivered
  });

  it('un fallo tardío no deshace una entrega ni una respuesta', async () => {
    const r = await sentRecipient();
    await applyStatusCallback(ORG, { MessageSid: r.message_sid!, MessageStatus: 'delivered' });
    await applyStatusCallback(ORG, { MessageSid: r.message_sid!, MessageStatus: 'failed' });
    expect((await outreachRepository.getRecipient(r.id, ORG))?.status).toBe('DELIVERED');

    await outreachRepository.updateRecipient(r.id, ORG, { status: 'REPLIED' });
    await applyStatusCallback(ORG, { MessageSid: r.message_sid!, MessageStatus: 'delivered' });
    await applyStatusCallback(ORG, { MessageSid: r.message_sid!, MessageStatus: 'read' });
    expect((await outreachRepository.getRecipient(r.id, ORG))?.status).toBe('REPLIED'); // READ < REPLIED
  });

  it('queued/accepted no cambian nada; SID desconocido (mensaje del bot) se ignora', async () => {
    const r = await sentRecipient();
    expect((await applyStatusCallback(ORG, { MessageSid: r.message_sid!, MessageStatus: 'queued' })).changed).toBe(false);
    expect(await applyStatusCallback(ORG, { MessageSid: 'SMdesconocido', MessageStatus: 'delivered' })).toEqual({ matched: false, changed: false });
    expect(await applyStatusCallback(ORG, {})).toEqual({ matched: false, changed: false });
  });

  it('un callback de otra organización no toca el destinatario', async () => {
    const r = await sentRecipient();
    expect(await applyStatusCallback(ORG_B, { MessageSid: r.message_sid!, MessageStatus: 'delivered' })).toMatchObject({ matched: false });
    expect((await outreachRepository.getRecipient(r.id, ORG))?.status).toBe('SENT');
  });
});

describe('Ruta /api/niupackbot/whatsapp/status', () => {
  const req = (params: Record<string, string>, signature: string | null) =>
    new Request(STATUS_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...(signature ? { 'x-twilio-signature': signature } : {}) }, body: JSON.stringify(params) });

  it('firma inválida o ausente => 403 y cero writes', async () => {
    const r = await sentRecipient();
    const params = { MessageSid: r.message_sid!, MessageStatus: 'delivered' };
    expect((await statusRoute(req(params, null))).status).toBe(403);
    expect((await statusRoute(req(params, 'firma-falsa'))).status).toBe(403);
    expect((await statusRoute(req(params, sign(STATUS_URL, params, 'otro_token')))).status).toBe(403);
    expect((await outreachRepository.getRecipient(r.id, ORG))?.status).toBe('SENT');
  });

  it('firma válida aplica el estado; el reintento de Twilio es idempotente', async () => {
    const r = await sentRecipient();
    const params = { MessageSid: r.message_sid!, MessageStatus: 'delivered' };
    const ok = await statusRoute(req(params, sign(STATUS_URL, params)));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ matched: true, changed: true });
    const retry = await statusRoute(req(params, sign(STATUS_URL, params)));
    expect(await retry.json()).toMatchObject({ matched: true, changed: false });
    expect((await outreachRepository.getRecipient(r.id, ORG))?.status).toBe('DELIVERED');
  });

  it('no crea conversaciones ni leads (no es el inbound)', async () => {
    const r = await sentRecipient();
    const params = { MessageSid: r.message_sid!, MessageStatus: 'read' };
    await statusRoute(req(params, sign(STATUS_URL, params)));
    expect(await crmRepository.listConversations(ORG)).toHaveLength(0);
    expect(await crmRepository.listLeads(ORG)).toHaveLength(0);
  });

  it('sin TWILIO_AUTH_TOKEN => 503', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    expect((await statusRoute(req({ MessageSid: 'SM1', MessageStatus: 'sent' }, 'x'))).status).toBe(503);
  });
});

describe('Middleware: endpoints de máquina', () => {
  const run = (path: string) => middleware(new NextRequest(`https://test.local${path}`, { method: 'POST' }));

  it('inbound, status callback y scheduler pasan sin sesión (se autentican solos)', async () => {
    for (const path of ['/api/niupackbot/whatsapp', '/api/niupackbot/whatsapp/status', '/api/niupackbot/campaigns/process']) {
      const res = await run(path);
      expect(res.headers.get('x-middleware-next'), path).toBe('1');
    }
  });

  it('el resto de /api sigue exigiendo sesión', async () => {
    for (const path of ['/api/crm/campaigns', '/api/crm/owners', '/api/niupackbot/whatsapp/otro', '/api/niupackbot/campaigns']) {
      const res = await run(path);
      expect(res.headers.get('x-middleware-next'), path).not.toBe('1');
      expect([401, 503]).toContain(res.status);
    }
  });
});
