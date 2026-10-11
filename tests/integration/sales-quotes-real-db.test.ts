/** Presupuestos a clientes y OT contra PostgreSQL real. Se omite salvo NIUPACK_QA_DB=1 y solo corre en localhost. */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.NIUPACK_QA_DB === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (enabled && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error(`Refusing to run real-DB tests against non-local Supabase: ${url}`);

describe.skipIf(!enabled)('presupuestos a clientes y OT sobre PostgreSQL real', () => {
  let svc: typeof import('@/lib/sales-quotes/service');
  let admin: NonNullable<typeof import('@/lib/db/supabase').supabaseAdmin>;
  const orgA = randomUUID(); const orgB = randomUUID();
  const analyst = randomUUID(); const viewer = randomUUID(); const outsider = randomUUID();
  let attrId: string; let companyId: string;

  /** El presupuesto del ejemplo: cada ítem con dos escalas y dos tapas con precio y sin cantidad. */
  const lines = () => [
    { item_no: 1, sku: 'VASO-120', product_attribute_id: attrId, description: 'Vaso de POLIPAPEL 120 ml, PE1 314g con impresión FULL COLOR', quantity: 1000, unit_price: 1100 },
    { item_no: 1, sku: 'VASO-120', description: 'Vaso de POLIPAPEL 120 ml, PE1 314g con impresión FULL COLOR', quantity: 5000, unit_price: 790 },
    { item_no: 2, description: 'Vaso de POLIPAPEL 180ml PE1 314g con impresión FULL COLOR', quantity: 1000, unit_price: 1150 },
    { item_no: 2, description: 'Vaso de POLIPAPEL 180ml PE1 314g con impresión FULL COLOR', quantity: 5000, unit_price: 840 },
    { item_no: 5, description: 'Tapa para vaso 240ml Material PS', quantity: null, unit_price: 250 },
  ];
  const header = (over: Record<string, unknown> = {}) => ({ client_name: 'NICOLAS BALADON', attention: 'NICOLAS BALADON', subject: 'potes de polipapel', payment_terms: 'A convenir', delivery_terms: 'A convenir', quote_date: '2026-10-08', currency: 'PYG', signer_name: 'Marcelo Echauri', signer_title: 'Gerente Comercial', signer_company: 'GARDINER S.A.', ...over });
  const draft = async (over: Record<string, unknown> = {}) => svc.saveQuote(orgA, analyst, { header: header(over), lines: lines() });

  beforeAll(async () => {
    svc = await import('@/lib/sales-quotes/service');
    admin = (await import('@/lib/db/supabase')).supabaseAdmin!;
    for (const [id, slug] of [[orgA, 'sq-a'], [orgB, 'sq-b']]) {
      const { error } = await admin.from('organizations').insert({ id, name: slug, slug: `${slug}-${id.slice(0, 8)}` });
      if (error) throw error;
    }
    for (const [id, org, role] of [[analyst, orgA, 'analyst'], [viewer, orgA, 'executive'], [outsider, orgB, 'admin']] as const) {
      const { error } = await admin.from('profiles').insert({ id, organization_id: org, email: `sq-${id}@qa.local`, full_name: `QA ${role}`, role });
      if (error) throw error;
    }
    const product = await admin.from('products').insert({ organization_id: orgA, code: `VP-${randomUUID().slice(0, 5)}`, name: 'Vaso polipapel', category: 'cups' }).select('id').single();
    if (product.error) throw product.error;
    const attr = await admin.from('product_attributes').insert({ product_id: product.data.id, sku: 'VASO-120', size_ml: 120, paper_weight_gsm: 314, material: 'paper', coating: 'PE1', wall_type: 'single' }).select('id').single();
    if (attr.error) throw attr.error;
    attrId = attr.data.id;
    const company = await admin.from('crm_companies').insert({ organization_id: orgA, name: 'Chellato S.A.' }).select('id').single();
    if (company.error) throw company.error;
    companyId = company.data.id;
  });

  it('importa SKU del catálogo y arma la descripción sugerida', async () => {
    const found = await svc.searchSkus(orgA, 'vaso-1');
    expect(found[0]).toMatchObject({ sku: 'VASO-120', description: 'Vaso polipapel · 120 ml · 314 g' });
    expect(await svc.searchSkus(orgB, 'vaso-1')).toHaveLength(0);
    expect((await svc.searchCompanies(orgA, 'chel')).map((c: any) => c.name)).toEqual(['Chellato S.A.']);
    expect(await svc.searchCompanies(orgB, 'chel')).toHaveLength(0);
  });

  it('crea el presupuesto con varias escalas por ítem, totales por línea y líneas sin cantidad', async () => {
    const created = await draft({ company_id: companyId });
    expect(created.code).toMatch(/^PRE-\d{4}$/);
    const { quote, lines: saved } = await svc.getQuote(orgA, created.id);
    expect(quote).toMatchObject({ status: 'BORRADOR', version: 1, client_name: 'NICOLAS BALADON', company_id: companyId, signer_company: 'GARDINER S.A.' });
    expect(saved.map((l: any) => [l.item_no, Number(l.quantity ?? 0), Number(l.line_total ?? 0)])).toEqual([[1, 1000, 1_100_000], [1, 5000, 3_950_000], [2, 1000, 1_150_000], [2, 5000, 4_200_000], [5, 0, 0]]);
    expect(saved[4].quantity).toBeNull();
    expect(saved[0].product_attribute_id).toBe(attrId);
    const second = await draft();
    expect(Number(second.code.slice(4))).toBe(Number(created.code.slice(4)) + 1);
  });

  it('valida: cliente, líneas, SKU ajeno, empresa ajena, escalas repetidas y rol', async () => {
    await expect(svc.saveQuote(orgA, analyst, { header: header({ client_name: '' }), lines: lines() })).rejects.toThrow();
    await expect(svc.saveQuote(orgA, analyst, { header: header(), lines: [] })).rejects.toThrow();
    await expect(svc.saveQuote(orgA, analyst, { header: header(), lines: [{ ...lines()[0], quantity: 0 }] })).rejects.toThrow();
    await expect(svc.saveQuote(orgA, analyst, { header: header(), lines: [lines()[0], lines()[0]] })).rejects.toMatchObject({ code: 'SQ_DUPLICATE_TIER' });
    await expect(svc.saveQuote(orgB, outsider, { header: header(), lines: lines() })).rejects.toMatchObject({ code: 'SQ_SKU_NOT_FOUND' });
    await expect(svc.saveQuote(orgA, analyst, { header: header({ company_id: randomUUID() }), lines: lines() })).rejects.toMatchObject({ code: 'SQ_COMPANY_NOT_FOUND' });
    await expect(svc.saveQuote(orgA, viewer, { header: header(), lines: lines() })).rejects.toMatchObject({ code: 'SQ_ACTOR_NOT_ALLOWED' });
    await expect(svc.saveQuote(orgA, outsider, { header: header(), lines: lines() })).rejects.toMatchObject({ code: 'SQ_ACTOR_NOT_ALLOWED' });
  });

  it('edita solo en borrador, reabrir sube la versión y conserva el historial', async () => {
    const q = await draft();
    await svc.saveQuote(orgA, analyst, { header: header({ client_name: 'CHELLATO' }), lines: lines().slice(0, 2) }, q.id);
    expect((await svc.getQuote(orgA, q.id)).lines).toHaveLength(2);
    await svc.transitionQuote(orgA, analyst, q.id, 'SEND');
    await expect(svc.saveQuote(orgA, analyst, { header: header(), lines: lines() }, q.id)).rejects.toMatchObject({ code: 'SQ_NOT_EDITABLE' });
    await expect(svc.transitionQuote(orgA, analyst, q.id, 'SEND')).rejects.toMatchObject({ code: 'SQ_INVALID_STATE' });
    await svc.transitionQuote(orgA, analyst, q.id, 'REOPEN');
    const reopened = await svc.getQuote(orgA, q.id);
    expect(reopened.quote).toMatchObject({ status: 'BORRADOR', version: 2, sent_at: null });
    expect(reopened.events.map((e: any) => e.event)).toEqual(expect.arrayContaining(['quote.created', 'quote.updated', 'quote.send', 'quote.reopen']));
    await expect(svc.saveQuote(orgB, outsider, { header: header(), lines: [{ item_no: 1, description: 'x', quantity: 1, unit_price: 1 }] }, q.id)).rejects.toMatchObject({ code: 'SQ_NOT_FOUND' });
  });

  it('rechazar y anular; el rechazo guarda el motivo', async () => {
    const q = await draft();
    await expect(svc.transitionQuote(orgA, analyst, q.id, 'REJECT')).rejects.toMatchObject({ code: 'SQ_INVALID_STATE' });
    await svc.transitionQuote(orgA, analyst, q.id, 'SEND');
    await svc.transitionQuote(orgA, analyst, q.id, 'REJECT', 'Precio fuera de presupuesto');
    expect((await svc.getQuote(orgA, q.id)).quote).toMatchObject({ status: 'RECHAZADO', rejection_reason: 'Precio fuera de presupuesto' });
    await svc.transitionQuote(orgA, analyst, q.id, 'VOID');
    expect((await svc.getQuote(orgA, q.id)).quote.status).toBe('ANULADO');
    await expect(svc.transitionQuote(orgA, analyst, q.id, 'REOPEN')).rejects.toMatchObject({ code: 'SQ_INVALID_STATE' });
  });

  it('Presupuesto → OT: acepta una escala por ítem y genera la OT con esas líneas, una sola vez', async () => {
    const q = await draft({ company_id: companyId });
    const all = (await svc.getQuote(orgA, q.id)).lines;
    await expect(svc.acceptQuote(orgA, analyst, q.id, [all[0].id], 'Nicolás Baladón')).rejects.toMatchObject({ code: 'SQ_INVALID_STATE' });
    await svc.transitionQuote(orgA, analyst, q.id, 'SEND');
    await expect(svc.acceptQuote(orgA, analyst, q.id, [all[0].id, all[1].id], 'Nicolás Baladón')).rejects.toMatchObject({ code: 'SQ_ACCEPT_ONE_TIER' });
    await expect(svc.acceptQuote(orgA, analyst, q.id, [all[4].id], 'Nicolás Baladón')).rejects.toMatchObject({ code: 'SQ_ACCEPT_LINES_INVALID' });
    await expect(svc.acceptQuote(orgA, analyst, q.id, [all[0].id], '  ')).rejects.toMatchObject({ code: 'SQ_ACCEPTOR_REQUIRED' });
    await expect(svc.acceptQuote(orgA, analyst, q.id, [randomUUID()], 'X')).rejects.toMatchObject({ code: 'SQ_ACCEPT_LINES_INVALID' });
    await expect(svc.acceptQuote(orgB, outsider, q.id, [all[0].id], 'X')).rejects.toMatchObject({ code: 'SQ_NOT_FOUND' });
    await expect(svc.acceptQuote(orgA, viewer, q.id, [all[0].id], 'X')).rejects.toMatchObject({ code: 'SQ_ACTOR_NOT_ALLOWED' });

    const done = await svc.acceptQuote(orgA, analyst, q.id, [all[1].id, all[2].id], 'Nicolás Baladón', 'Aceptó por WhatsApp');
    expect(done.work_order_code).toMatch(/^OT-\d{4}$/);
    const wo = await svc.getWorkOrder(orgA, done.work_order_id);
    expect(wo.work_order).toMatchObject({ status: 'PENDIENTE', client_name: 'NICOLAS BALADON', company_id: companyId, quote_version: 1, notes: 'Aceptó por WhatsApp' });
    expect(wo.items.map((i: any) => [i.item_no, Number(i.quantity), Number(i.unit_price), Number(i.line_total)])).toEqual([[1, 5000, 790, 3_950_000], [2, 1000, 1150, 1_150_000]]);
    const accepted = await svc.getQuote(orgA, q.id);
    expect(accepted.quote).toMatchObject({ status: 'ACEPTADO', accepted_by_name: 'Nicolás Baladón' });
    expect(accepted.work_order).toMatchObject({ code: done.work_order_code });
    // No se puede aceptar dos veces ni editar uno aceptado
    await expect(svc.acceptQuote(orgA, analyst, q.id, [all[0].id], 'Otra vez')).rejects.toMatchObject({ code: 'SQ_INVALID_STATE' });
    await expect(svc.transitionQuote(orgA, analyst, q.id, 'VOID')).rejects.toMatchObject({ code: 'SQ_INVALID_STATE' });
    expect((await admin.from('sales_work_orders').select('id').eq('quote_id', q.id)).data).toHaveLength(1);
    // Aislamiento de la OT
    await expect(svc.getWorkOrder(orgB, done.work_order_id)).rejects.toMatchObject({ status: 404 });
    expect((await svc.listWorkOrders(orgB))).toHaveLength(0);
    expect((await svc.listWorkOrders(orgA)).map((w: any) => w.code)).toContain(done.work_order_code);
  });

  it('estados de la OT: avanza y se cierra', async () => {
    const q = await draft();
    const line = (await svc.getQuote(orgA, q.id)).lines[0];
    await svc.transitionQuote(orgA, analyst, q.id, 'SEND');
    const { work_order_id } = await svc.acceptQuote(orgA, analyst, q.id, [line.id], 'Cliente');
    await svc.setWorkOrderStatus(orgA, analyst, work_order_id, 'EN_CURSO');
    await expect(svc.setWorkOrderStatus(orgA, analyst, work_order_id, 'INVENTADO')).rejects.toMatchObject({ code: 'SQ_INVALID_STATE' });
    await expect(svc.setWorkOrderStatus(orgA, viewer, work_order_id, 'COMPLETADA')).rejects.toMatchObject({ code: 'SQ_ACTOR_NOT_ALLOWED' });
    await svc.setWorkOrderStatus(orgA, analyst, work_order_id, 'COMPLETADA');
    await expect(svc.setWorkOrderStatus(orgA, analyst, work_order_id, 'EN_CURSO')).rejects.toMatchObject({ code: 'SQ_INVALID_STATE' });
  });

  it('un presupuesto vencido no se puede aceptar', async () => {
    const q = await draft({ valid_until: '2020-01-01' });
    const line = (await svc.getQuote(orgA, q.id)).lines[0];
    await svc.transitionQuote(orgA, analyst, q.id, 'SEND');
    await expect(svc.acceptQuote(orgA, analyst, q.id, [line.id], 'Cliente')).rejects.toMatchObject({ code: 'SQ_EXPIRED' });
  });

  it('lista con filtros y aislamiento; recuerda la última firma y condiciones', async () => {
    const mine = await svc.listQuotes(orgA);
    expect(mine.length).toBeGreaterThan(4);
    expect(mine[0]).toMatchObject({ lines: expect.any(Number) });
    expect((await svc.listQuotes(orgA, { status: 'ACEPTADO' })).every((q: any) => q.status === 'ACEPTADO')).toBe(true);
    expect((await svc.listQuotes(orgA, { q: 'baladon' })).length).toBeGreaterThan(0);
    expect(await svc.listQuotes(orgB)).toHaveLength(0);
    await expect(svc.getQuote(orgB, mine[0].id)).rejects.toMatchObject({ code: 'SQ_NOT_FOUND', status: 404 });
    expect(await svc.getQuoteDefaults(orgA, analyst)).toMatchObject({ signer_name: 'Marcelo Echauri', signer_title: 'Gerente Comercial', signer_company: 'GARDINER S.A.' });
  });
});
