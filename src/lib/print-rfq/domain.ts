import { z } from 'zod';

/**
 * Reglas puras del RFQ a imprentas. Portadas del RFQ de Control de Facturas: el sistema propone, el humano asigna,
 * autoriza y confirma. Nada acá escribe en la base.
 */
export const purposeSchema = z.enum(['COST_DISCOVERY', 'PROCUREMENT']);
export type PrintRfqPurpose = z.infer<typeof purposeSchema>;
export const CURRENCIES = ['PYG', 'USD', 'EUR', 'BRL', 'ARS'] as const;
export const PRINT_PROCESSES = ['Flexografía', 'Offset', 'Huecograbado', 'Digital', 'Serigrafía', 'Hot stamping', 'Otro'] as const;

const positive = z.number().finite().positive().max(9_999_999_999);

/** Ficha de impresión del ítem: lo que la imprenta necesita saber además del arte. */
export const printSpecSchema = z.object({
  process: z.string().trim().max(60).optional(),
  substrate: z.string().trim().max(200).optional(),
  colors: z.string().trim().max(200).optional(),
  dimensions: z.string().trim().max(200).optional(),
  finish: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();
export type PrintSpec = z.infer<typeof printSpecSchema>;

export const rfqItemSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1000),
  quantity: positive,
  unit: z.string().trim().min(1).max(50),
  product_attribute_id: z.string().uuid().nullable().optional(),
  print_spec: printSpecSchema.optional(),
});
export const rfqHeaderSchema = z.object({
  purpose: purposeSchema,
  title: z.string().trim().min(1).max(200),
  specifications: z.string().trim().max(5000).optional(),
  required_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
});
export const createRfqSchema = z.object({ header: rfqHeaderSchema, items: z.array(rfqItemSchema).min(1).max(200) });

export const providerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  ruc: z.string().trim().max(30).optional().or(z.literal('')),
  contact_name: z.string().trim().max(200).optional().or(z.literal('')),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  processes: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  active: z.boolean().default(true),
});

export const offerSchema = z.object({
  budget_number: z.string().trim().min(1).max(200),
  currency: z.enum(CURRENCIES),
  vat_included: z.boolean(),
  invoice_available: z.boolean(),
  valid_until: z.string().datetime({ offset: true }),
  freight: z.number().finite().min(0).max(9_999_999_999),
  payment_terms: z.string().trim().min(1).max(2000),
  delivery_time: z.string().trim().max(500).nullable().optional(),
  observations: z.string().max(5000).nullable().optional(),
});
export const offerLineSchema = z.object({
  rfq_item_id: z.string().uuid(),
  unit_price: positive.nullable(),
  available_quantity: z.number().finite().min(0).max(9_999_999_999),
  tax_rate: z.number().finite().min(0).max(100),
  lead_time_days: z.number().int().min(0).max(3650),
  observations: z.string().max(2000).nullable().optional(),
}).refine((l) => l.available_quantity === 0 || l.unit_price !== null, 'Si hay disponibilidad, el precio es obligatorio');

export const allocationLineSchema = z.object({ quote_version_item_id: z.string().uuid(), quantity: positive });
export const allocationSchema = z.array(allocationLineSchema).min(1).max(200)
  .refine((lines) => new Set(lines.map((l) => l.quote_version_item_id)).size === lines.length, 'Línea duplicada')
  .refine((lines) => lines.every((l) => Math.abs(l.quantity * 10000 - Math.round(l.quantity * 10000)) < 0.00001), 'Máximo cuatro decimales');

export type Offer = z.infer<typeof offerSchema>;
export type OfferLine = z.infer<typeof offerLineSchema>;
export type AllocationLine = z.infer<typeof allocationLineSchema>;

export interface RfqItem { id: string; sku: string; description: string; quantity: number; unit: string; print_spec: PrintSpec; art_files: ArtFile[] }
export interface ArtFile { id: string; file_name: string; content_type: string; size_bytes: number; sha256: string; created_at: string }

/** Una línea de presupuesto de una imprenta, con la evidencia necesaria para compararla. */
export interface ComparativeLine extends OfferLine {
  id: string;
  quote_version_id: string;
  provider_id: string;
  provider_name: string;
  version_number: number;
  currency: string;
  vat_included: boolean;
  freight: number | null;
  payment_terms: string | null;
  delivery_time?: string | null;
  valid_until: string | null;
  budget_file_id: string | null;
  review_id: string | null;
  revoked: boolean;
  /** El arte cotizado ya no es el vigente. */
  art_stale: boolean;
  review_resolution?: string | null;
  review_discrepancies?: Array<{ field: string; reason: string }>;
}

export interface RfqAllocation {
  id: string;
  revision: number;
  justification: string;
  lines: Array<Record<string, unknown>>;
  authorized_at: string | null;
  confirmed_at: string | null;
}

export interface OrderPreview {
  allocation_id: string;
  hash: string;
  orders: Array<{
    provider_id: string; provider_name: string; currency: string; freight: number; payment_terms: string; total: number; tax_total: number; vat_included: boolean;
    quote_version_id: string; rfq_id: string; allocation_id: string;
    items: Array<{ rfq_item_id: string; quote_version_item_id: string; sku: string; product: string; quantity: number; unit: string; unit_price: number; tax_rate: number; total: number; lead_time_days: number; expected_delivery_date: string }>;
  }>;
}

const OPEN_STATUSES = ['BORRADOR', 'COTIZANDO', 'OFERTAS_RECIBIDAS'];
export const isRfqOpen = (rfq: { status: string; expires_at: string }, now = Date.now()) => OPEN_STATUSES.includes(rfq.status) && Date.parse(rfq.expires_at) > now;

export function magicLinkOpen(
  invitation: { token_revoked_at?: string | null; token_expires_at?: string | null },
  rfq: { expires_at: string; status: string },
  now = Date.now(),
) {
  return !invitation.token_revoked_at && isRfqOpen(rfq, now) && Date.parse(invitation.token_expires_at ?? rfq.expires_at) > now;
}

export function eligibleLine(line: ComparativeLine, now = Date.now(), requireReview = true) {
  return !line.revoked && !line.art_stale && line.unit_price != null && Number.isFinite(line.unit_price) && line.unit_price > 0
    && line.available_quantity > 0 && line.tax_rate != null && line.lead_time_days != null && line.freight != null
    && !!line.valid_until && Date.parse(line.valid_until) > now && !!line.budget_file_id && !!line.payment_terms
    && (!requireReview || !!line.review_id);
}

export function validateAllocation(lines: AllocationLine[], items: RfqItem[], offers: ComparativeLine[], now = Date.now()) {
  allocationSchema.parse(lines);
  const totals = new Map<string, number>();
  for (const l of lines) {
    const offer = offers.find((o) => o.id === l.quote_version_item_id);
    if (!offer || !eligibleLine(offer, now)) throw new Error('Oferta ajena, incompleta, vencida, con arte desactualizado o sin revisión');
    if (l.quantity > offer.available_quantity) throw new Error('Disponibilidad insuficiente');
    const item = items.find((i) => i.id === offer.rfq_item_id);
    if (!item) throw new Error('Ítem ajeno');
    const total = (totals.get(item.id) ?? 0) + l.quantity;
    if (Math.round(total * 10000) > Math.round(item.quantity * 10000)) throw new Error('Sobreasignación');
    totals.set(item.id, total);
  }
  return items.map((i) => ({ itemId: i.id, unallocated: Math.max(0, i.quantity - (totals.get(i.id) ?? 0)) }));
}

export type ProposalKind = 'ONE_SUPPLIER' | 'CHEAPEST' | 'FASTEST' | 'WEIGHTED' | 'PARTIAL';
export interface Proposal { kind: ProposalKind; label: string; currency: string; lines: AllocationLine[]; warnings: string[]; decision: false }
export interface ProposalWeights { price: number; lead: number; availability: number }

/** Propuestas puras: nunca guardan decisiones, autorizaciones ni órdenes. Sin tipo de cambio inventado: se compara por moneda. */
export function proposeAllocations(items: RfqItem[], offers: ComparativeLine[], opts: { now?: number; weights?: ProposalWeights } = {}): Proposal[] {
  const valid = offers.filter((o) => eligibleLine(o, opts.now));
  const weights = opts.weights ?? { price: 0.5, lead: 0.3, availability: 0.2 };
  if (Object.values(weights).some((x) => !Number.isFinite(x) || x < 0) || Object.values(weights).reduce((a, b) => a + b, 0) <= 0) throw new Error('Pesos inválidos');
  const results: Proposal[] = [];
  const currencies = [...new Set(valid.map((o) => o.currency))];
  const cost = (o: ComparativeLine) => o.unit_price! * (o.vat_included ? 1 : 1 + o.tax_rate / 100);

  const push = (kind: ProposalKind, label: string, currency: string, candidates: ComparativeLine[], rank: (a: ComparativeLine, b: ComparativeLine) => number) => {
    const lines: AllocationLine[] = [];
    for (const item of items) {
      let left = item.quantity;
      for (const offer of candidates.filter((o) => o.rfq_item_id === item.id).sort(rank)) {
        const qty = Math.min(left, offer.available_quantity);
        if (qty > 0) lines.push({ quote_version_item_id: offer.id, quantity: qty });
        left = Math.max(0, left - qty);
        if (left === 0) break;
      }
    }
    if (!lines.length) return;
    const residual = validateAllocation(lines, items, valid, opts.now);
    results.push({
      kind, label, currency, lines, decision: false,
      warnings: [
        ...(currencies.length > 1 ? ['Comparación por moneda; sin tipo de cambio'] : []),
        ...residual.filter((x) => x.unallocated > 0).map((x) => `Sin asignar ${x.unallocated}: ${items.find((i) => i.id === x.itemId)?.description}`),
        'El flete es fijo y completo por imprenta; revisar totales en el preview',
      ],
    });
  };

  for (const currency of currencies) {
    const pool = valid.filter((o) => o.currency === currency);
    for (const provider of new Set(pool.map((o) => o.provider_id))) {
      push('ONE_SUPPLIER', `Todo lo disponible con ${pool.find((o) => o.provider_id === provider)!.provider_name}`, currency, pool.filter((o) => o.provider_id === provider), (a, b) => cost(a) - cost(b));
    }
    push('CHEAPEST', 'Menor precio por ítem', currency, pool, (a, b) => cost(a) - cost(b));
    push('FASTEST', 'Mejor plazo de entrega', currency, pool, (a, b) => a.lead_time_days - b.lead_time_days || cost(a) - cost(b));
    const maxCost = Math.max(...pool.map(cost), 1);
    const maxLead = Math.max(...pool.map((o) => o.lead_time_days), 1);
    const score = (o: ComparativeLine) => weights.price * (1 - cost(o) / maxCost) + weights.lead * (1 - o.lead_time_days / maxLead)
      + weights.availability * Math.min(1, o.available_quantity / (items.find((i) => i.id === o.rfq_item_id)?.quantity ?? Infinity));
    push('WEIGHTED', 'Escenario ponderado (precio, plazo, disponibilidad)', currency, pool, (a, b) => score(b) - score(a));
  }
  return results;
}

/** Hechos que una persona transcribe del presupuesto original para compararlos con lo cargado. */
export interface DocumentFact {
  rfq_item_id: string;
  unit_price?: number | null;
  currency?: string;
  tax_rate?: number;
  available_quantity?: number;
  lead_time_days?: number;
  freight?: number;
  payment_terms?: string;
  valid_until?: string;
}
export const documentFactsSchema = z.array(z.object({
  rfq_item_id: z.string().uuid(),
  unit_price: z.number().finite().nonnegative().nullable().optional(),
  currency: z.string().max(10).optional(),
  tax_rate: z.number().finite().min(0).max(100).optional(),
  available_quantity: z.number().finite().nonnegative().optional(),
  lead_time_days: z.number().int().nonnegative().optional(),
  freight: z.number().finite().nonnegative().optional(),
  payment_terms: z.string().max(2000).optional(),
  valid_until: z.string().max(100).optional(),
})).max(200);

export interface Discrepancy { itemId: string; field: string; structured: unknown; document: unknown; reason: string }
const FACT_FIELDS = ['unit_price', 'currency', 'tax_rate', 'available_quantity', 'lead_time_days', 'freight', 'payment_terms', 'valid_until'] as const;

export function reconcileOffer(offers: ComparativeLine[], facts: DocumentFact[]): Discrepancy[] {
  return offers.flatMap<Discrepancy>((o) => {
    const fact = facts.find((f) => f.rfq_item_id === o.rfq_item_id);
    if (!fact) return [{ itemId: o.rfq_item_id, field: 'document', structured: null, document: null, reason: 'No identificado en el documento' }];
    return FACT_FIELDS.flatMap((field) => {
      if (fact[field] === undefined) return [{ itemId: o.rfq_item_id, field, structured: o[field], document: null, reason: 'Sin evidencia transcripta' }];
      const sameDate = field === 'valid_until' && Number.isFinite(Date.parse(String(fact[field]))) && Date.parse(String(fact[field])) === Date.parse(String(o[field]));
      return sameDate || fact[field] === o[field] ? [] : [{ itemId: o.rfq_item_id, field, structured: o[field], document: fact[field], reason: 'Discrepancia' }];
    });
  });
}
