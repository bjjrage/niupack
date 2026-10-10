/**
 * Comparador de cotizaciones por ítem y proveedor.
 * Cadena: Cotización → Normalización → Benchmark → Costo NIUPACK → Brecha → Simulación → Estrategia.
 * Puro: el tipo de cambio y las hojas de costo se inyectan (sin red ni valores fijos). Solo propone; la decisión es humana.
 */

export type Incoterm = 'EXW' | 'FOB' | 'CIF' | 'CIP' | 'DDP';
const INCOTERM_LEVEL: Record<string, number> = { EXW: 0, FOB: 1, CIF: 2, CIP: 2, DDP: 3 };

export interface ComparatorRfqItem { id: string; line_no: number; sku: string; description?: string | null; quantity: number; unit: string }

export interface ComparatorQuoteItem {
  rfq_item_id: string | null;
  unit_price: number;
  moq: number | null;
  lead_time_days: number | null;
  price_scales: Array<{ min_qty: number; unit_price: number }>;
  technical_compliance: 'COMPLIES' | 'PARTIAL' | 'NOT_COMPLIES' | 'UNKNOWN';
  field_states?: Record<string, unknown>;
}

export interface ComparatorQuote {
  id: string;
  supplier_id: string;
  supplier_name: string;
  version: number;
  status: 'EXTRACTED' | 'SUBMITTED' | 'REVIEWED' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
  source_channel: string;
  currency: string;
  incoterm: string;
  lead_time_days: number | null;
  validity_date: string | null;
  tooling_cost: number;
  freight_included: boolean;
  fx_rate_to_usd: number | null;
  fx_rate_source: string | null;
  fx_rate_date: string | null;
  logistics_cost_per_unit_usd: number | null;
  logistics_cost_source: string | null;
  origin_country: string | null;
  manufacturer: string | null;
  payment_terms: string | null;
  items: ComparatorQuoteItem[];
}

export interface FxResult { rate_to_usd: number; source: string; as_of?: string | null; warning?: string }
export type FxResolver = (currency: string, quote: ComparatorQuote) => FxResult | null;

export interface CostSheetRef { sku: string; sheet_id: string; version: number; true_unit_cost_usd: number }

export interface Flag { code: string; severity: 'blocker' | 'warning' | 'info'; text: string }

export interface OfferRow {
  supplier_id: string;
  supplier_name: string;
  quote_id: string;
  version: number;
  quote_status: ComparatorQuote['status'];
  source_channel: string;
  validated: boolean;
  currency: string;
  incoterm: string;
  unit_price_original: number;
  applied_scale_min_qty: number | null;
  quantity: number;
  moq: number | null;
  lead_time_days: number | null;
  validity_date: string | null;
  technical_compliance: ComparatorQuoteItem['technical_compliance'];
  fx: { rate_to_usd: number; source: string; as_of: string | null } | null;
  normalized_unit_price_usd: number | null;
  /** Precio llevado a la base Incoterm de comparación (requiere costo logístico explícito si difiere). */
  comparable_unit_price_usd: number | null;
  logistics_adjustment_usd: number | null;
  comparable: boolean;
  flags: Flag[];
  rank: number | null;
  benchmark: Benchmark | null;
}

export interface Benchmark {
  niupack_unit_cost_usd: number;
  cost_sheet_version: number;
  gap_usd: number;
  gap_percent: number;
  simulation: { quantity: number; offer_total_usd: number; niupack_total_usd: number; delta_total_usd: number };
  strategy: 'OFERTA_BAJO_COSTO_NIUPACK' | 'OFERTA_SOBRE_COSTO_NIUPACK' | 'EQUIVALENTE';
}

export interface ItemComparison {
  rfq_item_id: string;
  line_no: number;
  sku: string;
  quantity: number;
  basis_incoterm: string;
  cost_sheet: { available: boolean; version?: number; reason?: string };
  offers: OfferRow[];
  proposal: null | {
    quote_id: string;
    supplier_id: string;
    supplier_name: string;
    confidence: 'ALTA' | 'MEDIA' | 'BAJA';
    reasons: string[];
    note: string;
  };
}

export interface Comparison {
  generated_at: string;
  basis_incoterm: string;
  items: ItemComparison[];
  missing_suppliers: Array<{ supplier_id: string; supplier_name: string; reason: string }>;
}

const round = (value: number, digits = 6) => Math.round(value * 10 ** digits) / 10 ** digits;

function pickPrice(item: ComparatorQuoteItem, quantity: number): { price: number; scaleMin: number | null } {
  const eligible = (item.price_scales ?? []).filter((s) => s.min_qty <= quantity && s.unit_price > 0).sort((a, b) => b.min_qty - a.min_qty);
  return eligible.length ? { price: eligible[0].unit_price, scaleMin: eligible[0].min_qty } : { price: item.unit_price, scaleMin: null };
}

export function compareQuotes(input: {
  rfq: { incoterm: string; items: ComparatorRfqItem[] };
  quotes: ComparatorQuote[];
  suppliers: Array<{ id: string; name: string }>;
  fx: FxResolver;
  costs: Map<string, CostSheetRef | null>;
  now?: Date;
  basisIncoterm?: string;
}): Comparison {
  const now = input.now ?? new Date();
  const basis = (input.basisIncoterm ?? input.rfq.incoterm ?? 'FOB').toUpperCase();
  // Solo cotizaciones vigentes: lo reemplazado queda en el historial, no en el comparador.
  const current = input.quotes.filter((q) => q.status !== 'SUPERSEDED' && q.status !== 'REJECTED');
  const items: ItemComparison[] = [];

  for (const rfqItem of [...input.rfq.items].sort((a, b) => a.line_no - b.line_no)) {
    const cost = input.costs.get(rfqItem.sku) ?? null;
    const offers: OfferRow[] = [];

    for (const quote of current) {
      const qItem = quote.items.find((i) => i.rfq_item_id === rfqItem.id);
      if (!qItem) continue;
      const flags: Flag[] = [];
      const validated = quote.status === 'REVIEWED' || quote.status === 'ACCEPTED';
      const { price, scaleMin } = pickPrice(qItem, rfqItem.quantity);

      if (quote.status === 'EXTRACTED') flags.push({ code: 'SIN_VALIDAR', severity: 'blocker', text: 'Datos extraídos automáticamente: falta validación humana' });
      if (quote.validity_date && new Date(`${quote.validity_date}T23:59:59`) < now) flags.push({ code: 'OFERTA_VENCIDA', severity: 'blocker', text: `Vigencia vencida (${quote.validity_date})` });
      if (!quote.validity_date) flags.push({ code: 'SIN_VIGENCIA', severity: 'warning', text: 'La oferta no informa vigencia' });
      if (qItem.moq && qItem.moq > rfqItem.quantity) flags.push({ code: 'MOQ_SUPERIOR', severity: 'blocker', text: `MOQ ${qItem.moq.toLocaleString('es-PY')} supera la cantidad pedida (${rfqItem.quantity.toLocaleString('es-PY')})` });
      if (qItem.technical_compliance === 'NOT_COMPLIES') flags.push({ code: 'NO_CUMPLE_ESPECIFICACION', severity: 'blocker', text: 'No cumple la especificación técnica' });
      else if (qItem.technical_compliance === 'UNKNOWN') flags.push({ code: 'CUMPLIMIENTO_NO_VERIFICADO', severity: 'warning', text: 'Cumplimiento técnico no verificado' });
      else if (qItem.technical_compliance === 'PARTIAL') flags.push({ code: 'CUMPLIMIENTO_PARCIAL', severity: 'warning', text: 'Cumple parcialmente la especificación' });
      if (quote.tooling_cost > 0) flags.push({ code: 'HERRAMENTAL_APARTE', severity: 'info', text: `Herramental/clisés aparte: ${quote.tooling_cost} ${quote.currency} (no incluido en el precio unitario)` });

      const fx = quote.currency.toUpperCase() === 'USD'
        ? { rate_to_usd: 1, source: 'USD', as_of: null as string | null }
        : (() => {
            const resolved = input.fx(quote.currency.toUpperCase(), quote);
            if (resolved?.warning) flags.push({ code: 'FX_ADVERTENCIA', severity: 'warning', text: resolved.warning });
            return resolved ? { rate_to_usd: resolved.rate_to_usd, source: resolved.source, as_of: resolved.as_of ?? null } : null;
          })();
      if (!fx) flags.push({ code: 'MONEDA_SIN_TIPO_DE_CAMBIO', severity: 'blocker', text: `No hay tipo de cambio validado para ${quote.currency}` });
      const normalized = fx ? round(price * fx.rate_to_usd) : null;

      // Base Incoterm: si la oferta incluye más o menos que la base, solo se ajusta con un costo logístico explícito.
      let comparablePrice: number | null = normalized;
      let adjustment: number | null = null;
      const offerLevel = INCOTERM_LEVEL[quote.incoterm.toUpperCase()];
      const basisLevel = INCOTERM_LEVEL[basis];
      if (normalized !== null) {
        if (offerLevel === undefined || basisLevel === undefined) {
          comparablePrice = null;
          flags.push({ code: 'INCOTERM_NO_RECONOCIDO', severity: 'blocker', text: `Incoterm ${quote.incoterm} no se puede llevar a la base ${basis}` });
        } else if (offerLevel !== basisLevel) {
          if (quote.logistics_cost_per_unit_usd === null) {
            comparablePrice = null;
            flags.push({ code: 'INCOTERM_DISTINTO_SIN_LOGISTICA', severity: 'blocker', text: `Oferta ${quote.incoterm} vs base ${basis}: falta el costo logístico por unidad para igualar condiciones` });
          } else {
            adjustment = offerLevel < basisLevel ? quote.logistics_cost_per_unit_usd : -quote.logistics_cost_per_unit_usd;
            comparablePrice = round(normalized + adjustment);
            flags.push({ code: 'AJUSTE_LOGISTICO', severity: 'info', text: `Ajustado de ${quote.incoterm} a ${basis} con ${quote.logistics_cost_per_unit_usd} USD/u (${quote.logistics_cost_source ?? 'fuente no informada'})` });
            if (!quote.logistics_cost_source) flags.push({ code: 'LOGISTICA_SIN_FUENTE', severity: 'warning', text: 'El costo logístico no indica su fuente' });
          }
        }
      }

      const comparable = comparablePrice !== null && !flags.some((f) => f.severity === 'blocker');
      let benchmark: Benchmark | null = null;
      if (comparablePrice !== null && cost) {
        const gap = round(comparablePrice - cost.true_unit_cost_usd);
        const gapPercent = cost.true_unit_cost_usd > 0 ? round((gap / cost.true_unit_cost_usd) * 100, 2) : 0;
        benchmark = {
          niupack_unit_cost_usd: cost.true_unit_cost_usd, cost_sheet_version: cost.version, gap_usd: gap, gap_percent: gapPercent,
          simulation: {
            quantity: rfqItem.quantity, offer_total_usd: round(comparablePrice * rfqItem.quantity, 2),
            niupack_total_usd: round(cost.true_unit_cost_usd * rfqItem.quantity, 2), delta_total_usd: round(gap * rfqItem.quantity, 2),
          },
          strategy: gap < 0 ? 'OFERTA_BAJO_COSTO_NIUPACK' : gap > 0 ? 'OFERTA_SOBRE_COSTO_NIUPACK' : 'EQUIVALENTE',
        };
      }

      offers.push({
        supplier_id: quote.supplier_id, supplier_name: quote.supplier_name, quote_id: quote.id, version: quote.version, quote_status: quote.status,
        source_channel: quote.source_channel, validated, currency: quote.currency.toUpperCase(), incoterm: quote.incoterm.toUpperCase(),
        unit_price_original: price, applied_scale_min_qty: scaleMin, quantity: rfqItem.quantity, moq: qItem.moq,
        lead_time_days: qItem.lead_time_days ?? quote.lead_time_days, validity_date: quote.validity_date, technical_compliance: qItem.technical_compliance,
        fx, normalized_unit_price_usd: normalized, comparable_unit_price_usd: comparablePrice, logistics_adjustment_usd: adjustment,
        comparable, flags, rank: null, benchmark,
      });
    }

    const ranked = offers.filter((o) => o.comparable).sort((a, b) => (a.comparable_unit_price_usd as number) - (b.comparable_unit_price_usd as number));
    ranked.forEach((offer, index) => { offer.rank = index + 1; });

    let proposal: ItemComparison['proposal'] = null;
    if (ranked.length) {
      const best = ranked[0];
      const reasons = [`Menor precio comparable en base ${basis}: ${best.comparable_unit_price_usd} USD/u`];
      let confidence: 'ALTA' | 'MEDIA' | 'BAJA' = 'BAJA';
      if (ranked.length === 1) reasons.push('Es la única oferta comparable: sin alternativas para contrastar');
      if (!cost) reasons.push('Sin hoja de costos vigente para el SKU: la propuesta no puede ser de confianza alta');
      if (!best.validated) reasons.push('La cotización no tiene validación interna');
      if (best.technical_compliance !== 'COMPLIES') reasons.push('Cumplimiento técnico no confirmado');
      if (cost && best.validated && best.technical_compliance === 'COMPLIES' && ranked.length > 1) confidence = 'ALTA';
      else if (cost && best.validated) confidence = 'MEDIA';
      proposal = {
        quote_id: best.quote_id, supplier_id: best.supplier_id, supplier_name: best.supplier_name, confidence, reasons,
        note: 'Propuesta del motor: no adjudica, no emite orden de compra ni modifica precios o costos oficiales. La decisión es humana.',
      };
    }

    items.push({
      rfq_item_id: rfqItem.id, line_no: rfqItem.line_no, sku: rfqItem.sku, quantity: rfqItem.quantity, basis_incoterm: basis,
      cost_sheet: cost ? { available: true, version: cost.version } : { available: false, reason: 'No hay hoja de costos vigente para este SKU en Cost Intelligence' },
      offers: offers.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.supplier_name.localeCompare(b.supplier_name)),
      proposal,
    });
  }

  const quotedSuppliers = new Set(current.map((q) => q.supplier_id));
  return {
    generated_at: now.toISOString(),
    basis_incoterm: basis,
    items,
    missing_suppliers: input.suppliers.filter((s) => !quotedSuppliers.has(s.id)).map((s) => ({ supplier_id: s.id, supplier_name: s.name, reason: 'Todavía no respondió' })),
  };
}
