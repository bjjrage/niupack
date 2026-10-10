/**
 * RFQ Intelligence contra PostgreSQL + PostgREST reales (sin mocks de base de datos).
 * El correo usa un transporte controlado en memoria: NINGÚN correo real sale de estas pruebas.
 * Se omite salvo NIUPACK_QA_DB=1 y se niega a correr fuera de localhost.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeTextPdf } from '../helpers/make-pdf';

const enabled = process.env.NIUPACK_QA_DB === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (enabled && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
  throw new Error(`Refusing to run real-DB tests against non-local Supabase: ${url}`);
}

describe.skipIf(!enabled)('RFQ Intelligence sobre PostgreSQL real', () => {
  let svc: typeof import('@/lib/rfq/service');
  let admin: NonNullable<typeof import('@/lib/db/supabase').supabaseAdmin>;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const analystA = randomUUID();
  const analystB = randomUUID();
  const supplierIds: Record<string, string> = {};
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const goodMailer = { isConfigured: async () => true, send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); return { success: true, messageId: `<qa-${sent.length}@local>` }; } };
  const unconfiguredMailer = { isConfigured: async () => false, send: async () => { throw new Error('no debería intentar enviar'); } };
  const failingMailer = { isConfigured: async () => true, send: async () => ({ success: false, error: 'SMTP 421 temporarily unavailable' }) };

  let rfqId = '';
  let thirdSupplierId = '';
  let itemIds: string[] = [];
  const dispatchBySupplier: Record<string, string> = {};
  const tokenFor = async (dispatchId: string) => {
    const { data } = await admin.from('rfq_supplier_dispatches').select('body_text').eq('id', dispatchId).single();
    return /\/rfq\/respond\/([A-Za-z0-9_-]{43})/.exec(data!.body_text as string)![1];
  };
  const quote = (price1: number, price2: number, over: object = {}) => ({
    currency: 'USD', incoterm: 'FOB' as const, payment_terms: '30 días', lead_time_days: 30, validity_date: '2099-12-31',
    items: [
      { rfq_item_id: itemIds[0], unit_price: price1, moq: 20000, technical_compliance: 'COMPLIES' as const, price_scales: [] },
      { rfq_item_id: itemIds[1], unit_price: price2, moq: 20000, technical_compliance: 'COMPLIES' as const, price_scales: [] },
    ],
    ...over,
  });

  beforeAll(async () => {
    svc = await import('@/lib/rfq/service');
    admin = (await import('@/lib/db/supabase')).supabaseAdmin!;
    for (const [id, slug] of [[orgA, 'rfq-a'], [orgB, 'rfq-b']]) {
      const { error } = await admin.from('organizations').insert({ id, name: slug, slug: `${slug}-${id.slice(0, 8)}` });
      if (error) throw error;
    }
    for (const [id, org] of [[analystA, orgA], [analystB, orgB]] as const) {
      const { error } = await admin.from('profiles').insert({ id, organization_id: org, email: `rfq-${id}@qa.local`, full_name: 'QA Analista', role: 'analyst' });
      if (error) throw error;
    }
    const rows = [
      { key: 'A1', org: orgA, name: 'Proveedor Uno SA', email: 'ventas@uno.qa.test', country: 'BR' },
      { key: 'A2', org: orgA, name: 'Proveedor Dos SA', email: 'sales@dos.qa.test', country: 'AR' },
      { key: 'B1', org: orgB, name: 'Proveedor de Otra Org', email: 'x@otra.qa.test', country: 'BR' },
    ];
    for (const r of rows) {
      const { data, error } = await admin.from('suppliers').insert({ organization_id: r.org, name: r.name, email: r.email, country_code: r.country, status: 'APPROVED_FOR_CONTACT' }).select('id').single();
      if (error) throw error;
      supplierIds[r.key] = data!.id;
    }
    // Hoja de costos vigente solo para el primer SKU.
    const product = await admin.from('products').insert({ organization_id: orgA, code: 'CUNA-AMP-2ML', name: 'Cuna ampolla 2 ml', category: 'trays' }).select('id').single();
    if (product.error) throw product.error;
    const attrs = await admin.from('product_attributes').insert({ product_id: product.data!.id, sku: 'CUNA-AMP-2ML', material: 'plastic', coating: 'none', wall_type: 'single' });
    if (attrs.error) throw attrs.error;
    const sheet = await admin.from('cost_sheet_versions').insert({ organization_id: orgA, product_id: product.data!.id, sku: 'CUNA-AMP-2ML', version: 2, name: 'Hoja vigente QA', status: 'ACTIVE', true_unit_cost_usd: 0.04 });
    if (sheet.error) throw sheet.error;
  });

  it('crea una RFQ de dos ítems con código generado por el servidor, único por organización', async () => {
    const created = await svc.createRfq(orgA, analystA, {
      title: 'Cunas para ampollas', delivery_destination: 'Asunción, Paraguay', incoterm: 'FOB', payment_terms: '30 días',
      items: [
        { sku: 'CUNA-AMP-2ML', description: 'Cuna 2 ml', quantity: 100000, unit: 'UN', alternative_quantities: [50000, 200000], material: 'PVC cristal', specs: { espesor_mm: 0.3 }, technical_conditions: 'Grado farmacéutico', printing_spec: undefined, packaging_spec: undefined, tooling_requirements: undefined, notes: undefined },
        { sku: 'CUNA-AMP-5ML', description: 'Cuna 5 ml', quantity: 50000, unit: 'UN', alternative_quantities: [], specs: {}, material: undefined, printing_spec: undefined, packaging_spec: undefined, tooling_requirements: undefined, technical_conditions: undefined, notes: undefined },
      ],
    });
    rfqId = created.rfq_id;
    expect(created.code).toMatch(/^RFQ-\d{4}-001$/);
    const second = await svc.createRfq(orgA, analystA, { title: 'Segunda', delivery_destination: 'Asunción', incoterm: 'CIF', items: [{ sku: 'X-1', quantity: 10, unit: 'UN', alternative_quantities: [], specs: {} }] });
    expect(second.code).toMatch(/-002$/);
    await expect(svc.createRfq(orgA, analystA, { code: second.code, title: 'Duplicada', delivery_destination: 'X', incoterm: 'FOB', items: [{ sku: 'X-1', quantity: 10, unit: 'UN', alternative_quantities: [], specs: {} }] })).rejects.toMatchObject({ code: 'RFQ_CODE_ALREADY_EXISTS' });
    // Otra organización puede usar el mismo código.
    const other = await svc.createRfq(orgB, analystB, { code: second.code, title: 'Otra org', delivery_destination: 'X', incoterm: 'FOB', items: [{ sku: 'X-1', quantity: 10, unit: 'UN', alternative_quantities: [], specs: {} }] });
    expect(other.code).toBe(second.code);

    const detail = await svc.getRfqDetail(orgA, rfqId);
    itemIds = detail.items.map((i: any) => i.id);
    expect(detail.items).toHaveLength(2);
    expect(detail.items[0]).toMatchObject({ line_no: 1, sku: 'CUNA-AMP-2ML', quantity: 100000, alternative_quantities: [50000, 200000], specs: { espesor_mm: 0.3 } });
    expect(detail.items[0].product_id).toBeTruthy(); // vinculado al maestro de productos por SKU
    expect(detail.items[1].product_id).toBeNull();
    expect(detail.rfq.status).toBe('DRAFT');
  });

  it('rechaza RFQ inválidas sin éxito falso', async () => {
    await expect(svc.createRfq(orgA, analystA, { title: 'Sin ítems', delivery_destination: 'X', incoterm: 'FOB', items: [] } as never)).rejects.toThrow();
    await expect(svc.createRfq(randomUUID(), analystA, { title: 'Org inexistente', delivery_destination: 'X', incoterm: 'FOB', items: [{ sku: 'X', quantity: 1, unit: 'UN', alternative_quantities: [], specs: {} }] })).rejects.toThrow();
  });

  it('prepara invitaciones para dos proveedores del maestro, con enlace propio y sin enviar nada', async () => {
    const results = await svc.prepareInvitations(orgA, analystA, rfqId, { ttl_days: 14, invitations: [{ supplier_id: supplierIds.A1 }, { supplier_id: supplierIds.A2, recipient_email: 'compras@dos.qa.test' }] }, 'http://localhost:3200');
    expect(results.map((r) => r.status)).toEqual(['PREPARED', 'PREPARED']);
    for (const r of results) dispatchBySupplier[r.supplier_id] = r.dispatch_id;
    const detail = await svc.getRfqDetail(orgA, rfqId);
    expect(detail.dispatches.map((d: any) => d.status)).toEqual(['PREPARED', 'PREPARED']);
    expect(detail.dispatches.find((d: any) => d.supplier_id === supplierIds.A2)?.recipient_email).toBe('compras@dos.qa.test');
    expect(detail.rfq.status).toBe('APPROVED'); // preparado, NO enviado
    expect(sent).toHaveLength(0);
    // Solo se guarda el hash del token.
    const { data } = await admin.from('rfq_supplier_dispatches').select('token_hash, body_text').eq('id', dispatchBySupplier[supplierIds.A1]).single();
    expect(data!.token_hash).toHaveLength(64);
    expect(data!.body_text).not.toContain(data!.token_hash);
    expect(data!.body_text).toContain('/rfq/respond/');
    // Proveedor de otra organización: rechazado.
    await expect(svc.prepareInvitations(orgA, analystA, rfqId, { ttl_days: 7, invitations: [{ supplier_id: supplierIds.B1 }] }, 'http://localhost:3200')).rejects.toMatchObject({ code: 'SUPPLIER_NOT_FOUND' });
    // Proveedor sin correo válido: rechazado.
    const noMail = await admin.from('suppliers').insert({ organization_id: orgA, name: 'Sin correo', country_code: 'PY', status: 'DISCOVERED' }).select('id').single();
    await expect(svc.prepareInvitations(orgA, analystA, rfqId, { ttl_days: 7, invitations: [{ supplier_id: noMail.data!.id }] }, 'http://localhost:3200')).rejects.toMatchObject({ code: 'SUPPLIER_EMAIL_REQUIRED' });
  });

  it('el envío exige confirmación humana y, sin SMTP, deja todo pendiente explicando el motivo', async () => {
    const ids = Object.values(dispatchBySupplier);
    await expect(svc.sendInvitations(orgA, analystA, rfqId, ids, false, goodMailer)).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    await expect(svc.sendInvitations(orgA, analystA, rfqId, ids, true, unconfiguredMailer)).rejects.toMatchObject({ code: 'SMTP_NOT_CONFIGURED', status: 503 });
    const detail = await svc.getRfqDetail(orgA, rfqId);
    expect(detail.dispatches.every((d: any) => d.status === 'PREPARED' && d.last_error === 'SMTP_NOT_CONFIGURED')).toBe(true);
    expect(detail.rfq.status).toBe('APPROVED');
    expect(sent).toHaveLength(0);
  });

  it('un fallo SMTP deja FALLIDO (no enviado) y el reintento no duplica correos', async () => {
    const single = await svc.createRfq(orgA, analystA, { title: 'Reintento', delivery_destination: 'X', incoterm: 'FOB', items: [{ sku: 'R-1', quantity: 5, unit: 'UN', alternative_quantities: [], specs: {} }] });
    const [prepared] = await svc.prepareInvitations(orgA, analystA, single.rfq_id, { ttl_days: 7, invitations: [{ supplier_id: supplierIds.A1 }] }, 'http://localhost:3200');
    const failed = await svc.sendInvitations(orgA, analystA, single.rfq_id, [prepared.dispatch_id], true, failingMailer);
    expect(failed[0]).toMatchObject({ status: 'FAILED', error: expect.stringContaining('421') });
    let detail = await svc.getRfqDetail(orgA, single.rfq_id);
    expect(detail.dispatches[0]).toMatchObject({ status: 'FAILED', send_attempts: 1 });
    expect(detail.rfq.status).toBe('APPROVED'); // nunca SENT si no salió
    const before = sent.length;
    const retry = await svc.sendInvitations(orgA, analystA, single.rfq_id, [prepared.dispatch_id], true, goodMailer);
    expect(retry[0].status).toBe('SENT');
    expect(sent.length).toBe(before + 1);
    detail = await svc.getRfqDetail(orgA, single.rfq_id);
    expect(detail.dispatches[0]).toMatchObject({ status: 'SENT', send_attempts: 2, last_error: null });
    expect(detail.rfq.status).toBe('SENT');
    // Reintentar algo ya enviado no envía otra vez.
    const again = await svc.sendInvitations(orgA, analystA, single.rfq_id, [prepared.dispatch_id], true, goodMailer);
    expect(again[0].status).toBe('SKIPPED');
    expect(sent.length).toBe(before + 1);
  });

  it('confirma y envía las dos invitaciones; envíos concurrentes no duplican correos', async () => {
    const ids = Object.values(dispatchBySupplier);
    const before = sent.length;
    const [r1, r2] = await Promise.all([
      svc.sendInvitations(orgA, analystA, rfqId, ids, true, goodMailer),
      svc.sendInvitations(orgA, analystA, rfqId, ids, true, goodMailer),
    ]);
    expect(sent.length - before).toBe(2);
    const statuses = [...r1, ...r2].map((o) => o.status);
    expect(statuses.filter((s) => s === 'SENT')).toHaveLength(2);
    expect(statuses.filter((s) => s === 'SKIPPED')).toHaveLength(2);
    expect(sent.slice(before).map((m) => m.to).sort()).toEqual(['compras@dos.qa.test', 'ventas@uno.qa.test']);
    const detail = await svc.getRfqDetail(orgA, rfqId);
    expect(detail.rfq.status).toBe('SENT');
    expect(detail.dispatches.every((d: any) => d.status === 'SENT' && d.message_id)).toBe(true);
  });

  it('enlace externo: muestra solo lo del proveedor, valida token y no filtra otras ofertas ni datos internos', async () => {
    const tokenA1 = await tokenFor(dispatchBySupplier[supplierIds.A1]);
    const tokenA2 = await tokenFor(dispatchBySupplier[supplierIds.A2]);
    const view: any = await svc.getPublicView(tokenA1);
    expect(view.rfq.code).toMatch(/^RFQ-/);
    expect(view.items).toHaveLength(2);
    expect(view.supplier.name).toBe('Proveedor Uno SA');
    const serialized = JSON.stringify(view);
    for (const secret of [orgA, orgB, 'Proveedor Dos', 'true_unit_cost', 'organization_id', 'ventas@uno', 'Hoja vigente']) expect(serialized).not.toContain(secret);
    await expect(svc.getPublicView('x'.repeat(43))).rejects.toMatchObject({ code: 'RFQ_LINK_INVALID', status: 404 });
    await expect(svc.getPublicView('corto')).rejects.toMatchObject({ code: 'RFQ_LINK_INVALID' });

    // Proveedor 1 responde por el enlace; el enlace del proveedor 2 no ve esa respuesta.
    const { publicQuoteSchema } = svc;
    const payload = publicQuoteSchema.parse({ ...quote(0.05, 0.07), submitted_by_label: 'María, Proveedor Uno', fx_rate_to_usd: 99, logistics_cost_per_unit_usd: 0.5, organization_id: orgB });
    expect((payload as Record<string, unknown>).fx_rate_to_usd).toBeUndefined(); // el esquema descarta lo que el proveedor no puede fijar
    const first = await svc.submitPublicQuote(tokenA1, payload);
    expect(first.version).toBe(1);
    const viewA2: any = await svc.getPublicView(tokenA2);
    expect(viewA2.submissions).toEqual([]);
    expect((await svc.getPublicView(tokenA1) as any).submissions).toHaveLength(1);

    const { data: stored } = await admin.from('supplier_quotes').select('organization_id, fx_rate_to_usd, logistics_cost_per_unit_usd, source_channel, status, dispatch_id').eq('id', first.quote_id).single();
    expect(stored).toMatchObject({ organization_id: orgA, fx_rate_to_usd: null, logistics_cost_per_unit_usd: null, source_channel: 'LINK', status: 'SUBMITTED' });
    // Aunque alguien llame al servicio con campos extra, la base los descarta.
    const sneaky = await svc.submitPublicQuote(tokenA1, { ...payload, fx_rate_to_usd: 50, logistics_cost_per_unit_usd: 9 } as never);
    const { data: sneakyRow } = await admin.from('supplier_quotes').select('fx_rate_to_usd, logistics_cost_per_unit_usd').eq('id', sneaky.quote_id).single();
    expect(sneakyRow).toMatchObject({ fx_rate_to_usd: null, logistics_cost_per_unit_usd: null });
    expect(sneaky.version).toBe(2);
    const { data: versions } = await admin.from('supplier_quotes').select('version, status').eq('rfq_id', rfqId).eq('supplier_id', supplierIds.A1).order('version');
    expect(versions).toEqual([{ version: 1, status: 'SUPERSEDED' }, { version: 2, status: 'SUBMITTED' }]); // historial de versiones conservado
    // Límite de reenvíos por enlace.
    await svc.submitPublicQuote(tokenA1, payload);
    await expect(svc.submitPublicQuote(tokenA1, payload)).rejects.toMatchObject({ code: 'RFQ_LINK_SUBMISSION_LIMIT', status: 429 });
    // Ítem que no pertenece a la RFQ.
    await expect(svc.submitPublicQuote(tokenA2, { ...payload, items: [{ ...payload.items[0], rfq_item_id: randomUUID() }] })).rejects.toMatchObject({ code: 'RFQ_ITEM_NOT_IN_RFQ' });
    // Respuesta del proveedor 2 usando su propio enlace.
    const second = await svc.submitPublicQuote(tokenA2, publicQuoteSchema.parse({ ...quote(0.048, 0.075, { currency: 'USD' }), submitted_by_label: 'Proveedor Dos' }));
    expect(second.version).toBe(1);
    const detail = await svc.getRfqDetail(orgA, rfqId);
    expect(detail.dispatches.every((d: any) => d.status === 'REPLIED')).toBe(true);
    expect(detail.rfq.status).toBe('REPLIED');
  });

  it('el enlace vence, se puede revocar y respeta la fecha límite', async () => {
    const ttlRfq = await svc.createRfq(orgA, analystA, { title: 'Vencimiento', delivery_destination: 'X', incoterm: 'FOB', items: [{ sku: 'T-1', quantity: 5, unit: 'UN', alternative_quantities: [], specs: {} }] });
    const [prepared] = await svc.prepareInvitations(orgA, analystA, ttlRfq.rfq_id, { ttl_days: 3, invitations: [{ supplier_id: supplierIds.A1 }] }, 'http://localhost:3200');
    await svc.sendInvitations(orgA, analystA, ttlRfq.rfq_id, [prepared.dispatch_id], true, goodMailer);
    const token = await tokenFor(prepared.dispatch_id);
    const detail = await svc.getRfqDetail(orgA, ttlRfq.rfq_id);
    const body = { currency: 'USD', incoterm: 'FOB' as const, submitted_by_label: 'Proveedor', items: [{ rfq_item_id: detail.items[0].id, unit_price: 1, technical_compliance: 'UNKNOWN' as const, price_scales: [] }] };

    await admin.from('rfq_supplier_dispatches').update({ token_expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', prepared.dispatch_id);
    await expect(svc.getPublicView(token)).rejects.toMatchObject({ code: 'RFQ_LINK_EXPIRED', status: 410 });
    await expect(svc.submitPublicQuote(token, body)).rejects.toMatchObject({ code: 'RFQ_LINK_EXPIRED' });

    await admin.from('rfq_supplier_dispatches').update({ token_expires_at: new Date(Date.now() + 86400000).toISOString() }).eq('id', prepared.dispatch_id);
    expect(await svc.getPublicView(token)).toBeTruthy();
    await svc.revokeInvitationLink(orgA, analystA, prepared.dispatch_id);
    await expect(svc.getPublicView(token)).rejects.toMatchObject({ code: 'RFQ_LINK_REVOKED' });

    await admin.from('rfq_supplier_dispatches').update({ token_revoked_at: null }).eq('id', prepared.dispatch_id);
    await admin.from('rfqs').update({ deadline_at: new Date(Date.now() - 1000).toISOString() }).eq('id', ttlRfq.rfq_id);
    await expect(svc.submitPublicQuote(token, body)).rejects.toMatchObject({ code: 'RFQ_DEADLINE_PASSED' });
  });

  it('registra una oferta en PDF, extrae con evidencia, la deja sin validar y la excluye hasta que una persona la confirme', async () => {
    // Tercer proveedor, fuera de las invitaciones, responde por correo con un PDF.
    const third = await admin.from('suppliers').insert({ organization_id: orgA, name: 'Proveedor Tres SA', email: 'ventas@tres.qa.test', country_code: 'BR', status: 'APPROVED_FOR_CONTACT' }).select('id').single();
    thirdSupplierId = third.data!.id;
    const pdf = makeTextPdf(['Cotizacion 2026-31', 'Moneda: BRL', 'Incoterm: FOB', 'Validez hasta 31/12/2099', 'CUNA-AMP-2ML precio unitario 0,2400 MOQ 20.000', 'CUNA-AMP-5ML precio unitario 0,3500 MOQ 20.000']);
    const uploaded = await svc.uploadQuoteDocument(orgA, analystA, rfqId, third.data!.id, { name: 'cotizacion-tres.pdf', type: 'application/pdf', bytes: pdf });
    expect(uploaded.extraction_status).toBe('EXTRACTED');
    expect(uploaded.duplicate).toBe(false);
    const extraction: any = uploaded.extraction;
    expect(extraction.needs_human_validation).toBe(true);
    expect(extraction.items.map((i: any) => i.unit_price.value)).toEqual([0.24, 0.35]);

    // El mismo archivo no se duplica; el original se conserva y es recuperable.
    const dup = await svc.uploadQuoteDocument(orgA, analystA, rfqId, third.data!.id, { name: 'cotizacion-tres.pdf', type: 'application/pdf', bytes: pdf });
    expect(dup).toMatchObject({ duplicate: true, document_id: uploaded.document_id });
    const stored = await svc.getDocumentContent(orgA, uploaded.document_id);
    expect(Buffer.compare(Buffer.from(stored.bytes), Buffer.from(pdf))).toBe(0);
    await expect(svc.getDocumentContent(orgB, uploaded.document_id)).rejects.toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    await expect(svc.uploadQuoteDocument(orgA, analystA, rfqId, third.data!.id, { name: 'x.pdf', type: 'application/pdf', bytes: new Uint8Array(Buffer.from('no es pdf')) })).rejects.toMatchObject({ code: 'DOCUMENT_NOT_PDF' });

    // Se registra lo extraído: queda EXTRACTED (no validado).
    const registered = await svc.registerExtractedQuote(orgA, analystA, rfqId, third.data!.id, uploaded.document_id, {
      currency: extraction.currency.value, incoterm: extraction.incoterm.value, validity_date: extraction.validity_date.value,
      items: extraction.items.map((i: any) => ({ rfq_item_id: i.rfq_item_id, unit_price: i.unit_price.value, moq: i.moq.value, technical_compliance: 'UNKNOWN', price_scales: [] })),
    } as never);
    let comparison = await svc.getComparison(orgA, rfqId, (c, q) => (c === 'BRL' && q.fx_rate_to_usd ? { rate_to_usd: q.fx_rate_to_usd, source: 'validado', as_of: null } : null));
    let offersThree = comparison.items[0].offers.filter((o) => o.supplier_id === third.data!.id);
    expect(offersThree[0].flags.map((f) => f.code)).toContain('SIN_VALIDAR');
    expect(offersThree[0].comparable).toBe(false);
    await expect(svc.recordDecision(orgA, analystA, rfqId, { quote_id: registered.quote_id, decision: 'SELECTED', rationale: 'intento' })).rejects.toMatchObject({ code: 'QUOTE_NOT_VALIDATED' });

    // Una persona corrige y valida, aportando el tipo de cambio con su fuente.
    await svc.validateQuote(orgA, analystA, registered.quote_id, { fx_rate_to_usd: 0.19, fx_rate_source: 'Compras: tasa del día 2026-10-10', fx_rate_date: '2026-10-10' });
    comparison = await svc.getComparison(orgA, rfqId, (c, q) => (c === 'BRL' && q.fx_rate_to_usd ? { rate_to_usd: q.fx_rate_to_usd, source: q.fx_rate_source ?? '', as_of: q.fx_rate_date } : null));
    offersThree = comparison.items[0].offers.filter((o) => o.supplier_id === third.data!.id);
    expect(offersThree[0]).toMatchObject({ comparable: true, normalized_unit_price_usd: 0.0456, quote_status: 'REVIEWED' });
    expect(offersThree[0].fx?.source).toContain('Compras');
  });

  it('compara por ítem y por proveedor contra la hoja de costos vigente y no recomienda con alta confianza sin ella', async () => {
    const comparison = await svc.getComparison(orgA, rfqId);
    const [item1, item2] = comparison.items;
    expect(item1.cost_sheet).toMatchObject({ available: true, version: 2 });
    expect(item2.cost_sheet.available).toBe(false);
    const comparable = item1.offers.filter((o) => o.comparable);
    expect(comparable.length).toBeGreaterThanOrEqual(2);
    expect(item1.offers.find((o) => o.supplier_id === supplierIds.A2)!.benchmark).toMatchObject({ niupack_unit_cost_usd: 0.04, gap_usd: 0.008 });
    expect(item1.proposal!.supplier_id).toBe(thirdSupplierId); // 0.24 BRL × 0.19 = 0.0456 < 0.048 < 0.05
    expect(item2.proposal!.confidence).toBe('BAJA'); // sin hoja de costos
    expect(JSON.stringify(comparison)).not.toMatch(/organization_id|token_hash/);
  });

  it('registra la decisión humana con su foto del comparador, append-only, sin adjudicar ni tocar precios', async () => {
    const comparison = await svc.getComparison(orgA, rfqId);
    const best = comparison.items[0].proposal!;
    const costBefore = await admin.from('cost_sheet_versions').select('true_unit_cost_usd, version').eq('organization_id', orgA).eq('sku', 'CUNA-AMP-2ML').single();
    const decided = await svc.recordDecision(orgA, analystA, rfqId, { quote_id: best.quote_id, rfq_item_id: itemIds[0], decision: 'SELECTED', rationale: 'Mejor precio comparable y plazo aceptable' });
    await svc.recordDecision(orgA, analystA, rfqId, { quote_id: best.quote_id, rfq_item_id: itemIds[0], decision: 'DEFERRED', rationale: 'Esperar respuesta de un tercer proveedor' });
    const detail = await svc.getRfqDetail(orgA, rfqId);
    expect(detail.decisions).toHaveLength(2); // historial completo
    expect(detail.decisions.find((d: any) => d.id === decided.decision_id)).toMatchObject({ decision: 'SELECTED', decided_by_profile_id: analystA, supplier_id: thirdSupplierId });
    expect((detail.decisions[0] as any).comparison_snapshot.items).toHaveLength(2);
    expect(detail.rfq.status).toBe('DECIDED');
    // El costo oficial no cambió y no se creó ninguna orden de compra.
    const costAfter = await admin.from('cost_sheet_versions').select('true_unit_cost_usd, version').eq('organization_id', orgA).eq('sku', 'CUNA-AMP-2ML').single();
    expect(costAfter.data).toEqual(costBefore.data);
    // Inmutable: ni siquiera con el rol de servicio se puede editar o borrar una decisión.
    const upd = await admin.from('rfq_decisions').update({ rationale: 'manipulada' }).eq('id', decided.decision_id);
    expect(upd.error?.message).toMatch(/RFQ_HISTORY_IS_APPEND_ONLY/);
    const del = await admin.from('rfq_decisions').delete().eq('id', decided.decision_id);
    expect(del.error?.message).toMatch(/RFQ_HISTORY_IS_APPEND_ONLY/);
    await expect(svc.recordDecision(orgA, analystA, rfqId, { quote_id: best.quote_id, decision: 'SELECTED', rationale: 'x' })).rejects.toThrow();
  });

  it('sale y vuelve: todo el historial persiste (RFQ, ítems, invitaciones, versiones, documentos, decisiones, eventos)', async () => {
    const detail = await svc.getRfqDetail(orgA, rfqId);
    expect(detail.items).toHaveLength(2);
    expect(detail.dispatches).toHaveLength(2);
    expect(detail.quotes.length).toBeGreaterThanOrEqual(5); // v1, v2, v3 del proveedor 1 + proveedor 2 + PDF
    expect(detail.documents).toHaveLength(1);
    expect(detail.decisions).toHaveLength(2);
    const types = new Set(detail.events.map((e: any) => e.event_type));
    for (const t of ['RFQ_CREATED', 'INVITATION_PREPARED', 'INVITATION_SENT', 'QUOTE_SUBMITTED_VIA_LINK', 'DOCUMENT_STORED', 'QUOTE_REGISTERED', 'QUOTE_VALIDATED', 'DECISION_RECORDED']) expect(types.has(t)).toBe(true);
    const listing = (await svc.listRfqs(orgA)).find((r) => r.id === rfqId)!;
    expect(listing).toMatchObject({ status: 'DECIDED', items_count: 2, invitations: 2, invitations_sent: 2 });
  });

  it('aislamiento: otra organización no lee, compara, invita, valida ni decide sobre esta RFQ', async () => {
    await expect(svc.getRfqDetail(orgB, rfqId)).rejects.toMatchObject({ code: 'RFQ_NOT_FOUND' });
    await expect(svc.getComparison(orgB, rfqId)).rejects.toMatchObject({ code: 'RFQ_NOT_FOUND' });
    await expect(svc.prepareInvitations(orgB, analystB, rfqId, { ttl_days: 7, invitations: [{ supplier_id: supplierIds.B1 }] }, 'http://localhost:3200')).rejects.toMatchObject({ code: 'RFQ_NOT_FOUND' });
    const detail = await svc.getRfqDetail(orgA, rfqId);
    const someQuote = detail.quotes[0].id;
    await expect(svc.validateQuote(orgB, analystB, someQuote, {})).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' });
    await expect(svc.registerManualQuote(orgB, analystB, rfqId, supplierIds.B1, quote(1, 1) as never)).rejects.toMatchObject({ code: 'RFQ_NOT_FOUND' });
    expect((await svc.listRfqs(orgB)).map((r) => r.id)).not.toContain(rfqId);
    expect((await svc.listSuppliers(orgB)).map((s: any) => s.name)).toEqual(['Proveedor de Otra Org']);
  });
});
