import { describe, expect, it } from 'vitest';
import { compareQuotes, type ComparatorQuote, type CostSheetRef, type FxResolver } from '@/lib/rfq/comparator';

const items = [
  { id: 'i1', line_no: 1, sku: 'CUNA-AMP-2ML', quantity: 100_000, unit: 'UN' },
  { id: 'i2', line_no: 2, sku: 'CUNA-AMP-5ML', quantity: 50_000, unit: 'UN' },
];
const base = (over: Partial<ComparatorQuote> & { id: string; supplier_id: string; supplier_name: string }): ComparatorQuote => ({
  version: 1, status: 'SUBMITTED', source_channel: 'MANUAL', currency: 'USD', incoterm: 'FOB', lead_time_days: 30, validity_date: '2099-12-31', tooling_cost: 0,
  freight_included: false, fx_rate_to_usd: null, fx_rate_source: null, fx_rate_date: null, logistics_cost_per_unit_usd: null, logistics_cost_source: null,
  origin_country: null, manufacturer: null, payment_terms: null, items: [], ...over,
});
const qi = (rfq_item_id: string, unit_price: number, over: object = {}) => ({ rfq_item_id, unit_price, moq: null, lead_time_days: null, price_scales: [], technical_compliance: 'COMPLIES' as const, ...over });
const noFx: FxResolver = () => null;
const costs = (map: Record<string, number | null>) => new Map<string, CostSheetRef | null>(Object.entries(map).map(([sku, c]) => [sku, c === null ? null : { sku, sheet_id: 's', version: 3, true_unit_cost_usd: c }]));
const suppliers = [{ id: 'a', name: 'Proveedor A' }, { id: 'b', name: 'Proveedor B' }, { id: 'c', name: 'Proveedor C' }];

describe('comparador de cotizaciones', () => {
  it('ordena por precio comparable por ítem y calcula brecha contra la hoja de costos', () => {
    const result = compareQuotes({
      rfq: { incoterm: 'FOB', items }, suppliers, fx: noFx, costs: costs({ 'CUNA-AMP-2ML': 0.04, 'CUNA-AMP-5ML': 0.06 }),
      quotes: [
        base({ id: 'qa', status: 'REVIEWED', supplier_id: 'a', supplier_name: 'Proveedor A', items: [qi('i1', 0.05), qi('i2', 0.07)] }),
        base({ id: 'qb', status: 'REVIEWED', supplier_id: 'b', supplier_name: 'Proveedor B', items: [qi('i1', 0.045), qi('i2', 0.08)] }),
      ],
    });
    const first = result.items[0];
    expect(first.offers.map((o) => o.supplier_id)).toEqual(['b', 'a']);
    expect(first.offers[0].rank).toBe(1);
    expect(first.offers[0].benchmark).toMatchObject({ niupack_unit_cost_usd: 0.04, gap_usd: 0.005, gap_percent: 12.5, strategy: 'OFERTA_SOBRE_COSTO_NIUPACK' });
    expect(first.offers[0].benchmark!.simulation.delta_total_usd).toBe(500);
    expect(result.items[1].offers[0].supplier_id).toBe('a');
    expect(first.proposal).toMatchObject({ supplier_id: 'b', confidence: 'ALTA' });
    expect(first.proposal!.note).toMatch(/no adjudica/);
  });

  it('no declara alta confianza sin hoja de costos vigente', () => {
    const result = compareQuotes({
      rfq: { incoterm: 'FOB', items: [items[0]] }, suppliers, fx: noFx, costs: costs({ 'CUNA-AMP-2ML': null }),
      quotes: [
        base({ id: 'qa', status: 'REVIEWED', supplier_id: 'a', supplier_name: 'A', items: [qi('i1', 0.05)] }),
        base({ id: 'qb', status: 'REVIEWED', supplier_id: 'b', supplier_name: 'B', items: [qi('i1', 0.06)] }),
      ],
    });
    const item = result.items[0];
    expect(item.cost_sheet.available).toBe(false);
    expect(item.proposal!.confidence).toBe('BAJA');
    expect(item.proposal!.reasons.join(' ')).toMatch(/hoja de costos/);
    expect(item.offers[0].benchmark).toBeNull();
  });

  it('marca NO COMPARABLE una moneda sin tipo de cambio validado, sin inventar factores', () => {
    const result = compareQuotes({
      rfq: { incoterm: 'FOB', items: [items[0]] }, suppliers, fx: noFx, costs: costs({}),
      quotes: [base({ id: 'qa', supplier_id: 'a', supplier_name: 'A', currency: 'BRL', items: [qi('i1', 0.28)] })],
    });
    const offer = result.items[0].offers[0];
    expect(offer.comparable).toBe(false);
    expect(offer.normalized_unit_price_usd).toBeNull();
    expect(offer.flags.map((f) => f.code)).toContain('MONEDA_SIN_TIPO_DE_CAMBIO');
    expect(result.items[0].proposal).toBeNull();
  });

  it('usa el tipo de cambio inyectado y lo informa con su fuente', () => {
    const fx: FxResolver = (currency) => (currency === 'BRL' ? { rate_to_usd: 0.2, source: 'Tipo de cambio validado por compras', as_of: '2026-10-01' } : null);
    const result = compareQuotes({
      rfq: { incoterm: 'FOB', items: [items[0]] }, suppliers, fx, costs: costs({}),
      quotes: [base({ id: 'qa', supplier_id: 'a', supplier_name: 'A', currency: 'BRL', items: [qi('i1', 0.25)] })],
    });
    const offer = result.items[0].offers[0];
    expect(offer.normalized_unit_price_usd).toBe(0.05);
    expect(offer.fx).toMatchObject({ rate_to_usd: 0.2, source: 'Tipo de cambio validado por compras' });
    expect(offer.comparable).toBe(true);
  });

  it('exige costo logístico explícito para igualar Incoterm distinto y lo aplica en el sentido correcto', () => {
    const quotes = [
      base({ id: 'qa', supplier_id: 'a', supplier_name: 'A', incoterm: 'CIF', items: [qi('i1', 0.06)] }),
      base({ id: 'qb', supplier_id: 'b', supplier_name: 'B', incoterm: 'CIF', logistics_cost_per_unit_usd: 0.004, logistics_cost_source: 'Cotización de flete 10/2026', items: [qi('i1', 0.06)] }),
      base({ id: 'qc', supplier_id: 'c', supplier_name: 'C', incoterm: 'EXW', logistics_cost_per_unit_usd: 0.005, logistics_cost_source: 'Agente', items: [qi('i1', 0.04)] }),
    ];
    const result = compareQuotes({ rfq: { incoterm: 'FOB', items: [items[0]] }, suppliers, fx: noFx, costs: costs({}), quotes });
    const by = (id: string) => result.items[0].offers.find((o) => o.supplier_id === id)!;
    expect(by('a').comparable).toBe(false);
    expect(by('a').flags.map((f) => f.code)).toContain('INCOTERM_DISTINTO_SIN_LOGISTICA');
    expect(by('b').comparable_unit_price_usd).toBe(0.056);
    expect(by('c').comparable_unit_price_usd).toBe(0.045);
  });

  it('excluye ofertas vencidas, con MOQ superior, incumplimiento técnico y datos sin validar', () => {
    const quotes = [
      base({ id: 'q1', supplier_id: 'a', supplier_name: 'A', validity_date: '2020-01-01', items: [qi('i1', 0.01)] }),
      base({ id: 'q2', supplier_id: 'b', supplier_name: 'B', items: [qi('i1', 0.02, { moq: 500_000 })] }),
      base({ id: 'q3', supplier_id: 'c', supplier_name: 'C', items: [qi('i1', 0.03, { technical_compliance: 'NOT_COMPLIES' })] }),
      base({ id: 'q4', supplier_id: 'd', supplier_name: 'D', status: 'EXTRACTED', source_channel: 'PDF', items: [qi('i1', 0.035)] }),
      base({ id: 'q5', supplier_id: 'e', supplier_name: 'E', items: [qi('i1', 0.09)] }),
    ];
    const result = compareQuotes({ rfq: { incoterm: 'FOB', items: [items[0]] }, suppliers, fx: noFx, costs: costs({}), quotes });
    const offers = result.items[0].offers;
    const code = (id: string) => offers.find((o) => o.quote_id === id)!.flags.map((f) => f.code);
    expect(code('q1')).toContain('OFERTA_VENCIDA');
    expect(code('q2')).toContain('MOQ_SUPERIOR');
    expect(code('q3')).toContain('NO_CUMPLE_ESPECIFICACION');
    expect(code('q4')).toContain('SIN_VALIDAR');
    expect(offers.filter((o) => o.comparable).map((o) => o.quote_id)).toEqual(['q5']);
    expect(result.items[0].proposal!.supplier_id).toBe('e');
  });

  it('aplica escalas de precio por cantidad y no usa cotizaciones reemplazadas', () => {
    const quotes = [
      base({ id: 'old', supplier_id: 'a', supplier_name: 'A', status: 'SUPERSEDED', items: [qi('i1', 0.001)] }),
      base({ id: 'new', supplier_id: 'a', supplier_name: 'A', version: 2, items: [qi('i1', 0.06, { price_scales: [{ min_qty: 50_000, unit_price: 0.05 }, { min_qty: 200_000, unit_price: 0.04 }] })] }),
    ];
    const result = compareQuotes({ rfq: { incoterm: 'FOB', items: [items[0]] }, suppliers, fx: noFx, costs: costs({}), quotes });
    expect(result.items[0].offers).toHaveLength(1);
    expect(result.items[0].offers[0]).toMatchObject({ quote_id: 'new', unit_price_original: 0.05, applied_scale_min_qty: 50_000 });
  });

  it('no asigna un ítem por defecto: una oferta sin ese ítem no aparece y los proveedores sin respuesta se listan', () => {
    const result = compareQuotes({
      rfq: { incoterm: 'FOB', items }, suppliers, fx: noFx, costs: costs({}),
      quotes: [base({ id: 'qa', supplier_id: 'a', supplier_name: 'A', items: [qi('i2', 0.07)] })],
    });
    expect(result.items[0].offers).toHaveLength(0);
    expect(result.items[0].proposal).toBeNull();
    expect(result.items[1].offers).toHaveLength(1);
    expect(result.missing_suppliers.map((s) => s.supplier_id)).toEqual(['b', 'c']);
  });
});
