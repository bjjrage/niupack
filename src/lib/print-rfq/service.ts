import { createHash } from 'node:crypto';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/db/supabase';
import {
  allocationSchema, createRfqSchema, documentFactsSchema, offerLineSchema, offerSchema, providerSchema, reconcileOffer, magicLinkOpen,
  type ArtFile, type ComparativeLine, type DocumentFact, type OrderPreview, type RfqAllocation, type RfqItem,
} from './domain';
import { z } from 'zod';

/** Errores de dominio con código estable, estado HTTP y texto para la persona. */
const ERRORS: Record<string, [number, string]> = {
  PRINT_ACTOR_NOT_ALLOWED: [403, 'No tenés permiso para esta acción'],
  PRINT_PURPOSE_REQUIRED: [400, 'Elegí el propósito de la solicitud'],
  PRINT_TITLE_REQUIRED: [400, 'La solicitud necesita un título'],
  PRINT_ITEMS_INVALID: [400, 'Cargá entre 1 y 200 ítems'],
  PRINT_ITEM_INVALID: [400, 'Cada ítem necesita SKU, descripción, cantidad y unidad válidos'],
  PRINT_ITEM_NOT_FOUND: [404, 'El ítem no pertenece a esta solicitud'],
  PRINT_SKU_NOT_FOUND: [404, 'El SKU elegido no existe en el catálogo'],
  PRINT_EXPIRY_INVALID: [400, 'La fecha de vencimiento no es válida'],
  PRINT_RFQ_NOT_FOUND: [404, 'Solicitud no encontrada'],
  PRINT_RFQ_NOT_OPEN: [409, 'La solicitud no está abierta'],
  PRINT_RFQ_FINAL: [409, 'La solicitud ya terminó y no se puede reabrir'],
  PRINT_RFQ_NOT_PURCHASABLE: [409, 'La solicitud no admite compra (propósito o estado)'],
  PRINT_ART_REQUIRED: [409, 'Cada ítem necesita su arte registrado antes de invitar imprentas'],
  PRINT_PROVIDERS_REQUIRED: [400, 'Elegí al menos una imprenta'],
  PRINT_PROVIDER_INVALID: [404, 'La imprenta no existe o está inactiva'],
  PRINT_INVITATION_NOT_FOUND: [404, 'Invitación no encontrada'],
  PRINT_ACTION_INVALID: [400, 'Acción inválida'],
  PRINT_FILE_KIND_INVALID: [400, 'Tipo de archivo inválido'],
  PRINT_FILE_SIZE_MISMATCH: [400, 'El archivo llegó incompleto'],
  PRINT_FILE_HASH_MISMATCH: [400, 'El archivo llegó dañado'],
  PRINT_LINK_INVALID: [404, 'El enlace no es válido'],
  PRINT_LINK_CLOSED: [410, 'El enlace venció, fue revocado o la solicitud se cerró'],
  PRINT_BUDGET_REQUIRED: [400, 'Adjuntá el presupuesto original de la imprenta'],
  PRINT_OFFER_INVALID: [400, 'La oferta tiene datos inválidos'],
  PRINT_OFFER_INCOMPLETE: [400, 'La oferta debe incluir todos los ítems de la solicitud'],
  PRINT_OFFER_ZERO: [400, 'La oferta no tiene un importe positivo'],
  PRINT_VERSION_NOT_FOUND: [404, 'Versión de presupuesto no encontrada'],
  PRINT_RESOLUTION_REQUIRED: [400, 'La resolución necesita al menos 10 caracteres'],
  PRINT_JUSTIFICATION_REQUIRED: [400, 'La justificación necesita al menos 10 caracteres'],
  PRINT_ALLOCATION_CHANGED: [409, 'La asignación cambió: recargá y guardá una revisión nueva'],
  PRINT_ALLOCATION_CONFIRMED: [409, 'La asignación ya fue confirmada'],
  PRINT_ALLOCATION_INVALID: [400, 'La asignación está vacía o es inválida'],
  PRINT_ALLOCATION_DUPLICATE: [400, 'Hay una línea repetida en la asignación'],
  PRINT_ALLOCATION_OVER: [409, 'Se asignó más cantidad que la solicitada'],
  PRINT_ALLOCATION_NOT_FOUND: [404, 'Asignación no encontrada'],
  PRINT_ALLOCATION_OBSOLETE: [409, 'Hay una revisión más nueva de la asignación'],
  PRINT_ALLOCATION_NOT_AUTHORIZED: [409, 'La asignación no está autorizada o ya no está vigente'],
  PRINT_QUOTE_NOT_FOUND: [404, 'La línea de presupuesto no existe o fue reemplazada por una versión nueva'],
  PRINT_QUOTE_NOT_ELIGIBLE: [409, 'El presupuesto está incompleto, vencido, sin revisión humana o sin disponibilidad suficiente'],
  PRINT_QUOTE_ART_STALE: [409, 'La imprenta cotizó un arte que ya no es el vigente: pedí una cotización nueva'],
  PRINT_CONFIRMATION_REQUIRED: [400, 'Falta la confirmación humana explícita'],
  PRINT_PREVIEW_INVALID: [409, 'El preview no es válido'],
  PRINT_PREVIEW_CHANGED: [409, 'El preview cambió: generá uno nuevo'],
  PRINT_IMMUTABLE_RECORD: [409, 'El registro es inmutable'],
};

export class PrintRfqError extends Error {
  constructor(public code: string, public status: number, message?: string) {
    super(message ?? code);
    this.name = 'PrintRfqError';
  }
}

function db() {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) throw new Error('SUPABASE_PERSISTENCE_UNAVAILABLE');
  return supabaseAdmin;
}

export function printRethrow(error: { message?: string; code?: string }, relation: string): never {
  const message = error.message ?? 'PERSISTENCE_ERROR';
  const known = Object.keys(ERRORS).find((code) => message.includes(code));
  if (known) throw new PrintRfqError(known, ERRORS[known][0], ERRORS[known][1]);
  if (error.code === '23505') throw new PrintRfqError('PRINT_DUPLICATE', 409, 'Ya existe un registro igual');
  if (error.code === '42P01' || /does not exist|schema cache/i.test(message)) throw new Error(`SUPABASE_SCHEMA_NOT_READY:${relation}`);
  throw new Error(`${relation}: ${message}`);
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) printRethrow(error, name);
  return data as T;
}

const assertOk = (result: { error: { message?: string; code?: string } | null }, relation: string) => { if (result.error) printRethrow(result.error, relation); };

// ---------------------------------------------------------------------------------------------------------------------
// Imprentas
// ---------------------------------------------------------------------------------------------------------------------
export async function listProviders(org: string, includeInactive = false) {
  let query = db().from('print_providers').select('*').eq('organization_id', org).order('name');
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) printRethrow(error, 'print_providers');
  return data ?? [];
}

const clean = (value: string | undefined) => (value && value.trim() ? value.trim() : null);

export async function saveProvider(org: string, input: unknown, id?: string) {
  const parsed = providerSchema.parse(input);
  const row = {
    name: parsed.name, ruc: clean(parsed.ruc), contact_name: clean(parsed.contact_name), email: clean(parsed.email), phone: clean(parsed.phone),
    city: clean(parsed.city), processes: parsed.processes, notes: clean(parsed.notes), active: parsed.active, updated_at: new Date().toISOString(),
  };
  if (id) {
    const { data, error } = await db().from('print_providers').update(row).eq('id', id).eq('organization_id', org).select('*').maybeSingle();
    if (error) printRethrow(error, 'print_providers');
    if (!data) throw new PrintRfqError('PRINT_PROVIDER_INVALID', 404, ERRORS.PRINT_PROVIDER_INVALID[1]);
    return data;
  }
  const { data, error } = await db().from('print_providers').insert({ ...row, organization_id: org }).select('*').single();
  if (error) printRethrow(error, 'print_providers');
  return data;
}

// ---------------------------------------------------------------------------------------------------------------------
// Catálogo de SKU
// ---------------------------------------------------------------------------------------------------------------------
export async function searchSkus(org: string, q: string) {
  const term = q.trim().replace(/[%,()]/g, '').slice(0, 60);
  let query = db().from('product_attributes').select('id, sku, size_oz, material, products!inner(name, code, organization_id, is_active)')
    .eq('products.organization_id', org).eq('products.is_active', true).order('sku').limit(30);
  if (term) query = query.ilike('sku', `%${term}%`);
  const { data, error } = await query;
  if (error) printRethrow(error, 'product_attributes');
  return (data ?? []).map((r: any) => ({ id: r.id, sku: r.sku, name: r.products.name, code: r.products.code, size_oz: r.size_oz, material: r.material }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Solicitudes
// ---------------------------------------------------------------------------------------------------------------------
export async function listRfqs(org: string, filter: { q?: string; status?: string } = {}) {
  let query = db().from('print_rfqs').select('id, code, purpose, title, status, expires_at, created_at, required_date').eq('organization_id', org).order('created_at', { ascending: false }).limit(200);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.q?.trim()) {
    const term = filter.q.trim().replace(/[%,()]/g, '');
    query = query.or(`code.ilike.%${term}%,title.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) printRethrow(error, 'print_rfqs');
  const rfqs = data ?? [];
  if (!rfqs.length) return [];
  const ids = rfqs.map((r: any) => r.id);
  const [items, invitations] = await Promise.all([
    db().from('print_rfq_items').select('rfq_id').eq('organization_id', org).in('rfq_id', ids),
    db().from('print_rfq_invitations').select('rfq_id, status').eq('organization_id', org).in('rfq_id', ids),
  ]);
  assertOk(items, 'print_rfq_items'); assertOk(invitations, 'print_rfq_invitations');
  return rfqs.map((r: any) => ({
    ...r,
    items: (items.data ?? []).filter((i: any) => i.rfq_id === r.id).length,
    invited: (invitations.data ?? []).filter((i: any) => i.rfq_id === r.id).length,
    responded: (invitations.data ?? []).filter((i: any) => i.rfq_id === r.id && i.status === 'RESPONDIDO').length,
  }));
}

export async function createRfq(org: string, actor: string, input: unknown) {
  const { header, items } = createRfqSchema.parse(input);
  return rpc<{ id: string; code: string }>('print_rfq_create', { p_org: org, p_actor: actor, p_header: header, p_items: items });
}

// Filas de PostgREST sin esquema generado: se tratan como dinámicas y se validan en cada uso.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Todo lo que necesita la pantalla de una solicitud, con cada consulta acotada a la organización. */
export async function loadRfqWorkspace(org: string, rfqId: string, now = Date.now()) {
  const client = db();
  const header = await client.from('print_rfqs').select('*').eq('id', rfqId).eq('organization_id', org).maybeSingle();
  assertOk(header, 'print_rfqs');
  if (!header.data) throw new PrintRfqError('PRINT_RFQ_NOT_FOUND', 404, ERRORS.PRINT_RFQ_NOT_FOUND[1]);
  const [itemsR, invitationsR, filesR, allocationsR, eventsR, ordersR] = await Promise.all([
    client.from('print_rfq_items').select('*').eq('rfq_id', rfqId).eq('organization_id', org).order('sort_order'),
    client.from('print_rfq_invitations').select('*, print_providers(name, phone, email, active)').eq('rfq_id', rfqId).eq('organization_id', org).order('invited_at'),
    client.from('print_files').select('id, kind, rfq_item_id, invitation_id, file_name, content_type, size_bytes, sha256, uploaded_by_provider, created_at').eq('rfq_id', rfqId).eq('organization_id', org).order('created_at'),
    client.from('print_allocations').select('*').eq('rfq_id', rfqId).eq('organization_id', org).order('revision', { ascending: false }),
    client.from('print_rfq_events').select('id, event, actor_type, detail, created_at').eq('rfq_id', rfqId).eq('organization_id', org).order('created_at', { ascending: false }).limit(100),
    client.from('print_purchase_orders').select('id, code, provider_name, currency, total, status, created_at').eq('rfq_id', rfqId).eq('organization_id', org).order('code'),
  ]);
  for (const r of [itemsR, invitationsR, filesR, allocationsR, eventsR, ordersR]) assertOk(r, 'print_rfq_workspace');

  const files = (filesR.data ?? []) as Row[];
  const latestArt = new Map<string, string>();
  const items: RfqItem[] = ((itemsR.data ?? []) as Row[]).map((i) => {
    const art = files.filter((f) => f.kind === 'ART' && f.rfq_item_id === i.id).sort((a, b) => b.created_at.localeCompare(a.created_at)) as ArtFile[];
    if (art[0]) latestArt.set(i.id, art[0].id);
    return { id: i.id, sku: i.sku, description: i.description, quantity: Number(i.quantity), unit: i.unit, print_spec: i.print_spec ?? {}, art_files: art };
  });

  const invitations = (invitationsR.data ?? []) as Row[];
  const offers: ComparativeLine[] = [];
  const history: Row[] = [];
  let reviews: Row[] = [];
  if (invitations.length) {
    const quotes = await client.from('print_quotes').select('id, invitation_id').eq('organization_id', org).in('invitation_id', invitations.map((i) => i.id));
    assertOk(quotes, 'print_quotes');
    if (quotes.data?.length) {
      const versions = await client.from('print_quote_versions').select('*').eq('organization_id', org).in('quote_id', quotes.data.map((q: Row) => q.id)).order('version_number', { ascending: false });
      assertOk(versions, 'print_quote_versions');
      const current = new Map<string, Row>();
      for (const v of (versions.data ?? []) as Row[]) { history.push(v); if (!current.has(v.quote_id)) current.set(v.quote_id, v); }
      const ids = [...current.values()].map((v) => v.id);
      if (ids.length) {
        const [lines, reviewsR] = await Promise.all([
          client.from('print_quote_version_items').select('*').eq('organization_id', org).in('quote_version_id', ids),
          client.from('print_quote_reviews').select('*').eq('organization_id', org).in('quote_version_id', ids).order('reviewed_at', { ascending: false }),
        ]);
        assertOk(lines, 'print_quote_version_items'); assertOk(reviewsR, 'print_quote_reviews');
        reviews = (reviewsR.data ?? []) as Row[];
        for (const l of (lines.data ?? []) as Row[]) {
          const version = [...current.values()].find((v) => v.id === l.quote_version_id)!;
          const quote = quotes.data.find((q: Row) => q.id === version.quote_id)!;
          const invitation = invitations.find((i) => i.id === quote.invitation_id)!;
          const review = reviews.find((r) => r.quote_version_id === version.id);
          const snapshot = (Array.isArray(version.art_snapshot) ? version.art_snapshot : []).find((s: Row) => s.rfq_item_id === l.rfq_item_id);
          offers.push({
            id: l.id, rfq_item_id: l.rfq_item_id,
            unit_price: l.unit_price == null ? null : Number(l.unit_price), available_quantity: Number(l.available_quantity), tax_rate: Number(l.tax_rate),
            lead_time_days: l.lead_time_days, observations: l.observations,
            quote_version_id: version.id, provider_id: invitation.provider_id, provider_name: invitation.print_providers?.name ?? 'Imprenta',
            version_number: version.version_number, currency: version.currency, vat_included: version.vat_included,
            freight: version.freight == null ? null : Number(version.freight), payment_terms: version.payment_terms, delivery_time: version.delivery_time,
            valid_until: version.valid_until, budget_file_id: version.budget_file_id, review_id: review?.id ?? null, review_resolution: review?.resolution ?? null,
            review_discrepancies: [...(Array.isArray(review?.comparison?.human) ? review.comparison.human : [])].filter((d: Row) => d.itemId === l.rfq_item_id),
            revoked: Boolean(invitation.token_revoked_at) || invitation.print_providers?.active === false,
            art_stale: !snapshot || snapshot.file_id !== latestArt.get(l.rfq_item_id),
          });
        }
      }
    }
  }
  const rfq = header.data as Row;
  return {
    rfq, items, offers, history, reviews,
    invitations: invitations.map((i) => ({ ...i, link_open: magicLinkOpen(i, rfq, now), budgets: files.filter((f) => f.kind === 'BUDGET' && f.invitation_id === i.id) })),
    allocations: ((allocationsR.data ?? []) as Row[]) as unknown as RfqAllocation[],
    events: eventsR.data ?? [],
    orders: ordersR.data ?? [],
  };
}

export async function inviteProviders(org: string, actor: string, rfqId: string, providerIds: string[]) {
  const ids = z.array(z.string().uuid()).min(1).max(50).parse(providerIds);
  return rpc<{ invited: number }>('print_rfq_invite', { p_org: org, p_actor: actor, p_rfq: rfqId, p_provider_ids: [...new Set(ids)] });
}
export const setInvitationLink = async (org: string, actor: string, rfqId: string, invitationId: string, action: 'REVOKE' | 'RENEW') =>
  rpc<null>('print_rfq_link', { p_org: org, p_actor: actor, p_rfq: rfqId, p_invitation: invitationId, p_action: action });
export const transitionRfq = async (org: string, actor: string, rfqId: string, action: 'CANCEL' | 'REOPEN' | 'CLOSE_DISCOVERY', days = 14) =>
  rpc<null>('print_rfq_transition', { p_org: org, p_actor: actor, p_rfq: rfqId, p_action: action, p_days: days });

// ---------------------------------------------------------------------------------------------------------------------
// Archivos (arte y presupuestos)
// ---------------------------------------------------------------------------------------------------------------------
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ART_TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', ai: 'application/postscript', eps: 'application/postscript', tif: 'image/tiff', tiff: 'image/tiff', zip: 'application/zip' };
const BUDGET_TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', csv: 'text/csv' };

/** Valida nombre, extensión y tamaño. El tipo se decide por la extensión permitida, no por lo que declare el navegador. */
export function checkUpload(kind: 'ART' | 'BUDGET', fileName: string, size: number) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const type = (kind === 'ART' ? ART_TYPES : BUDGET_TYPES)[ext];
  if (!type) throw new PrintRfqError('PRINT_FILE_TYPE', 400, `Formato no permitido (.${ext || '?'}). Permitidos: ${Object.keys(kind === 'ART' ? ART_TYPES : BUDGET_TYPES).join(', ')}`);
  if (size <= 0) throw new PrintRfqError('PRINT_FILE_EMPTY', 400, 'El archivo está vacío');
  if (size > MAX_FILE_BYTES) throw new PrintRfqError('PRINT_FILE_TOO_LARGE', 413, 'El archivo supera los 4 MB');
  return { content_type: type, file_name: fileName.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) };
}

export async function storeFile(org: string, rfqId: string, input: { kind: 'ART' | 'BUDGET'; fileName: string; content: Buffer; rfqItemId?: string; invitationId?: string; actor?: string | null }) {
  const checked = checkUpload(input.kind, input.fileName, input.content.length);
  const sha256 = createHash('sha256').update(input.content).digest('hex');
  return rpc<{ file_id: string; duplicate: boolean }>('print_store_file', {
    p_org: org, p_rfq: rfqId, p_content_hex: input.content.toString('hex'),
    p_meta: { kind: input.kind, rfq_item_id: input.rfqItemId ?? null, invitation_id: input.invitationId ?? null, file_name: checked.file_name, content_type: checked.content_type, size_bytes: input.content.length, sha256, uploaded_by: input.actor ?? null },
  });
}

/** Devuelve el archivo solo si pertenece a la organización (o, para la imprenta, a su propia solicitud). */
export async function readFile(org: string, fileId: string, scope?: { rfqId: string; invitationId: string }) {
  const meta = await db().from('print_files').select('id, rfq_id, kind, invitation_id, file_name, content_type, size_bytes, sha256').eq('id', fileId).eq('organization_id', org).maybeSingle();
  assertOk(meta, 'print_files');
  if (!meta.data) return null;
  // La imprenta solo accede al arte de su solicitud y a sus propios presupuestos.
  if (scope && (meta.data.rfq_id !== scope.rfqId || (meta.data.kind === 'BUDGET' && meta.data.invitation_id !== scope.invitationId))) return null;
  const blob = await db().from('print_file_blobs').select('content').eq('file_id', fileId).maybeSingle();
  assertOk(blob, 'print_file_blobs');
  if (!blob.data) return null;
  const hex = String(blob.data.content).replace(/^\\x/, '');
  return { meta: meta.data as Row, content: Buffer.from(hex, 'hex') };
}

// ---------------------------------------------------------------------------------------------------------------------
// Portal de la imprenta (enlace con token)
// ---------------------------------------------------------------------------------------------------------------------
export async function resolveInvitation(token: string) {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new PrintRfqError('PRINT_LINK_INVALID', 404, ERRORS.PRINT_LINK_INVALID[1]);
  const { data, error } = await db().from('print_rfq_invitations').select('*, print_providers(name, active), print_rfqs(*)').eq('token', token).maybeSingle();
  if (error) printRethrow(error, 'print_rfq_invitations');
  const rfq = data?.print_rfqs as Row | undefined;
  if (!data || !rfq || !data.print_providers?.active || rfq.organization_id !== data.organization_id) throw new PrintRfqError('PRINT_LINK_INVALID', 404, ERRORS.PRINT_LINK_INVALID[1]);
  if (!magicLinkOpen(data, rfq)) throw new PrintRfqError('PRINT_LINK_CLOSED', 410, ERRORS.PRINT_LINK_CLOSED[1]);
  return data as Row;
}

/** Lo que ve la imprenta: ítems, ficha de impresión y arte. Nunca otras imprentas ni precios ajenos. */
export async function getPortalView(token: string) {
  const invitation = await resolveInvitation(token);
  const rfq = invitation.print_rfqs as Row;
  const [items, files] = await Promise.all([
    db().from('print_rfq_items').select('id, sku, description, quantity, unit, print_spec').eq('rfq_id', rfq.id).eq('organization_id', rfq.organization_id).order('sort_order'),
    db().from('print_files').select('id, rfq_item_id, file_name, size_bytes, created_at').eq('rfq_id', rfq.id).eq('organization_id', rfq.organization_id).eq('kind', 'ART').order('created_at', { ascending: false }),
  ]);
  assertOk(items, 'print_rfq_items'); assertOk(files, 'print_files');
  if (invitation.status === 'INVITADO') {
    await db().from('print_rfq_invitations').update({ status: 'ABIERTO', opened_at: new Date().toISOString() }).eq('id', invitation.id).eq('status', 'INVITADO');
  }
  return {
    invitation_id: invitation.id as string,
    rfq: { code: rfq.code, title: rfq.title, specifications: rfq.specifications, required_date: rfq.required_date, expires_at: rfq.expires_at },
    provider_name: invitation.print_providers.name as string,
    items: ((items.data ?? []) as Row[]).map((i) => ({
      id: i.id, sku: i.sku, description: i.description, quantity: Number(i.quantity), unit: i.unit, print_spec: i.print_spec ?? {},
      art: ((files.data ?? []) as Row[]).filter((f) => f.rfq_item_id === i.id).slice(0, 1).map((f) => ({ id: f.id, file_name: f.file_name, size_bytes: f.size_bytes })),
    })),
  };
}

export async function submitOffer(token: string, offer: unknown, lines: unknown, budgetFileId: string, actor: string | null = null) {
  const header = offerSchema.parse(offer);
  const items = offerLineSchema.array().min(1).max(200).parse(lines);
  if (Date.parse(header.valid_until) <= Date.now()) throw new PrintRfqError('PRINT_OFFER_INVALID', 400, 'La oferta ya está vencida');
  return rpc<{ version_id: string; version_number: number; total_price: number }>('print_rfq_submit_version', {
    p_token: token, p_offer: header, p_items: items, p_budget_file_id: budgetFileId, p_actor: actor,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Revisión, asignación, autorización, preview y órdenes
// ---------------------------------------------------------------------------------------------------------------------
export async function reviewQuote(org: string, actor: string, rfqId: string, versionId: string, facts: unknown, resolution: string) {
  const verified: DocumentFact[] = documentFactsSchema.parse(facts);
  const workspace = await loadRfqWorkspace(org, rfqId);
  const offers = workspace.offers.filter((o) => o.quote_version_id === versionId);
  if (!offers.length) throw new PrintRfqError('PRINT_VERSION_NOT_FOUND', 404, 'Versión ajena o no vigente');
  const comparison = { human: reconcileOffer(offers, verified) };
  const reviewId = await rpc<string>('print_rfq_review_quote', {
    p_org: org, p_actor: actor, p_version: versionId,
    p_extraction: { humanTranscription: verified }, p_comparison: comparison, p_resolution: resolution,
  });
  return { review_id: reviewId, discrepancies: comparison.human };
}

export const saveAllocation = async (org: string, actor: string, rfqId: string, lines: unknown, justification: string, revision: number) =>
  rpc<{ id: string; revision: number }>('print_rfq_save_allocation', { p_org: org, p_actor: actor, p_rfq: rfqId, p_lines: allocationSchema.parse(lines), p_justification: justification, p_expected_revision: revision });
export const authorizeAllocation = async (org: string, actor: string, allocationId: string, confirm: boolean) =>
  rpc<null>('print_rfq_authorize_allocation', { p_org: org, p_actor: actor, p_allocation: allocationId, p_confirm: confirm });
export const previewOrders = async (org: string, actor: string, allocationId: string) =>
  rpc<OrderPreview>('print_rfq_preview_orders', { p_org: org, p_actor: actor, p_allocation: allocationId });
export const confirmOrders = async (org: string, actor: string, allocationId: string, hash: string, confirm: boolean) =>
  rpc<{ order_ids: string[]; already_confirmed: boolean }>('print_rfq_confirm_orders', { p_org: org, p_actor: actor, p_allocation: allocationId, p_hash: hash, p_confirm: confirm });

export async function listPurchaseOrders(org: string) {
  const { data, error } = await db().from('print_purchase_orders').select('id, code, rfq_id, provider_name, currency, total, tax_total, freight, status, created_at, payment_terms, print_rfqs(code, title)')
    .eq('organization_id', org).order('created_at', { ascending: false }).limit(200);
  if (error) printRethrow(error, 'print_purchase_orders');
  return data ?? [];
}

export async function getPurchaseOrder(org: string, id: string) {
  const [order, items] = await Promise.all([
    db().from('print_purchase_orders').select('*, print_rfqs(code, title), print_providers(name, ruc, email, phone, city)').eq('id', id).eq('organization_id', org).maybeSingle(),
    db().from('print_purchase_order_items').select('*').eq('order_id', id).eq('organization_id', org).order('sku'),
  ]);
  assertOk(order, 'print_purchase_orders'); assertOk(items, 'print_purchase_order_items');
  if (!order.data) throw new PrintRfqError('PRINT_ORDER_NOT_FOUND', 404, 'Orden de compra no encontrada');
  return { order: order.data, items: items.data ?? [] };
}
