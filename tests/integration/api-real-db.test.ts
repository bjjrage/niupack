/**
 * Pruebas de API (handlers de rutas Next) contra PostgreSQL real. Solo se controla la IDENTIDAD de sesión
 * (rol y organización); la base, las RPC y las reglas son reales. El correo es un transporte controlado.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTextPdf } from '../helpers/make-pdf';

const enabled = process.env.NIUPACK_QA_DB === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (enabled && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error(`Refusing to run real-DB tests against non-local Supabase: ${url}`);

const session = { current: null as null | { userId: string; organizationId: string; profileId: string; role: string; email: string } };
vi.mock('@/lib/auth/identity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/identity')>();
  return {
    ...actual,
    requireNiuIdentity: async () => {
      if (!session.current) throw new actual.NiuAuthError('AUTH_REQUIRED', 401);
      return session.current;
    },
  };
});

const sent: Array<{ to: string; subject: string; text: string }> = [];
const mailState = { configured: true };
vi.mock('@/lib/rfq/mailer', () => ({
  smtpMailer: {
    isConfigured: async () => mailState.configured,
    send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); return { success: true, messageId: '<api-test@local>' }; },
  },
  publicBaseUrl: () => 'http://localhost:3200',
}));

const json = (body: unknown, method = 'POST') => new Request('http://localhost:3200/api/test', method === 'GET' ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

describe.skipIf(!enabled)('APIs de Licitaciones y RFQ sobre PostgreSQL real', () => {
  let admin: NonNullable<typeof import('@/lib/db/supabase').supabaseAdmin>;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const ids = { adminA: randomUUID(), analystA: randomUUID(), operatorA: randomUUID(), executiveA: randomUUID(), adminB: randomUUID() };
  const as = (profile: keyof typeof ids, org: string, role: string) => { session.current = { userId: randomUUID(), organizationId: org, profileId: ids[profile], role, email: `${profile}@qa.local` }; };
  const supplier: Record<string, string> = {};

  beforeAll(async () => {
    admin = (await import('@/lib/db/supabase')).supabaseAdmin!;
    for (const [id, slug] of [[orgA, 'api-a'], [orgB, 'api-b']]) {
      const { error } = await admin.from('organizations').insert({ id, name: slug, slug: `${slug}-${id.slice(0, 8)}` });
      if (error) throw error;
    }
    const rows: Array<[string, string, string]> = [[ids.adminA, orgA, 'admin'], [ids.analystA, orgA, 'analyst'], [ids.operatorA, orgA, 'operator'], [ids.executiveA, orgA, 'executive'], [ids.adminB, orgB, 'admin']];
    for (const [id, org, role] of rows) {
      const { error } = await admin.from('profiles').insert({ id, organization_id: org, email: `${id}@qa.local`, full_name: role, role });
      if (error) throw error;
    }
    for (const [key, org, name] of [['a1', orgA, 'Prov API Uno'], ['a2', orgA, 'Prov API Dos'], ['b1', orgB, 'Prov Otra Org']] as const) {
      const { data, error } = await admin.from('suppliers').insert({ organization_id: org, name, email: `${key}@api.qa.test`, country_code: 'BR', status: 'APPROVED_FOR_CONTACT' }).select('id').single();
      if (error) throw error;
      supplier[key] = data!.id;
    }
  });

  beforeEach(() => { session.current = null; mailState.configured = true; });

  describe('autenticación, roles y organización', () => {
    it('sin sesión: 401 en todas las rutas de RFQ y Licitaciones', async () => {
      const rfqs = await import('@/app/api/rfq/rfqs/route');
      const lic = await import('@/app/api/licitaciones/route');
      const imp = await import('@/app/api/licitaciones/import/route');
      const cmp = await import('@/app/api/rfq/rfqs/[id]/comparison/route');
      expect((await rfqs.GET()).status).toBe(401);
      expect((await rfqs.POST(json({}))).status).toBe(401);
      expect((await lic.GET()).status).toBe(401);
      expect((await imp.POST(json({}))).status).toBe(401);
      expect((await cmp.GET(json({}, 'GET'), ctx({ id: randomUUID() }))).status).toBe(401);
    });

    it('operador: 403 para leer o escribir; ejecutivo: solo lectura; analista: escritura', async () => {
      const rfqs = await import('@/app/api/rfq/rfqs/route');
      const lic = await import('@/app/api/licitaciones/route');
      const body = { title: 'Rol', delivery_destination: 'Asunción', incoterm: 'FOB', items: [{ sku: 'R', quantity: 1 }] };
      as('operatorA', orgA, 'operator');
      expect((await rfqs.GET()).status).toBe(403);
      expect((await rfqs.POST(json(body))).status).toBe(403);
      expect((await lic.GET()).status).toBe(403);
      as('executiveA', orgA, 'executive');
      expect((await rfqs.GET()).status).toBe(200);
      expect((await rfqs.POST(json(body))).status).toBe(403);
      as('analystA', orgA, 'analyst');
      expect((await rfqs.POST(json(body))).status).toBe(201);
    });

    it('la organización sale de la sesión: un organization_id en el body se ignora', async () => {
      const rfqs = await import('@/app/api/rfq/rfqs/route');
      as('analystA', orgA, 'analyst');
      const res = await rfqs.POST(json({ title: 'Intento cruzado', delivery_destination: 'Asunción', incoterm: 'FOB', organization_id: orgB, items: [{ sku: 'S-1', quantity: 5 }] }));
      expect(res.status).toBe(201);
      const { rfq_id } = await res.json();
      const { data } = await admin.from('rfqs').select('organization_id').eq('id', rfq_id).single();
      expect(data!.organization_id).toBe(orgA);
      as('adminB', orgB, 'admin');
      const list = await (await rfqs.GET()).json();
      expect(list.rfqs.map((r: { id: string }) => r.id)).not.toContain(rfq_id);
      const detail = await import('@/app/api/rfq/rfqs/[id]/route');
      expect((await detail.GET(json({}, 'GET'), ctx({ id: rfq_id }))).status).toBe(404);
    });

    it('datos inválidos devuelven 400 con detalle, nunca 200', async () => {
      const rfqs = await import('@/app/api/rfq/rfqs/route');
      as('analystA', orgA, 'analyst');
      const res = await rfqs.POST(json({ title: 'x', delivery_destination: '', incoterm: 'XYZ', items: [] }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('INVALID_REQUEST');
    });
  });

  describe('RFQ: invitaciones, enlace externo y decisión por API', () => {
    let rfqId = '';
    let itemId = '';
    let token = '';
    let dispatchId = '';

    it('prepara, exige confirmación, respeta SMTP no configurado y envía solo con confirmación', async () => {
      const rfqs = await import('@/app/api/rfq/rfqs/route');
      const dispatch = await import('@/app/api/rfq/rfqs/[id]/dispatch/route');
      const detailRoute = await import('@/app/api/rfq/rfqs/[id]/route');
      as('analystA', orgA, 'analyst');
      const created = await (await rfqs.POST(json({ title: 'API flujo', delivery_destination: 'Asunción', incoterm: 'FOB', items: [{ sku: 'API-SKU', quantity: 1000 }] }))).json();
      rfqId = created.rfq_id;
      itemId = (await (await detailRoute.GET(json({}, 'GET'), ctx({ id: rfqId }))).json()).items[0].id;

      const prep = await dispatch.POST(json({ mode: 'prepare', invitations: [{ supplier_id: supplier.a1 }] }), ctx({ id: rfqId }));
      expect(prep.status).toBe(200);
      dispatchId = (await prep.json()).invitations[0].dispatch_id;
      expect(sent).toHaveLength(0);

      expect((await dispatch.POST(json({ mode: 'send', dispatch_ids: [dispatchId], confirm: false }), ctx({ id: rfqId }))).status).toBe(400);
      mailState.configured = false;
      const noSmtp = await dispatch.POST(json({ mode: 'send', dispatch_ids: [dispatchId], confirm: true }), ctx({ id: rfqId }));
      expect(noSmtp.status).toBe(503);
      expect((await noSmtp.json()).error).toBe('SMTP_NOT_CONFIGURED');
      expect(sent).toHaveLength(0);
      mailState.configured = true;

      // Un proveedor de otra organización no se puede invitar.
      const cross = await dispatch.POST(json({ mode: 'prepare', invitations: [{ supplier_id: supplier.b1 }] }), ctx({ id: rfqId }));
      expect(cross.status).toBe(404);

      const ok = await dispatch.POST(json({ mode: 'send', dispatch_ids: [dispatchId], confirm: true }), ctx({ id: rfqId }));
      expect(ok.status).toBe(200);
      expect((await ok.json()).sent).toBe(1);
      expect(sent).toHaveLength(1);
      token = /\/rfq\/respond\/([A-Za-z0-9_-]{43})/.exec(sent[0].text)![1];
    });

    it('la ruta pública no necesita sesión, valida el token y no filtra datos internos', async () => {
      const route = await import('@/app/api/rfq/public/[token]/route');
      session.current = null; // proveedor externo: sin cuenta del OS
      const view = await route.GET(json({}, 'GET'), ctx({ token }));
      expect(view.status).toBe(200);
      const body = JSON.stringify(await view.json());
      for (const secret of [orgA, orgB, 'organization_id', 'Prov API Dos', 'true_unit_cost', 'a1@api.qa.test']) expect(body).not.toContain(secret);
      expect((await route.GET(json({}, 'GET'), ctx({ token: 'x'.repeat(43) }))).status).toBe(404);

      const payload = { submitted_by_label: 'Proveedor API', currency: 'USD', incoterm: 'FOB', fx_rate_to_usd: 999, organization_id: orgB, items: [{ rfq_item_id: itemId, unit_price: 0.06, technical_compliance: 'COMPLIES' }] };
      const res = await route.POST(json(payload), ctx({ token }));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ received: true, version: 1 }); // la respuesta no revela IDs internos
      const { data } = await admin.from('supplier_quotes').select('organization_id, fx_rate_to_usd').eq('rfq_id', rfqId).single();
      expect(data).toEqual({ organization_id: orgA, fx_rate_to_usd: null });
      expect((await route.POST(json({ ...payload, items: [] }), ctx({ token }))).status).toBe(400);
    });

    it('el enlace revocado deja de funcionar y un proveedor no puede usar el token de otro', async () => {
      const route = await import('@/app/api/rfq/public/[token]/route');
      const revoke = await import('@/app/api/rfq/dispatches/[id]/revoke/route');
      as('operatorA', orgA, 'operator');
      expect((await revoke.POST(json({}), ctx({ id: dispatchId }))).status).toBe(403);
      as('adminB', orgB, 'admin');
      expect((await revoke.POST(json({}), ctx({ id: dispatchId }))).status).toBe(404); // otra organización no la ve
      as('analystA', orgA, 'analyst');
      expect((await revoke.POST(json({}), ctx({ id: dispatchId }))).status).toBe(200);
      session.current = null;
      const gone = await route.GET(json({}, 'GET'), ctx({ token }));
      expect(gone.status).toBe(410);
      expect((await gone.json()).error).toBe('RFQ_LINK_REVOKED');
    });

    it('comparador y decisión: solo analista/admin deciden; ejecutivo lee; el historial queda', async () => {
      const comparison = await import('@/app/api/rfq/rfqs/[id]/comparison/route');
      const decisions = await import('@/app/api/rfq/rfqs/[id]/decisions/route');
      const detailRoute = await import('@/app/api/rfq/rfqs/[id]/route');
      as('executiveA', orgA, 'executive');
      const cmp = await (await comparison.GET(json({}, 'GET'), ctx({ id: rfqId }))).json();
      expect(cmp.items[0].offers).toHaveLength(1);
      expect(cmp.items[0].cost_sheet.available).toBe(false);
      const quoteId = cmp.items[0].offers[0].quote_id;
      const body = { quote_id: quoteId, rfq_item_id: itemId, decision: 'SELECTED', rationale: 'Decisión de prueba por API' };
      expect((await decisions.POST(json(body), ctx({ id: rfqId }))).status).toBe(403);
      as('adminB', orgB, 'admin');
      expect((await decisions.POST(json(body), ctx({ id: rfqId }))).status).toBe(404);
      as('analystA', orgA, 'analyst');
      expect((await decisions.POST(json({ ...body, rationale: 'x' }), ctx({ id: rfqId }))).status).toBe(400);
      expect((await decisions.POST(json(body), ctx({ id: rfqId }))).status).toBe(201);
      const detail = await (await detailRoute.GET(json({}, 'GET'), ctx({ id: rfqId }))).json();
      expect(detail.decisions).toHaveLength(1);
      expect(detail.rfq.status).toBe('DECIDED');
    });

    it('PDF: se sube, se extrae y queda sin validar; un archivo no PDF o enorme se rechaza', async () => {
      const docs = await import('@/app/api/rfq/rfqs/[id]/documents/route');
      const download = await import('@/app/api/rfq/documents/[id]/route');
      as('analystA', orgA, 'analyst');
      const pdf = makeTextPdf(['Moneda: USD', 'Incoterm: FOB', 'API-SKU precio unitario 0,0550']);
      const form = new FormData();
      form.set('supplier_id', supplier.a2);
      form.set('file', new File([Buffer.from(pdf)], 'oferta.pdf', { type: 'application/pdf' }));
      const res = await docs.POST(new Request('http://localhost:3200/x', { method: 'POST', body: form }), ctx({ id: rfqId }));
      expect(res.status).toBe(201);
      const out = await res.json();
      expect(out.extraction.needs_human_validation).toBe(true);
      expect(out.extraction.items[0].unit_price.value).toBe(0.055);
      const file = await download.GET(json({}, 'GET'), ctx({ id: out.document_id }));
      expect(file.headers.get('content-type')).toBe('application/pdf');
      expect(file.headers.get('cache-control')).toMatch(/no-store/);
      as('adminB', orgB, 'admin');
      expect((await download.GET(json({}, 'GET'), ctx({ id: out.document_id }))).status).toBe(404);

      as('analystA', orgA, 'analyst');
      const bad = new FormData();
      bad.set('supplier_id', supplier.a2);
      bad.set('file', new File(['no soy un pdf'], 'x.pdf', { type: 'application/pdf' }));
      expect((await docs.POST(new Request('http://localhost:3200/x', { method: 'POST', body: bad }), ctx({ id: rfqId }))).status).toBe(400);
    });
  });

  describe('rutas retiradas y estados honestos', () => {
    it('descubrimiento, sincronización de Gmail y matcher no devuelven resultados inventados', async () => {
      const discovery = await import('@/app/api/rfq/discovery/route');
      const sync = await import('@/app/api/rfq/inbox/sync/route');
      const matcher = await import('@/app/api/market/quote-matcher/route');
      as('analystA', orgA, 'analyst');
      expect((await discovery.POST()).status).toBe(501);
      expect((await sync.POST()).status).toBe(501);
      expect((await matcher.POST()).status).toBe(410);
      session.current = null;
      expect((await discovery.POST()).status).toBe(401);
    });
  });

  describe('Licitaciones por API', () => {
    const fixture = (ocid: string) => readFileSync(`tests/fixtures/dncp/${ocid}.json`, 'utf8');
    let candidateId = '';

    it('importa por número usando la respuesta oficial de DNCP (conectividad simulada con datos reales) y por documento OCDS', async () => {
      const imp = await import('@/app/api/licitaciones/import/route');
      as('analystA', orgA, 'analyst');
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = String(input);
        if (target.includes('contrataciones.gov.py') && target.includes('ocds-03ad3f-341163-1')) return new Response(fixture('ocds-03ad3f-341163-1'), { status: 200 });
        return realFetch(input, init);
      }) as typeof fetch;
      try {
        const res = await imp.POST(json({ mode: 'dncp', identifier: '341163' }));
        expect(res.status).toBe(200);
        expect((await res.json()).external_id).toBe('ocds-03ad3f-341163-1');
      } finally { globalThis.fetch = realFetch; }
      const doc = await imp.POST(json({ mode: 'ocds_document', document: fixture('ocds-03ad3f-402876-1'), is_test_data: false }));
      expect(doc.status).toBe(200);
      expect((await imp.POST(json({ mode: 'ocds_document', document: 'no es json' }))).status).toBe(400);
      expect((await imp.POST(json({ mode: 'dncp', identifier: '???' }))).status).toBe(400);
    });

    it('si DNCP no responde la API informa 502 y no inventa licitaciones', async () => {
      const imp = await import('@/app/api/licitaciones/import/route');
      as('analystA', orgA, 'analyst');
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () => { throw new Error('ECONNREFUSED'); }) as typeof fetch;
      try {
        const res = await imp.POST(json({ mode: 'dncp', identifier: '999999' }));
        expect(res.status).toBe(502);
        expect((await res.json()).error).toBe('DNCP_UNREACHABLE');
      } finally { globalThis.fetch = realFetch; }
      const lic = await import('@/app/api/licitaciones/route');
      const list = await (await lic.GET()).json();
      expect(list.tenders.some((t: { external_id: string }) => t.external_id.includes('999999'))).toBe(false);
    });

    it('revisión, conversión (con roles), idempotencia y aislamiento por organización', async () => {
      const lic = await import('@/app/api/licitaciones/route');
      const review = await import('@/app/api/licitaciones/candidates/[id]/review/route');
      const convert = await import('@/app/api/licitaciones/candidates/[id]/convert/route');
      as('analystA', orgA, 'analyst');
      const list = await (await lic.GET()).json();
      candidateId = list.candidates.find((c: { ruc_digits: string }) => c.ruc_digits === '800019164').id;

      expect((await convert.POST(json({}), ctx({ id: candidateId }))).status).toBe(409); // sin revisar
      as('executiveA', orgA, 'executive');
      expect((await review.POST(json({ decision: 'APROBADA' }), ctx({ id: candidateId }))).status).toBe(403);
      as('adminB', orgB, 'admin');
      expect((await review.POST(json({ decision: 'APROBADA' }), ctx({ id: candidateId }))).status).toBe(404);
      as('analystA', orgA, 'analyst');
      expect((await review.POST(json({ decision: 'APROBADA', note: 'ok' }), ctx({ id: candidateId }))).status).toBe(200);
      as('executiveA', orgA, 'executive');
      expect((await convert.POST(json({}), ctx({ id: candidateId }))).status).toBe(403);
      as('analystA', orgA, 'analyst');
      const first = await convert.POST(json({ create_opportunity: true }), ctx({ id: candidateId }));
      expect(first.status).toBe(200);
      const a = await first.json();
      const second = await (await convert.POST(json({ create_opportunity: true }), ctx({ id: candidateId }))).json();
      expect(second).toMatchObject({ company_id: a.company_id, already_converted: true });
      const { data } = await admin.from('crm_companies').select('lifecycle_stage').eq('id', a.company_id).single();
      expect(data!.lifecycle_stage).toBe('PROSPECT');
    });
  });
});
