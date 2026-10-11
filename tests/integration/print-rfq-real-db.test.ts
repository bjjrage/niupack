/**
 * RFQ a imprentas contra PostgreSQL + PostgREST reales: solicitud con SKU y arte, invitaciones, presupuestos versionados,
 * revisión humana, asignación, autorización, preview y órdenes de compra. Se omite salvo NIUPACK_QA_DB=1 y solo corre en localhost.
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

const enabled = process.env.NIUPACK_QA_DB === '1';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (enabled && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new Error(`Refusing to run real-DB tests against non-local Supabase: ${url}`);

const png = (seed: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`arte-${seed}-${randomUUID()}`)]);
const pdf = (seed: string) => Buffer.from(`%PDF-1.4\n% presupuesto ${seed} ${randomUUID()}\n%%EOF`);
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe.skipIf(!enabled)('RFQ a imprentas sobre PostgreSQL real', () => {
  let svc: typeof import('@/lib/print-rfq/service');
  let admin: NonNullable<typeof import('@/lib/db/supabase').supabaseAdmin>;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const boss = randomUUID();
  const analyst = randomUUID();
  const outsider = randomUUID();
  let attrId: string;
  let provA: string; let provB: string; let provC: string;

  const offerHeader = (over: Record<string, unknown> = {}) => ({ budget_number: `P-${randomUUID().slice(0, 6)}`, currency: 'PYG', vat_included: false, invoice_available: true, valid_until: future(20), freight: 100000, payment_terms: '30 días', delivery_time: '15 días', observations: null, ...over });
  const line = (itemId: string, price: number | null, over: Record<string, unknown> = {}) => ({ rfq_item_id: itemId, unit_price: price, available_quantity: 1000, tax_rate: 10, lead_time_days: 12, observations: null, ...over });

  /** Solicitud lista para invitar: dos ítems, cada uno con su arte. */
  async function openRfq(purpose: 'PROCUREMENT' | 'COST_DISCOVERY' = 'PROCUREMENT') {
    const created = await svc.createRfq(orgA, analyst, {
      header: { purpose, title: 'Vaso 12oz — impresión 4 colores', specifications: 'Imprimir según arte adjunto' },
      items: [
        { sku: 'CUP-12OZ-DW', description: 'Vaso 12oz doble pared, 4 colores', quantity: 1000, unit: 'un', product_attribute_id: attrId, print_spec: { process: 'Flexografía', colors: '4 + barniz' } },
        { sku: 'LID-12OZ', description: 'Tapa 12oz 1 color', quantity: 500, unit: 'un', print_spec: { process: 'Offset' } },
      ],
    });
    const ws = await svc.loadRfqWorkspace(orgA, created.id);
    for (const item of ws.items) await svc.storeFile(orgA, created.id, { kind: 'ART', fileName: `arte-${item.sku}.png`, content: png(1), rfqItemId: item.id, actor: analyst });
    return { id: created.id, code: created.code, items: (await svc.loadRfqWorkspace(orgA, created.id)).items };
  }

  /** La imprenta responde por su enlace con presupuesto adjunto. */
  async function respond(rfqId: string, token: string, invitationId: string, items: Array<{ id: string }>, prices: Array<number | null>, over: Record<string, unknown> = {}) {
    const stored = await svc.storeFile(orgA, rfqId, { kind: 'BUDGET', fileName: 'presupuesto.pdf', content: pdf('x'), invitationId });
    return svc.submitOffer(token, offerHeader(over), items.map((i, n) => line(i.id, prices[n])), stored.file_id);
  }
  const invitationsOf = async (rfqId: string) => (await svc.loadRfqWorkspace(orgA, rfqId)).invitations;
  const reviewAll = async (rfqId: string) => {
    const ws = await svc.loadRfqWorkspace(orgA, rfqId);
    for (const versionId of new Set(ws.offers.map((o) => o.quote_version_id))) await svc.reviewQuote(orgA, analyst, rfqId, versionId, [], 'Revisé el PDF original y coincide con lo cargado');
  };

  beforeAll(async () => {
    svc = await import('@/lib/print-rfq/service');
    admin = (await import('@/lib/db/supabase')).supabaseAdmin!;
    for (const [id, slug] of [[orgA, 'print-a'], [orgB, 'print-b']]) {
      const { error } = await admin.from('organizations').insert({ id, name: slug, slug: `${slug}-${id.slice(0, 8)}` });
      if (error) throw error;
    }
    for (const [id, org, role] of [[boss, orgA, 'admin'], [analyst, orgA, 'analyst'], [outsider, orgB, 'admin']] as const) {
      const { error } = await admin.from('profiles').insert({ id, organization_id: org, email: `print-${id}@qa.local`, full_name: 'QA', role });
      if (error) throw error;
    }
    const product = await admin.from('products').insert({ organization_id: orgA, code: `CUP-${randomUUID().slice(0, 5)}`, name: 'Vaso 12oz DW', category: 'cups' }).select('id').single();
    if (product.error) throw product.error;
    const attr = await admin.from('product_attributes').insert({ product_id: product.data.id, sku: 'CUP-12OZ-DW', material: 'paper', coating: 'PE', wall_type: 'double' }).select('id').single();
    if (attr.error) throw attr.error;
    attrId = attr.data.id;
    provA = (await svc.saveProvider(orgA, { name: 'Gráfica Asunción', processes: ['Flexografía', 'Offset'], city: 'Asunción' })).id;
    provB = (await svc.saveProvider(orgA, { name: 'Impresos del Este', processes: ['Flexografía'] })).id;
    provC = (await svc.saveProvider(orgA, { name: 'Imprenta Inactiva', active: false })).id;
  });

  it('catálogo de imprentas: nombre único por organización, aislado y editable', async () => {
    await expect(svc.saveProvider(orgA, { name: '  gráfica asunción ' })).rejects.toMatchObject({ code: 'PRINT_DUPLICATE' });
    expect((await svc.listProviders(orgA)).map((p: any) => p.name)).toEqual(['Gráfica Asunción', 'Impresos del Este']);
    expect(await svc.listProviders(orgB)).toHaveLength(0);
    expect((await svc.listProviders(orgA, true))).toHaveLength(3);
    await expect(svc.saveProvider(orgB, { name: 'x' }, provA)).rejects.toMatchObject({ code: 'PRINT_PROVIDER_INVALID' });
  });

  it('busca SKU en el catálogo de NIUPACK solo de la organización', async () => {
    expect((await svc.searchSkus(orgA, 'cup-12')).map((s: any) => s.sku)).toContain('CUP-12OZ-DW');
    expect(await svc.searchSkus(orgB, 'cup-12')).toHaveLength(0);
  });

  it('crea la solicitud con SKU y ficha de impresión; valida propósito, ítems y SKU ajeno', async () => {
    const created = await svc.createRfq(orgA, analyst, { header: { purpose: 'PROCUREMENT', title: 'Prueba' }, items: [{ sku: 'X-1', description: 'Etiqueta', quantity: 10, unit: 'un' }] });
    expect(created.code).toMatch(/^IMP-\d{4}$/);
    const second = await svc.createRfq(orgA, analyst, { header: { purpose: 'COST_DISCOVERY', title: 'Otra' }, items: [{ sku: 'X-2', description: 'Etiqueta', quantity: 10, unit: 'un' }] });
    expect(Number(second.code.slice(4))).toBe(Number(created.code.slice(4)) + 1);
    await expect(svc.createRfq(orgA, analyst, { header: { title: 'Sin propósito' }, items: [{ sku: 'X', description: 'a', quantity: 1, unit: 'un' }] })).rejects.toThrow();
    await expect(svc.createRfq(orgA, analyst, { header: { purpose: 'PROCUREMENT', title: 'Sin ítems' }, items: [] })).rejects.toThrow();
    await expect(svc.createRfq(orgB, outsider, { header: { purpose: 'PROCUREMENT', title: 'SKU ajeno' }, items: [{ sku: 'CUP-12OZ-DW', description: 'x', quantity: 1, unit: 'un', product_attribute_id: attrId }] })).rejects.toMatchObject({ code: 'PRINT_SKU_NOT_FOUND' });
    await expect(svc.createRfq(orgA, outsider, { header: { purpose: 'PROCUREMENT', title: 'Actor ajeno' }, items: [{ sku: 'X', description: 'a', quantity: 1, unit: 'un' }] })).rejects.toMatchObject({ code: 'PRINT_ACTOR_NOT_ALLOWED' });
  });

  it('el arte es obligatorio antes de invitar; queda registrado con huella, sin duplicados, y solo con formatos permitidos', async () => {
    const created = await svc.createRfq(orgA, analyst, { header: { purpose: 'PROCUREMENT', title: 'Sin arte' }, items: [{ sku: 'ET-1', description: 'Etiqueta', quantity: 100, unit: 'un' }] });
    await expect(svc.inviteProviders(orgA, analyst, created.id, [provA])).rejects.toMatchObject({ code: 'PRINT_ART_REQUIRED', status: 409 });
    const [item] = (await svc.loadRfqWorkspace(orgA, created.id)).items;
    const art = png(7);
    const first = await svc.storeFile(orgA, created.id, { kind: 'ART', fileName: 'etiqueta.png', content: art, rfqItemId: item.id, actor: analyst });
    const again = await svc.storeFile(orgA, created.id, { kind: 'ART', fileName: 'etiqueta-copia.png', content: art, rfqItemId: item.id, actor: analyst });
    expect(first.duplicate).toBe(false);
    expect(again).toMatchObject({ duplicate: true, file_id: first.file_id });
    const stored = (await svc.loadRfqWorkspace(orgA, created.id)).items[0].art_files;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ file_name: 'etiqueta.png', content_type: 'image/png', size_bytes: art.length });
    const read = await svc.readFile(orgA, first.file_id);
    expect(read!.content.equals(art)).toBe(true);
    expect(stored[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    // Formatos y tamaños
    await expect(svc.storeFile(orgA, created.id, { kind: 'ART', fileName: 'virus.exe', content: art, rfqItemId: item.id, actor: analyst })).rejects.toMatchObject({ code: 'PRINT_FILE_TYPE' });
    await expect(svc.storeFile(orgA, created.id, { kind: 'ART', fileName: 'enorme.png', content: Buffer.alloc(4 * 1024 * 1024 + 1, 1), rfqItemId: item.id, actor: analyst })).rejects.toMatchObject({ code: 'PRINT_FILE_TOO_LARGE' });
    // Un ítem de otra solicitud no admite el arte; otra organización no puede leer el archivo
    const other = await openRfq();
    await expect(svc.storeFile(orgA, other.id, { kind: 'ART', fileName: 'x.png', content: png(8), rfqItemId: item.id, actor: analyst })).rejects.toMatchObject({ code: 'PRINT_ITEM_NOT_FOUND' });
    expect(await svc.readFile(orgB, first.file_id)).toBeNull();
    // El arte no se puede reescribir
    const { error } = await admin.from('print_files').update({ file_name: 'otro.png' }).eq('id', first.file_id);
    expect(error?.message).toMatch(/PRINT_IMMUTABLE_RECORD/);
    // Ahora sí se puede invitar
    expect((await svc.inviteProviders(orgA, analyst, created.id, [provA])).invited).toBe(1);
  });

  it('invita con enlace propio por imprenta; rechaza inactivas; el portal muestra solo lo de esa imprenta', async () => {
    const rfq = await openRfq();
    await expect(svc.inviteProviders(orgA, analyst, rfq.id, [provC])).rejects.toMatchObject({ code: 'PRINT_PROVIDER_INVALID' });
    await expect(svc.inviteProviders(orgA, outsider, rfq.id, [provA])).rejects.toMatchObject({ code: 'PRINT_ACTOR_NOT_ALLOWED' });
    expect((await svc.inviteProviders(orgA, analyst, rfq.id, [provA, provB, provA])).invited).toBe(2);
    expect((await svc.inviteProviders(orgA, analyst, rfq.id, [provA])).invited).toBe(0);
    const invitations = await invitationsOf(rfq.id);
    expect(invitations).toHaveLength(2);
    expect(new Set(invitations.map((i: any) => i.token)).size).toBe(2);
    for (const i of invitations) expect(i.token).toMatch(/^[a-f0-9]{64}$/);
    expect((await svc.loadRfqWorkspace(orgA, rfq.id)).rfq.status).toBe('COTIZANDO');

    const [a, b] = invitations;
    const view = await svc.getPortalView(a.token);
    expect(view.provider_name).toBe(a.print_providers.name);
    expect(view.items).toHaveLength(2);
    expect(view.items[0]).toMatchObject({ sku: 'CUP-12OZ-DW', print_spec: { process: 'Flexografía' } });
    expect(view.items[0].art).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain(b.print_providers.name);
    // El arte se descarga con el enlace; el presupuesto de otra imprenta no
    const art = await svc.readFile(orgA, view.items[0].art[0].id, { rfqId: rfq.id, invitationId: a.id });
    expect(art).not.toBeNull();
    await expect(svc.resolveInvitation('no-es-un-token')).rejects.toMatchObject({ code: 'PRINT_LINK_INVALID' });
    await expect(svc.resolveInvitation('a'.repeat(64))).rejects.toMatchObject({ code: 'PRINT_LINK_INVALID' });
    expect((await invitationsOf(rfq.id)).find((i: any) => i.id === a.id).status).toBe('ABIERTO');
  });

  it('recibe presupuestos versionados con documento original; corregir crea una versión nueva y no pisa la anterior', async () => {
    const rfq = await openRfq();
    await svc.inviteProviders(orgA, analyst, rfq.id, [provA]);
    const [inv] = await invitationsOf(rfq.id);
    // Sin documento no hay oferta
    await expect(svc.submitOffer(inv.token, offerHeader(), rfq.items.map((i: any) => line(i.id, 100)), randomUUID())).rejects.toMatchObject({ code: 'PRINT_BUDGET_REQUIRED' });
    const v1 = await respond(rfq.id, inv.token, inv.id, rfq.items, [1000, 500]);
    // total = (1000×1000 + 500×500) × 1,10 + flete 100000
    expect(v1).toMatchObject({ version_number: 1, total_price: 1_475_000 });
    const v2 = await respond(rfq.id, inv.token, inv.id, rfq.items, [900, 450], { budget_number: 'P-CORREGIDO' });
    expect(v2.version_number).toBe(2);
    const ws = await svc.loadRfqWorkspace(orgA, rfq.id);
    expect(ws.history).toHaveLength(2);
    expect(ws.offers.every((o) => o.version_number === 2)).toBe(true);
    expect(ws.rfq.status).toBe('OFERTAS_RECIBIDAS');
    expect(ws.invitations[0].status).toBe('RESPONDIDO');
    // Inmutables
    const { error } = await admin.from('print_quote_versions').update({ freight: 0 }).eq('id', v1.version_id);
    expect(error?.message).toMatch(/PRINT_IMMUTABLE_RECORD/);
    const del = await admin.from('print_quote_version_items').delete().eq('quote_version_id', v1.version_id);
    expect(del.error?.message).toMatch(/PRINT_IMMUTABLE_RECORD/);
    // Validaciones
    const stored = async () => (await svc.storeFile(orgA, rfq.id, { kind: 'BUDGET', fileName: 'otro.pdf', content: pdf('y'), invitationId: inv.id })).file_id;
    await expect(svc.submitOffer(inv.token, offerHeader({ valid_until: future(-1) }), rfq.items.map((i: any) => line(i.id, 1)), await stored())).rejects.toMatchObject({ code: 'PRINT_OFFER_INVALID' });
    await expect(svc.submitOffer(inv.token, offerHeader(), [line(rfq.items[0].id, 1)], await stored())).rejects.toMatchObject({ code: 'PRINT_OFFER_INCOMPLETE' });
    await expect(svc.submitOffer(inv.token, offerHeader(), rfq.items.map((i: any) => line(i.id, null)), await stored())).rejects.toThrow();
    await expect(svc.submitOffer(inv.token, offerHeader(), rfq.items.map((i: any) => line(i.id, 1)), v1.version_id)).rejects.toMatchObject({ code: 'PRINT_BUDGET_REQUIRED' });
    // Se puede no cotizar una línea: sin precio y disponibilidad 0
    const partial = await svc.submitOffer(inv.token, offerHeader(), [line(rfq.items[0].id, 800), line(rfq.items[1].id, null, { available_quantity: 0 })], await stored());
    expect(partial.version_number).toBe(3);
  });

  it('enlace revocado o vencido no admite ofertas; renovar invalida el anterior', async () => {
    const rfq = await openRfq();
    await svc.inviteProviders(orgA, analyst, rfq.id, [provA]);
    const [inv] = await invitationsOf(rfq.id);
    await svc.setInvitationLink(orgA, analyst, rfq.id, inv.id, 'REVOKE');
    await expect(svc.resolveInvitation(inv.token)).rejects.toMatchObject({ code: 'PRINT_LINK_CLOSED' });
    await expect(respond(rfq.id, inv.token, inv.id, rfq.items, [1, 1])).rejects.toMatchObject({ code: 'PRINT_LINK_CLOSED' });
    await svc.setInvitationLink(orgA, analyst, rfq.id, inv.id, 'RENEW');
    const [renewed] = await invitationsOf(rfq.id);
    expect(renewed.token).not.toBe(inv.token);
    await expect(svc.resolveInvitation(inv.token)).rejects.toMatchObject({ code: 'PRINT_LINK_INVALID' });
    expect((await respond(rfq.id, renewed.token, inv.id, rfq.items, [10, 10])).version_number).toBe(1);
    await svc.transitionRfq(orgA, analyst, rfq.id, 'CANCEL');
    await expect(svc.resolveInvitation(renewed.token)).rejects.toMatchObject({ code: 'PRINT_LINK_CLOSED' });
    await svc.transitionRfq(orgA, analyst, rfq.id, 'REOPEN', 7);
    expect((await svc.resolveInvitation(renewed.token)).id).toBe(inv.id);
  });

  describe('de la cotización a la orden de compra', () => {
    let rfq: Awaited<ReturnType<typeof openRfq>>;
    let allocationId: string;
    let previewHash: string;

    it('sin revisión humana no se puede asignar; la revisión registra diferencias contra el documento', async () => {
      rfq = await openRfq();
      await svc.inviteProviders(orgA, analyst, rfq.id, [provA, provB]);
      const [a, b] = await invitationsOf(rfq.id);
      await respond(rfq.id, a.token, a.id, rfq.items, [1000, 600]);   // A: caro en tapas
      await respond(rfq.id, b.token, b.id, rfq.items, [1200, 400], { currency: 'PYG', freight: 50000 }); // B: barato en tapas
      const ws = await svc.loadRfqWorkspace(orgA, rfq.id);
      expect(ws.offers).toHaveLength(4);
      const first = ws.offers[0];
      await expect(svc.saveAllocation(orgA, analyst, rfq.id, [{ quote_version_item_id: first.id, quantity: 10 }], 'Primera asignación de prueba', 0)).rejects.toMatchObject({ code: 'PRINT_QUOTE_NOT_ELIGIBLE' });

      const versionA = ws.offers.find((o) => o.provider_name === 'Gráfica Asunción')!;
      const facts = [{ rfq_item_id: versionA.rfq_item_id, unit_price: 999, currency: 'PYG', tax_rate: 10 }];
      await expect(svc.reviewQuote(orgA, analyst, rfq.id, versionA.quote_version_id, facts, 'corto')).rejects.toMatchObject({ code: 'PRINT_RESOLUTION_REQUIRED' });
      const review = await svc.reviewQuote(orgA, analyst, rfq.id, versionA.quote_version_id, facts, 'El PDF dice 999 y el portal 1000: es redondeo del proveedor');
      expect(review.discrepancies.some((d: any) => d.field === 'unit_price')).toBe(true);
      await expect(svc.reviewQuote(orgA, outsider, rfq.id, versionA.quote_version_id, [], 'Revisión de otra organización')).rejects.toBeTruthy();
      await reviewAll(rfq.id);
      const after = await svc.loadRfqWorkspace(orgA, rfq.id);
      expect(after.offers.every((o) => o.review_id)).toBe(true);
    });

    it('guarda la asignación con precios resueltos desde la base; rechaza sobreasignación, duplicados y cantidades inválidas', async () => {
      const ws = await svc.loadRfqWorkspace(orgA, rfq.id);
      const pick = (provider: string, sku: string) => ws.offers.find((o) => o.provider_name === provider && ws.items.find((i) => i.id === o.rfq_item_id)!.sku === sku)!;
      const lines = [
        { quote_version_item_id: pick('Gráfica Asunción', 'CUP-12OZ-DW').id, quantity: 1000 },   // vasos a A (1000)
        { quote_version_item_id: pick('Impresos del Este', 'LID-12OZ').id, quantity: 500 },      // tapas a B (400)
      ];
      await expect(svc.saveAllocation(orgA, analyst, rfq.id, [...lines, { quote_version_item_id: pick('Impresos del Este', 'CUP-12OZ-DW').id, quantity: 1 }], 'Sobreasigno vasos a propósito', 0)).rejects.toMatchObject({ code: 'PRINT_ALLOCATION_OVER' });
      await expect(svc.saveAllocation(orgA, analyst, rfq.id, [lines[0], lines[0]], 'Línea repetida en la asignación', 0)).rejects.toThrow();
      await expect(svc.saveAllocation(orgA, analyst, rfq.id, [{ ...lines[0], quantity: 0 }], 'Cantidad cero en la asignación', 0)).rejects.toThrow();
      await expect(svc.saveAllocation(orgA, analyst, rfq.id, lines, 'corta', 0)).rejects.toMatchObject({ code: 'PRINT_JUSTIFICATION_REQUIRED' });
      await expect(svc.saveAllocation(orgA, analyst, rfq.id, lines, 'Revisión desactualizada a propósito', 5)).rejects.toMatchObject({ code: 'PRINT_ALLOCATION_CHANGED' });
      const saved = await svc.saveAllocation(orgA, analyst, rfq.id, lines, 'Vasos con A por calidad de impresión; tapas con B por precio', 0);
      expect(saved.revision).toBe(1);
      allocationId = saved.id;
      const stored = (await svc.loadRfqWorkspace(orgA, rfq.id)).allocations[0];
      const first = stored.lines.find((l) => l.sku === 'CUP-12OZ-DW')!;
      expect(first).toMatchObject({ unit_price: 1000, provider_name: 'Gráfica Asunción', quantity: 1000 });
      expect(first.art_file_id).toBeTruthy();
    });

    it('analista no autoriza ni confirma; el administrador sí, con preview exacto e idempotencia', async () => {
      await expect(svc.authorizeAllocation(orgA, analyst, allocationId, true)).rejects.toMatchObject({ code: 'PRINT_ACTOR_NOT_ALLOWED' });
      await expect(svc.authorizeAllocation(orgA, boss, allocationId, false)).rejects.toMatchObject({ code: 'PRINT_CONFIRMATION_REQUIRED' });
      await expect(svc.previewOrders(orgA, boss, allocationId)).rejects.toMatchObject({ code: 'PRINT_ALLOCATION_NOT_AUTHORIZED' });
      await svc.authorizeAllocation(orgA, boss, allocationId, true);
      const preview = await svc.previewOrders(orgA, boss, allocationId);
      expect(preview.orders).toHaveLength(2);
      const a = preview.orders.find((o) => o.provider_name === 'Gráfica Asunción')!;
      // 1000 × 1000 × 1,10 + flete 100000
      expect(a).toMatchObject({ total: 1_200_000, tax_total: 100_000, freight: 100000, currency: 'PYG' });
      expect(a.items[0]).toMatchObject({ sku: 'CUP-12OZ-DW', quantity: 1000, unit_price: 1000 });
      expect(preview.hash).toMatch(/^[a-f0-9]{64}$/);
      expect((await svc.previewOrders(orgA, boss, allocationId)).hash).toBe(preview.hash);
      previewHash = preview.hash;
      await expect(svc.confirmOrders(orgA, boss, allocationId, previewHash, false)).rejects.toMatchObject({ code: 'PRINT_CONFIRMATION_REQUIRED' });
      await expect(svc.confirmOrders(orgA, boss, allocationId, 'f'.repeat(64), true)).rejects.toMatchObject({ code: 'PRINT_PREVIEW_INVALID' });
      await expect(svc.confirmOrders(orgA, analyst, allocationId, previewHash, true)).rejects.toMatchObject({ code: 'PRINT_ACTOR_NOT_ALLOWED' });
      await expect(svc.confirmOrders(orgB, outsider, allocationId, previewHash, true)).rejects.toMatchObject({ code: 'PRINT_ALLOCATION_NOT_FOUND' });
    });

    it('confirma y crea las órdenes con SKU y arte; confirmar de nuevo devuelve las mismas', async () => {
      const done = await svc.confirmOrders(orgA, boss, allocationId, previewHash, true);
      expect(done.already_confirmed).toBe(false);
      expect(done.order_ids).toHaveLength(2);
      const again = await svc.confirmOrders(orgA, boss, allocationId, previewHash, true);
      expect(again).toMatchObject({ already_confirmed: true });
      expect([...again.order_ids].sort()).toEqual([...done.order_ids].sort());
      const orders = await svc.listPurchaseOrders(orgA);
      const mine = orders.filter((o: any) => done.order_ids.includes(o.id));
      expect(mine.map((o: any) => o.code).sort()).toHaveLength(2);
      expect(mine.every((o: any) => /^OCI-\d{4}$/.test(o.code))).toBe(true);
      const detail = await svc.getPurchaseOrder(orgA, done.order_ids[0]);
      expect(detail.items[0].sku).toBeTruthy();
      expect(detail.items[0].art_file_id).toBeTruthy();
      expect(await svc.listPurchaseOrders(orgB)).toHaveLength(0);
      await expect(svc.getPurchaseOrder(orgB, done.order_ids[0])).rejects.toMatchObject({ status: 404 });
      const ws = await svc.loadRfqWorkspace(orgA, rfq.id);
      expect(ws.rfq.status).toBe('AUTORIZADO');
      expect(ws.orders).toHaveLength(2);
      expect(ws.events.map((e: any) => e.event)).toEqual(expect.arrayContaining(['rfq.created', 'rfq.art.registered', 'rfq.invited', 'rfq.quote.version_submitted', 'rfq.quote.reviewed', 'rfq.allocation.saved', 'rfq.allocation.authorized', 'rfq.orders.previewed', 'rfq.orders.confirmed']));
      // Con la compra confirmada, la solicitud queda cerrada
      await expect(svc.saveAllocation(orgA, analyst, rfq.id, [{ quote_version_item_id: ws.offers[0].id, quantity: 1 }], 'Intento tardío de nueva asignación', 1)).rejects.toBeTruthy();
      await expect(svc.transitionRfq(orgA, analyst, rfq.id, 'REOPEN', 5)).rejects.toMatchObject({ code: 'PRINT_RFQ_FINAL' });
    });
  });

  it('si cambia el arte después de cotizar, esa oferta queda desactualizada y no se puede asignar', async () => {
    const rfq = await openRfq();
    await svc.inviteProviders(orgA, analyst, rfq.id, [provA]);
    const [inv] = await invitationsOf(rfq.id);
    await respond(rfq.id, inv.token, inv.id, rfq.items, [100, 100]);
    await reviewAll(rfq.id);
    let ws = await svc.loadRfqWorkspace(orgA, rfq.id);
    expect(ws.offers.every((o) => !o.art_stale)).toBe(true);
    await svc.storeFile(orgA, rfq.id, { kind: 'ART', fileName: 'arte-v2.png', content: png(99), rfqItemId: rfq.items[0].id, actor: analyst });
    ws = await svc.loadRfqWorkspace(orgA, rfq.id);
    expect(ws.offers.filter((o) => o.art_stale).map((o) => o.rfq_item_id)).toEqual([rfq.items[0].id]);
    const stale = ws.offers.find((o) => o.art_stale)!;
    await expect(svc.saveAllocation(orgA, analyst, rfq.id, [{ quote_version_item_id: stale.id, quantity: 10 }], 'Asigno con arte desactualizado', 0)).rejects.toMatchObject({ code: 'PRINT_QUOTE_ART_STALE' });
    // El otro ítem sigue vigente
    const fresh = ws.offers.find((o) => !o.art_stale)!;
    expect((await svc.saveAllocation(orgA, analyst, rfq.id, [{ quote_version_item_id: fresh.id, quantity: 10 }], 'Asigno solo la línea con arte vigente', 0)).revision).toBe(1);
  });

  it('descubrimiento de costos: compara y se cierra sin compra', async () => {
    const rfq = await openRfq('COST_DISCOVERY');
    await svc.inviteProviders(orgA, analyst, rfq.id, [provA]);
    const [inv] = await invitationsOf(rfq.id);
    await respond(rfq.id, inv.token, inv.id, rfq.items, [10, 10]);
    await reviewAll(rfq.id);
    const ws = await svc.loadRfqWorkspace(orgA, rfq.id);
    await expect(svc.saveAllocation(orgA, analyst, rfq.id, [{ quote_version_item_id: ws.offers[0].id, quantity: 1 }], 'Descubrimiento no compra nada', 0)).rejects.toMatchObject({ code: 'PRINT_RFQ_NOT_PURCHASABLE' });
    await svc.transitionRfq(orgA, analyst, rfq.id, 'CLOSE_DISCOVERY');
    const closed = await svc.loadRfqWorkspace(orgA, rfq.id);
    expect(closed.rfq).toMatchObject({ status: 'CERRADO' });
    expect(closed.rfq.closed_at).toBeTruthy();
  });

  it('aislamiento: otra organización no ve solicitudes ni puede operar sobre ellas', async () => {
    const mine = await svc.listRfqs(orgA);
    expect(mine.length).toBeGreaterThan(3);
    expect(mine[0]).toMatchObject({ items: expect.any(Number), invited: expect.any(Number) });
    expect(await svc.listRfqs(orgB)).toHaveLength(0);
    await expect(svc.loadRfqWorkspace(orgB, mine[0].id)).rejects.toMatchObject({ code: 'PRINT_RFQ_NOT_FOUND', status: 404 });
    await expect(svc.inviteProviders(orgB, outsider, mine[0].id, [provA])).rejects.toBeTruthy();
    expect((await svc.listRfqs(orgA, { q: 'IMP-0001' })).every((r: any) => r.code.includes('IMP-0001'))).toBe(true);
  });
});
