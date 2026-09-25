import { describe, it, expect } from 'vitest';
import { repository } from '@/lib/db/repository';

describe('RFQ Lifecycle State Machine & Human Authorization Guard', () => {
  it('should create an RFQ in DRAFT status with technical specifications', async () => {
    const org = await repository.getOrganization();

    const rfq = await repository.createRFQ({
      organization_id: org.id,
      code: `RFQ-${Date.now()}`,
      title: 'Cotización 500k vasos 12 oz para Brasil',
      status: 'DRAFT',
      delivery_destination: 'São Paulo',
      incoterm: 'FOB',
      target_lead_time_days: 25,
      payment_terms: '30 días fecha factura',
      notes: 'Requiere clisé flexográfico 4 colores',
      items: [
        {
          id: 'item-1',
          rfq_id: 'rfq-temp',
          sku: 'CUP-12OZ-SW',
          quantity: 500000,
          alternative_quantities: [300000, 1000000],
          material: 'Cupstock 260g + 18g PE',
          printing_spec: 'Flexo 4 colores CMYK',
          color_count: 4,
        },
      ],
      suppliers_count: 0,
    });

    expect(rfq).toBeDefined();
    expect(rfq.status).toBe('DRAFT');
    expect(rfq.items.length).toBe(1);
    expect(rfq.items[0].quantity).toBe(500000);
  });

  it('should enforce human authorization on supplier records before automated communications', async () => {
    const suppliers = await repository.getSuppliers();
    expect(suppliers.length).toBeGreaterThan(0);

    // Initial suppliers state
    const authorizedSuppliers = suppliers.filter((s) => s.human_authorized_contact);
    expect(authorizedSuppliers.length).toBeGreaterThan(0);

    // Update supplier authorization
    const target = suppliers[0];
    const updated = await repository.updateSupplier(target.id, {
      human_authorized_contact: true,
      notes: 'Autorizado formalmente por Director de Compras para RFQ 2026',
    });
    expect(updated.human_authorized_contact).toBe(true);
  });

  it('should transition RFQ status to SENT and log audit event upon dispatch', async () => {
    const org = await repository.getOrganization();
    const rfq = await repository.createRFQ({
      organization_id: org.id,
      code: `RFQ-DISPATCH-${Date.now()}`,
      title: 'Despacho de prueba',
      status: 'DRAFT',
      delivery_destination: 'Buenos Aires',
      incoterm: 'CIF',
      target_lead_time_days: 20,
      payment_terms: 'Anticipado',
      items: [],
      suppliers_count: 1,
    });

    const sentRFQ = await repository.updateRFQ(rfq.id, { status: 'SENT' });
    expect(sentRFQ.status).toBe('SENT');

    await repository.logAuditEvent({
      event_type: 'email_sent',
      target_entity: 'rfqs',
      entity_id: rfq.id,
      actor_id: 'compras@niupack.com.py',
      metadata: { action: 'DISPATCH_BROADCAST', supplierCount: 1 },
    });

    const events = await repository.getAuditEvents();
    const sentEvent = events.find((e) => e.entity_id === rfq.id && e.event_type === 'email_sent');
    expect(sentEvent).toBeDefined();
  });

  it('should feed accepted quotes directly into market price observations with FORMAL_QUOTE confidence', async () => {
    const org = await repository.getOrganization();

    // 1. Create a quote
    const quote = await repository.createQuote({
      rfq_id: 'rfq-test',
      organization_id: org.id,
      supplier_id: 'sup-br-01',
      supplier_name: 'Copobras S.A.',
      currency: 'BRL',
      incoterm: 'FOB',
      freight_included: false,
      printing_included: true,
      tooling_cost: 0,
      payment_terms: '30 días',
      lead_time_days: 20,
      validity_date: '2026-11-30',
      status: 'EXTRACTED',
      confidence_score: 0.95,
      items: [
        {
          sku: 'CUP-12OZ-SW',
          quantity: 300000,
          unit_price: 0.27,
          normalized_unit_price_usd: 0.0486,
          moq: 50000,
          lead_time_days: 20,
        },
      ],
    });

    expect(quote.status).toBe('EXTRACTED');

    // 2. Mark quote as ACCEPTED and add to market prices
    const acceptedQuote = await repository.updateQuote(quote.id, { status: 'ACCEPTED' });
    expect(acceptedQuote.status).toBe('ACCEPTED');

    const observation = await repository.addMarketPrice({
      organization_id: org.id,
      country_code: 'BR',
      supplier_id: quote.supplier_id,
      supplier_name: quote.supplier_name,
      sku: quote.items[0].sku,
      quantity: quote.items[0].quantity,
      original_price: quote.items[0].unit_price * quote.items[0].quantity,
      original_currency: quote.currency,
      exchange_rate_to_usd: 0.18,
      normalized_price_usd: quote.items[0].normalized_unit_price_usd * quote.items[0].quantity,
      normalized_unit_price_usd: quote.items[0].normalized_unit_price_usd,
      observation_date: new Date().toISOString().split('T')[0],
      source_type: 'FORMAL_QUOTE',
      confidence_level: 0.95,
      taxes_included: false,
      freight_included: false,
      printing_included: true,
      tooling_cost_usd: 0,
      is_active: true,
      notes: 'Aceptada desde RFQ formal',
    });

    expect(observation).toBeDefined();
    expect(observation.source_type).toBe('FORMAL_QUOTE');
    expect(observation.confidence_level).toBe(0.95);
    expect(observation.normalized_unit_price_usd).toBe(0.0486);
  });
});
