export interface RfqItem {
  id: string; line_no: number; sku: string; description: string | null; quantity: number; unit: string; alternative_quantities: number[];
  material: string | null; printing_spec: string | null; packaging_spec: string | null; technical_conditions: string | null; product_id: string | null;
}

export interface Supplier { id: string; name: string; country_code: string; email: string | null; contact_name: string | null; status: string }

export interface Dispatch {
  id: string; supplier_id: string; status: 'PENDING' | 'PREPARED' | 'SENDING' | 'SENT' | 'FAILED' | 'REPLIED' | 'DECLINED' | 'REVOKED';
  recipient_email: string | null; subject: string | null; body_text: string | null; sent_at: string | null; send_attempts: number; last_error: string | null;
  token_expires_at: string | null; token_revoked_at: string | null; access_count: number; last_access_at: string | null; submitted_at: string | null;
}

export interface QuoteItemRow {
  id: string; rfq_item_id: string | null; sku: string; unit_price: number; moq: number | null; lead_time_days: number | null; technical_compliance: string;
  price_scales: Array<{ min_qty: number; unit_price: number }>; field_states: Record<string, unknown>;
}

export interface QuoteRow {
  id: string; supplier_id: string; version: number; status: 'EXTRACTED' | 'SUBMITTED' | 'REVIEWED' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
  source_channel: 'LINK' | 'MANUAL' | 'PDF' | 'GMAIL'; currency: string; incoterm: string; payment_terms: string | null; lead_time_days: number | null;
  validity_date: string | null; created_at: string; fx_rate_to_usd: number | null; fx_rate_source: string | null; logistics_cost_per_unit_usd: number | null;
  logistics_cost_source: string | null; submitted_by_label: string | null; quote_items: QuoteItemRow[];
}

export interface DocumentRow { id: string; supplier_id: string | null; quote_id: string | null; file_name: string; extraction_status: string; extraction_error: string | null; created_at: string }

export interface DecisionRow { id: string; rfq_item_id: string | null; supplier_id: string; quote_id: string; decision: 'SELECTED' | 'SHORTLISTED' | 'REJECTED' | 'DEFERRED'; rationale: string; decided_at: string; decided_by_profile_id: string }

export interface EventRow { id: string; event_type: string; supplier_id: string | null; actor_label: string | null; payload: Record<string, unknown>; created_at: string }

export interface RfqDetail {
  rfq: { id: string; code: string; title: string; status: string; incoterm: string; delivery_destination: string; payment_terms: string | null; deadline_at: string | null; validity_date: string | null; technical_conditions: string | null };
  items: RfqItem[]; dispatches: Dispatch[]; quotes: QuoteRow[]; documents: DocumentRow[]; decisions: DecisionRow[]; events: EventRow[]; suppliers: Supplier[];
}

export interface Flag { code: string; severity: 'blocker' | 'warning' | 'info'; text: string }

export interface Offer {
  supplier_id: string; supplier_name: string; quote_id: string; version: number; quote_status: string; source_channel: string; validated: boolean;
  currency: string; incoterm: string; unit_price_original: number; applied_scale_min_qty: number | null; quantity: number; moq: number | null; lead_time_days: number | null;
  validity_date: string | null; technical_compliance: string; fx: { rate_to_usd: number; source: string; as_of: string | null } | null;
  normalized_unit_price_usd: number | null; comparable_unit_price_usd: number | null; logistics_adjustment_usd: number | null; comparable: boolean; flags: Flag[]; rank: number | null;
  benchmark: null | { niupack_unit_cost_usd: number; cost_sheet_version: number; gap_usd: number; gap_percent: number; strategy: string; simulation: { quantity: number; offer_total_usd: number; niupack_total_usd: number; delta_total_usd: number } };
}

export interface ItemComparison {
  rfq_item_id: string; line_no: number; sku: string; quantity: number; basis_incoterm: string; cost_sheet: { available: boolean; version?: number; reason?: string };
  offers: Offer[]; proposal: null | { quote_id: string; supplier_id: string; supplier_name: string; confidence: 'ALTA' | 'MEDIA' | 'BAJA'; reasons: string[]; note: string };
}

export interface Comparison { generated_at: string; basis_incoterm: string; items: ItemComparison[]; missing_suppliers: Array<{ supplier_id: string; supplier_name: string; reason: string }> }

export async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string; message?: string; issues?: Array<{ path: string; message: string }> } }> {
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(url, { ...init, headers: isForm ? init?.headers : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export const DISPATCH_LABEL: Record<Dispatch['status'], string> = {
  PENDING: 'Pendiente', PREPARED: 'Preparado', SENDING: 'Enviando…', SENT: 'Enviado', FAILED: 'Fallido', REPLIED: 'Respondido', DECLINED: 'Declinó', REVOKED: 'Revocado',
};

export const QUOTE_STATUS_LABEL: Record<QuoteRow['status'], string> = {
  EXTRACTED: 'Extraída · sin validar', SUBMITTED: 'Recibida', REVIEWED: 'Validada', ACCEPTED: 'Validada', REJECTED: 'Rechazada', SUPERSEDED: 'Reemplazada',
};

export const CHANNEL_LABEL: Record<QuoteRow['source_channel'], string> = { LINK: 'Enlace del proveedor', MANUAL: 'Carga manual', PDF: 'PDF', GMAIL: 'Gmail' };

export function errorText(result: { status: number; data: { error?: string; message?: string; issues?: Array<{ path: string; message: string }> } }): string {
  if (result.data.issues?.length) return `Datos inválidos: ${result.data.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`;
  return result.data.message || result.data.error || `Error ${result.status}`;
}
