import { z } from 'zod';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/db/supabase';
import { repository } from '@/lib/db/repository';
import { FxEngine } from '@/lib/fx/fx-provider';
import { compareQuotes, type ComparatorQuote, type Comparison, type CostSheetRef, type FxResolver } from './comparator';
import { extractQuoteFromText } from './extractor';
import { extractPdfText, looksLikePdf, MAX_DOCUMENT_BYTES, sha256Hex } from './pdf';
import { buildSupplierLink, generateLinkToken, hashLinkToken, isPlausibleToken } from './token';

export class RfqError extends Error {
  constructor(public code: string, public status: number, message?: string) {
    super(message ?? code);
    this.name = 'RfqError';
  }
}

const RPC_STATUS: Record<string, number> = {
  RFQ_NOT_FOUND: 404, SUPPLIER_NOT_FOUND: 404, QUOTE_NOT_FOUND: 404, RFQ_DISPATCH_NOT_FOUND: 404, RFQ_ITEM_NOT_IN_RFQ: 400, RFQ_ITEM_NOT_IN_QUOTE: 400,
  INVALID_RFQ: 400, INVALID_RFQ_ITEM: 400, INVALID_INVITATIONS: 400, INVALID_QUOTE_CURRENCY: 400, INVALID_QUOTE_ITEMS: 400, INVALID_QUOTE_PRICE: 400,
  INVALID_QUOTE_SOURCE: 400, INVALID_DOCUMENT_SIZE: 400, DUPLICATE_QUOTE_ITEM: 400, SUPPLIER_EMAIL_REQUIRED: 422,
  RFQ_CODE_ALREADY_EXISTS: 409, RFQ_CANCELLED: 409, QUOTE_SUPERSEDED: 409, QUOTE_NOT_VALIDATED: 409, RFQ_DISPATCH_NOT_SENDING: 409,
  RFQ_LINK_INVALID: 404, RFQ_LINK_REVOKED: 410, RFQ_LINK_EXPIRED: 410, RFQ_CLOSED: 410, RFQ_DEADLINE_PASSED: 410, RFQ_LINK_SUBMISSION_LIMIT: 429,
  RFQ_HISTORY_IS_APPEND_ONLY: 409,
};

function db() {
  // Supabase es la única fuente de verdad: sin respaldo en memoria.
  if (!isSupabaseAdminConfigured || !supabaseAdmin) throw new Error('SUPABASE_PERSISTENCE_UNAVAILABLE');
  return supabaseAdmin;
}

function rethrow(error: { message?: string; code?: string }, relation: string): never {
  const message = error.message ?? 'PERSISTENCE_ERROR';
  const known = Object.keys(RPC_STATUS).find((code) => message.includes(code));
  if (known) throw new RfqError(known, RPC_STATUS[known]);
  if (error.code === '23505') throw new RfqError('DUPLICATE_VALUE', 409);
  if (error.code === '42P01' || /does not exist|schema cache/i.test(message)) throw new Error(`SUPABASE_SCHEMA_NOT_READY:${relation}`);
  throw new Error(`${relation}: ${message}`);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) rethrow(error, fn);
  return data as T;
}

const uuid = z.string().uuid();
const positiveInt = z.number().int().positive().max(2_000_000_000);

export const rfqInputSchema = z.object({
  code: z.string().trim().min(3).max(40).optional(),
  title: z.string().trim().min(3).max(200),
  delivery_destination: z.string().trim().min(2).max(200),
  incoterm: z.enum(['EXW', 'FOB', 'CIF', 'CIP', 'DDP']),
  target_lead_time_days: z.number().int().positive().max(720).optional(),
  payment_terms: z.string().trim().max(200).optional(),
  validity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deadline_at: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(2000).optional(),
  technical_conditions: z.string().trim().max(4000).optional(),
  items: z.array(z.object({
    sku: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300).optional(),
    quantity: positiveInt,
    unit: z.string().trim().min(1).max(20).default('UN'),
    alternative_quantities: z.array(positiveInt).max(10).default([]),
    material: z.string().trim().max(200).optional(),
    printing_spec: z.string().trim().max(300).optional(),
    packaging_spec: z.string().trim().max(300).optional(),
    tooling_requirements: z.string().trim().max(300).optional(),
    technical_conditions: z.string().trim().max(2000).optional(),
    specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    notes: z.string().trim().max(1000).optional(),
  })).min(1).max(50),
});
export type RfqInput = z.infer<typeof rfqInputSchema>;

export async function createRfq(organizationId: string, actorProfileId: string, input: RfqInput) {
  return rpc<{ rfq_id: string; code: string; items: number }>('create_rfq_atomic', { p_org: organizationId, p_actor: actorProfileId, p_payload: input });
}

export async function listRfqs(organizationId: string) {
  const client = db();
  const { data: rfqs, error } = await client.from('rfqs').select('id, code, title, status, incoterm, delivery_destination, deadline_at, created_at, updated_at')
    .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(200);
  if (error) rethrow(error, 'rfqs');
  const ids = (rfqs ?? []).map((r) => r.id);
  if (!ids.length) return [];
  const [items, dispatches, quotes] = await Promise.all([
    client.from('rfq_items').select('rfq_id').eq('organization_id', organizationId).in('rfq_id', ids),
    client.from('rfq_supplier_dispatches').select('rfq_id, status').eq('organization_id', organizationId).in('rfq_id', ids),
    client.from('supplier_quotes').select('rfq_id, status').eq('organization_id', organizationId).in('rfq_id', ids).neq('status', 'SUPERSEDED'),
  ]);
  for (const result of [items, dispatches, quotes]) if (result.error) rethrow(result.error, 'rfq_summary');
  const count = <T extends { rfq_id: string | null }>(rows: T[] | null, id: string, predicate: (row: T) => boolean = () => true) => (rows ?? []).filter((r) => r.rfq_id === id && predicate(r)).length;
  return (rfqs ?? []).map((r) => ({
    ...r,
    items_count: count(items.data, r.id),
    invitations: count(dispatches.data, r.id),
    invitations_sent: count(dispatches.data, r.id, (d: any) => d.status === 'SENT' || d.status === 'REPLIED'),
    invitations_replied: count(dispatches.data, r.id, (d: any) => d.status === 'REPLIED'),
    quotes_count: count(quotes.data, r.id),
  }));
}

export async function getRfqDetail(organizationId: string, rfqId: string) {
  const client = db();
  const { data: rfq, error } = await client.from('rfqs').select('*').eq('organization_id', organizationId).eq('id', rfqId).maybeSingle();
  if (error) rethrow(error, 'rfqs');
  if (!rfq) throw new RfqError('RFQ_NOT_FOUND', 404);
  const [items, dispatches, quotes, documents, decisions, events, suppliers] = await Promise.all([
    client.from('rfq_items').select('*').eq('organization_id', organizationId).eq('rfq_id', rfqId).order('line_no'),
    client.from('rfq_supplier_dispatches').select('id, rfq_id, supplier_id, status, recipient_email, recipient_name, subject, body_text, message_id, sent_at, prepared_at, submitted_at, send_attempts, last_error, token_expires_at, token_revoked_at, access_count, last_access_at, max_submissions')
      .eq('organization_id', organizationId).eq('rfq_id', rfqId),
    client.from('supplier_quotes').select('*, quote_items(*)').eq('organization_id', organizationId).eq('rfq_id', rfqId).order('version', { ascending: false }),
    client.from('rfq_documents').select('id, supplier_id, quote_id, file_name, content_type, size_bytes, sha256, source_channel, extraction_status, extraction_error, extraction, created_at')
      .eq('organization_id', organizationId).eq('rfq_id', rfqId).order('created_at', { ascending: false }),
    client.from('rfq_decisions').select('*').eq('organization_id', organizationId).eq('rfq_id', rfqId).order('decided_at', { ascending: false }),
    client.from('rfq_events').select('id, event_type, supplier_id, dispatch_id, actor_profile_id, actor_label, payload, created_at').eq('organization_id', organizationId).eq('rfq_id', rfqId).order('created_at', { ascending: false }).limit(200),
    client.from('suppliers').select('id, name, country_code, email, contact_name, status').eq('organization_id', organizationId),
  ]);
  for (const result of [items, dispatches, quotes, documents, decisions, events, suppliers]) if (result.error) rethrow(result.error, 'rfq_detail');
  // El historial de eventos nunca expone el estado previo completo de una validación al navegador del proveedor ni a listados.
  const safeEvents = (events.data ?? []).map((e: any) => (e.event_type === 'QUOTE_VALIDATED' ? { ...e, payload: { quote_id: e.payload?.quote_id, changed: true } } : e));
  return { rfq, items: items.data ?? [], dispatches: dispatches.data ?? [], quotes: quotes.data ?? [], documents: documents.data ?? [], decisions: decisions.data ?? [], events: safeEvents, suppliers: suppliers.data ?? [] };
}

export async function listSuppliers(organizationId: string) {
  const { data, error } = await db().from('suppliers').select('id, name, country_code, city, website, email, contact_name, status')
    .eq('organization_id', organizationId).order('name');
  if (error) rethrow(error, 'suppliers');
  return data ?? [];
}

// ------------------------------------------------------------------------------------------------
// Invitaciones: preparar → confirmar → enviar. Nada se marca enviado sin envío real.
// ------------------------------------------------------------------------------------------------
export interface Mailer {
  isConfigured(): Promise<boolean>;
  send(message: { to: string; subject: string; text: string }): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export const prepareInvitationsSchema = z.object({
  invitations: z.array(z.object({ supplier_id: uuid, recipient_email: z.string().trim().email().optional() })).min(1).max(30),
  ttl_days: z.number().int().min(1).max(60).default(14),
});

export async function prepareInvitations(organizationId: string, actorProfileId: string, rfqId: string, input: z.infer<typeof prepareInvitationsSchema>, baseUrl: string) {
  const detail = await getRfqDetail(organizationId, rfqId);
  const supplierById = new Map(detail.suppliers.map((s: any) => [s.id, s]));
  const expires = new Date(Date.now() + input.ttl_days * 86_400_000).toISOString();
  const tokens = new Map<string, string>();
  const invitations = input.invitations.map((inv) => {
    const supplier: any = supplierById.get(inv.supplier_id);
    if (!supplier) throw new RfqError('SUPPLIER_NOT_FOUND', 404);
    const token = generateLinkToken();
    tokens.set(inv.supplier_id, token);
    const link = buildSupplierLink(baseUrl, token);
    const lines = detail.items.map((i: any) => `- Ítem ${i.line_no}: ${i.sku}${i.description ? ` (${i.description})` : ''} · ${Number(i.quantity).toLocaleString('es-PY')} ${i.unit}`);
    const body = [
      `Estimado equipo de ${supplier.name},`, '',
      `Solicitamos su cotización ${detail.rfq.code} — ${detail.rfq.title}:`, ...lines, '',
      `Destino: ${detail.rfq.delivery_destination} · Incoterm solicitado: ${detail.rfq.incoterm}`,
      detail.rfq.deadline_at ? `Fecha límite de respuesta: ${new Date(detail.rfq.deadline_at).toLocaleDateString('es-PY')}` : '',
      '', 'Puede responder con precios, MOQ, plazo y condiciones en este enlace personal (no requiere cuenta):', link, '',
      `El enlace vence el ${new Date(expires).toLocaleDateString('es-PY')}. También puede responder adjuntando su cotización en PDF a este correo.`, '', 'Saludos cordiales.',
    ].filter((l, idx, arr) => !(l === '' && arr[idx - 1] === '')).join('\n');
    return {
      supplier_id: inv.supplier_id, recipient_email: inv.recipient_email ?? supplier.email ?? '', recipient_name: supplier.contact_name ?? supplier.name,
      subject: `Solicitud de cotización ${detail.rfq.code} — ${detail.rfq.title}`, body_text: body, token_hash: hashLinkToken(token), token_expires_at: expires,
    };
  });
  const results = await rpc<Array<{ supplier_id: string; dispatch_id: string; status: string; skipped: boolean }>>('prepare_rfq_invitations_atomic', {
    p_org: organizationId, p_rfq: rfqId, p_actor: actorProfileId, p_invitations: invitations,
  });
  return results;
}

export interface SendOutcome { dispatch_id: string; supplier_id?: string; status: 'SENT' | 'FAILED' | 'SKIPPED'; error?: string }

/**
 * Envía las invitaciones PREPARED/FAILED seleccionadas. Requiere confirmación humana explícita.
 * Si el correo no está configurado no se intenta ni se marca nada como enviado: las invitaciones siguen preparadas.
 */
export async function sendInvitations(organizationId: string, actorProfileId: string, rfqId: string, dispatchIds: string[], confirm: boolean, mailer: Mailer): Promise<SendOutcome[]> {
  if (confirm !== true) throw new RfqError('CONFIRMATION_REQUIRED', 400, 'El envío requiere confirmación humana explícita.');
  if (!(await mailer.isConfigured())) {
    const client = db();
    await client.from('rfq_supplier_dispatches').update({ last_error: 'SMTP_NOT_CONFIGURED', updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId).eq('rfq_id', rfqId).in('id', dispatchIds).in('status', ['PREPARED', 'FAILED']);
    throw new RfqError('SMTP_NOT_CONFIGURED', 503, 'El correo saliente (SMTP) no está configurado. Las invitaciones siguen preparadas y no se enviaron.');
  }
  const outcomes: SendOutcome[] = [];
  for (const id of dispatchIds) {
    const claimed = await rpc<{ id: string; supplier_id: string; recipient_email: string; subject: string; body_text: string } | null>('claim_rfq_dispatch', { p_org: organizationId, p_dispatch: id, p_actor: actorProfileId });
    if (!claimed) { outcomes.push({ dispatch_id: id, status: 'SKIPPED', error: 'Ya enviada, en envío o no preparada' }); continue; }
    let result: { success: boolean; messageId?: string; error?: string };
    try {
      result = await mailer.send({ to: claimed.recipient_email, subject: claimed.subject, text: claimed.body_text });
    } catch (error) {
      result = { success: false, error: error instanceof Error ? error.message : 'SEND_FAILED' };
    }
    await rpc('finish_rfq_dispatch', { p_org: organizationId, p_dispatch: id, p_ok: result.success, p_message_id: result.messageId ?? null, p_error: result.error ?? null, p_actor: actorProfileId });
    outcomes.push({ dispatch_id: id, supplier_id: claimed.supplier_id, status: result.success ? 'SENT' : 'FAILED', error: result.success ? undefined : result.error });
  }
  return outcomes;
}

export async function revokeInvitationLink(organizationId: string, actorProfileId: string, dispatchId: string) {
  await rpc('revoke_rfq_dispatch', { p_org: organizationId, p_dispatch: dispatchId, p_actor: actorProfileId });
}

// ------------------------------------------------------------------------------------------------
// Cotizaciones: carga manual, PDF, validación humana y enlace externo.
// ------------------------------------------------------------------------------------------------
const quoteItemSchema = z.object({
  rfq_item_id: uuid,
  unit_price: z.number().positive().max(1e9),
  moq: z.number().int().positive().optional(),
  lead_time_days: z.number().int().positive().max(720).optional(),
  offered_quantity: z.number().int().positive().optional(),
  unit: z.string().trim().max(20).optional(),
  price_scales: z.array(z.object({ min_qty: z.number().int().positive(), unit_price: z.number().positive() })).max(10).default([]),
  specs_offered: z.string().trim().max(1000).optional(),
  technical_compliance: z.enum(['COMPLIES', 'PARTIAL', 'NOT_COMPLIES', 'UNKNOWN']).default('UNKNOWN'),
  notes: z.string().trim().max(1000).optional(),
});

export const quoteInputSchema = z.object({
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  incoterm: z.enum(['EXW', 'FOB', 'CIF', 'CIP', 'DDP']),
  payment_terms: z.string().trim().max(200).optional(),
  lead_time_days: z.number().int().positive().max(720).optional(),
  validity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  origin_country: z.string().trim().max(60).optional(),
  manufacturer: z.string().trim().max(200).optional(),
  tooling_cost: z.number().min(0).optional(),
  freight_included: z.boolean().optional(),
  quote_reference: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
  fx_rate_to_usd: z.number().positive().optional(),
  fx_rate_source: z.string().trim().max(200).optional(),
  fx_rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  logistics_cost_per_unit_usd: z.number().min(0).optional(),
  logistics_cost_source: z.string().trim().max(200).optional(),
  items: z.array(quoteItemSchema).min(1).max(50),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

/** Lo que el proveedor puede enviar por el enlace: sin tipo de cambio ni costos logísticos propios de NIUPACK. */
export const publicQuoteSchema = quoteInputSchema.omit({ fx_rate_to_usd: true, fx_rate_source: true, fx_rate_date: true, logistics_cost_per_unit_usd: true, logistics_cost_source: true })
  .extend({ submitted_by_label: z.string().trim().min(2).max(120) });

export async function registerManualQuote(organizationId: string, actorProfileId: string, rfqId: string, supplierId: string, input: QuoteInput, channel: 'MANUAL' | 'GMAIL' = 'MANUAL') {
  return rpc<{ quote_id: string; version: number; items: number }>('register_quote_atomic', {
    p_org: organizationId, p_actor: actorProfileId, p_rfq: rfqId, p_supplier: supplierId, p_channel: channel, p_status: 'SUBMITTED', p_document: null, p_payload: input,
  });
}

export async function validateQuote(organizationId: string, actorProfileId: string, quoteId: string, changes: Partial<QuoteInput>) {
  return rpc<{ quote_id: string; status: string }>('validate_quote_atomic', { p_org: organizationId, p_actor: actorProfileId, p_quote: quoteId, p_payload: changes });
}

export const decisionSchema = z.object({
  quote_id: uuid,
  rfq_item_id: uuid.optional(),
  decision: z.enum(['SELECTED', 'SHORTLISTED', 'REJECTED', 'DEFERRED']),
  rationale: z.string().trim().min(3).max(2000),
});

export async function recordDecision(organizationId: string, actorProfileId: string, rfqId: string, input: z.infer<typeof decisionSchema>, fx: FxResolver = defaultFxResolver) {
  // El motor propone; la persona decide. Se guarda la foto exacta de lo que vio al decidir.
  const comparison = await getComparison(organizationId, rfqId, fx);
  return rpc<{ decision_id: string }>('record_rfq_decision_atomic', { p_org: organizationId, p_actor: actorProfileId, p_rfq: rfqId, p_payload: { ...input, snapshot: comparison } });
}

export async function uploadQuoteDocument(organizationId: string, actorProfileId: string, rfqId: string, supplierId: string, file: { name: string; type: string; bytes: Uint8Array }) {
  if (file.bytes.length === 0 || file.bytes.length > MAX_DOCUMENT_BYTES) throw new RfqError('INVALID_DOCUMENT_SIZE', 400, 'El archivo debe pesar entre 1 byte y 5 MB.');
  if (!looksLikePdf(file.bytes)) throw new RfqError('DOCUMENT_NOT_PDF', 400, 'Solo se aceptan archivos PDF.');
  const detail = await getRfqDetail(organizationId, rfqId);
  if (!detail.suppliers.some((s: any) => s.id === supplierId)) throw new RfqError('SUPPLIER_NOT_FOUND', 404);
  const text = await extractPdfText(file.bytes);
  const extraction = text.status === 'EXTRACTED'
    ? extractQuoteFromText(text.text!, detail.items.map((i: any) => ({ id: i.id, sku: i.sku })))
    : null;
  const stored = await rpc<{ document_id: string; duplicate: boolean }>('store_rfq_document_atomic', {
    p_org: organizationId, p_actor: actorProfileId, p_rfq: rfqId,
    p_meta: {
      supplier_id: supplierId, file_name: file.name.slice(0, 200), content_type: 'application/pdf', sha256: sha256Hex(file.bytes), source_channel: 'PDF',
      extraction_status: text.status, extracted_text: text.text?.slice(0, 200_000) ?? null, extraction, extraction_error: text.error ?? null,
    },
    p_content_hex: Buffer.from(file.bytes).toString('hex'),
  });
  return { ...stored, extraction_status: text.status, extraction_error: text.error, extraction };
}

/** Registra la cotización extraída de un PDF como NO validada: no entra al comparador hasta que una persona la confirme. */
export async function registerExtractedQuote(organizationId: string, actorProfileId: string, rfqId: string, supplierId: string, documentId: string, input: QuoteInput) {
  return rpc<{ quote_id: string; version: number; items: number }>('register_quote_atomic', {
    p_org: organizationId, p_actor: actorProfileId, p_rfq: rfqId, p_supplier: supplierId, p_channel: 'PDF', p_status: 'EXTRACTED', p_document: documentId, p_payload: input,
  });
}

export async function getDocumentContent(organizationId: string, documentId: string) {
  const client = db();
  const { data: doc, error } = await client.from('rfq_documents').select('id, file_name, content_type').eq('organization_id', organizationId).eq('id', documentId).maybeSingle();
  if (error) rethrow(error, 'rfq_documents');
  if (!doc) throw new RfqError('DOCUMENT_NOT_FOUND', 404);
  const { data: blob, error: blobError } = await client.from('rfq_document_blobs').select('content').eq('document_id', documentId).maybeSingle();
  if (blobError) rethrow(blobError, 'rfq_document_blobs');
  if (!blob) throw new RfqError('DOCUMENT_NOT_FOUND', 404);
  const hex = String(blob.content).startsWith('\\x') ? String(blob.content).slice(2) : String(blob.content);
  return { ...doc, bytes: Buffer.from(hex, 'hex') };
}

export async function getPublicView(token: string) {
  if (!isPlausibleToken(token)) throw new RfqError('RFQ_LINK_INVALID', 404);
  return rpc<Record<string, unknown>>('get_rfq_public_view', { p_token_hash: hashLinkToken(token) });
}

export async function submitPublicQuote(token: string, input: z.infer<typeof publicQuoteSchema>) {
  if (!isPlausibleToken(token)) throw new RfqError('RFQ_LINK_INVALID', 404);
  return rpc<{ quote_id: string; version: number; items: number }>('submit_supplier_quote_atomic', { p_token_hash: hashLinkToken(token), p_payload: input });
}

// ------------------------------------------------------------------------------------------------
// Comparador conectado al FX real de NIUPACK y a las hojas de costo vigentes.
// ------------------------------------------------------------------------------------------------
/** USD es identidad, PYG usa el FxEngine de NIUPACK; cualquier otra moneda solo con el tipo de cambio validado de la cotización. */
export const defaultFxResolver: FxResolver = (currency, quote) => {
  if (quote.fx_rate_to_usd) {
    return { rate_to_usd: Number(quote.fx_rate_to_usd), source: quote.fx_rate_source ?? 'Tipo de cambio ingresado y validado por el usuario', as_of: quote.fx_rate_date };
  }
  return null;
};

async function buildFxResolver(quotes: ComparatorQuote[]): Promise<FxResolver> {
  if (!quotes.some((q) => q.currency.toUpperCase() === 'PYG' && !q.fx_rate_to_usd)) return defaultFxResolver;
  try {
    const { quote, status, costingRate } = await FxEngine.getEffectiveQuote();
    if (!costingRate || costingRate <= 0) return defaultFxResolver;
    return (currency, q) => {
      if (currency === 'PYG' && !q.fx_rate_to_usd) {
        return {
          rate_to_usd: 1 / costingRate, source: `FxEngine NIUPACK (${quote.source}, ${status})`, as_of: quote.effectiveAt,
          warning: status === 'UNAVAILABLE_SOURCE_USING_LAST_VALID' ? 'La fuente de tipo de cambio no respondió: se usa la última cotización válida' : undefined,
        };
      }
      return defaultFxResolver(currency, q);
    };
  } catch {
    return defaultFxResolver;
  }
}

export async function getComparison(organizationId: string, rfqId: string, fx?: FxResolver): Promise<Comparison> {
  const detail = await getRfqDetail(organizationId, rfqId);
  const supplierName = new Map(detail.suppliers.map((s: any) => [s.id, s.name as string]));
  const quotes: ComparatorQuote[] = detail.quotes.map((q: any) => ({
    id: q.id, supplier_id: q.supplier_id, supplier_name: supplierName.get(q.supplier_id) ?? 'Proveedor', version: q.version, status: q.status, source_channel: q.source_channel,
    currency: q.currency, incoterm: q.incoterm, lead_time_days: q.lead_time_days, validity_date: q.validity_date, tooling_cost: Number(q.tooling_cost ?? 0), freight_included: q.freight_included,
    fx_rate_to_usd: q.fx_rate_to_usd === null ? null : Number(q.fx_rate_to_usd), fx_rate_source: q.fx_rate_source, fx_rate_date: q.fx_rate_date,
    logistics_cost_per_unit_usd: q.logistics_cost_per_unit_usd === null ? null : Number(q.logistics_cost_per_unit_usd), logistics_cost_source: q.logistics_cost_source,
    origin_country: q.origin_country, manufacturer: q.manufacturer, payment_terms: q.payment_terms,
    items: (q.quote_items ?? []).map((i: any) => ({
      rfq_item_id: i.rfq_item_id, unit_price: Number(i.unit_price), moq: i.moq, lead_time_days: i.lead_time_days,
      price_scales: Array.isArray(i.price_scales) ? i.price_scales : [], technical_compliance: i.technical_compliance, field_states: i.field_states,
    })),
  }));
  const costs = new Map<string, CostSheetRef | null>();
  for (const sku of new Set(detail.items.map((i: any) => i.sku as string))) {
    const sheet = await repository.getActiveCostSheetForSKU(sku, organizationId);
    costs.set(sku, sheet && Number(sheet.true_unit_cost_usd) > 0 ? { sku, sheet_id: sheet.id, version: sheet.version, true_unit_cost_usd: Number(sheet.true_unit_cost_usd) } : null);
  }
  const invited = detail.dispatches.map((d: any) => ({ id: d.supplier_id as string, name: supplierName.get(d.supplier_id) ?? 'Proveedor' }));
  return compareQuotes({
    rfq: { incoterm: detail.rfq.incoterm, items: detail.items.map((i: any) => ({ id: i.id, line_no: i.line_no, sku: i.sku, description: i.description, quantity: i.quantity, unit: i.unit })) },
    quotes, suppliers: invited, fx: fx ?? await buildFxResolver(quotes), costs,
  });
}
