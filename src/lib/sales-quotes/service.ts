import { z } from 'zod';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/db/supabase';
import { saveQuoteSchema } from './domain';

const ERRORS: Record<string, [number, string]> = {
  SQ_ACTOR_NOT_ALLOWED: [403, 'No tenés permiso para esta acción'],
  SQ_CLIENT_REQUIRED: [400, 'Indicá el cliente'],
  SQ_LINES_INVALID: [400, 'Cargá entre 1 y 200 líneas'],
  SQ_LINE_INVALID: [400, 'Hay una línea con datos inválidos'],
  SQ_COMPANY_NOT_FOUND: [404, 'La empresa no existe en el CRM'],
  SQ_SKU_NOT_FOUND: [404, 'El SKU no existe en el catálogo'],
  SQ_NOT_FOUND: [404, 'Presupuesto no encontrado'],
  SQ_NOT_EDITABLE: [409, 'Solo se edita un presupuesto en borrador: reabrilo primero'],
  SQ_INVALID_STATE: [409, 'La acción no corresponde al estado actual del presupuesto'],
  SQ_ACTION_INVALID: [400, 'Acción inválida'],
  SQ_EXPIRED: [409, 'El presupuesto está vencido: reabrilo y actualizá la vigencia'],
  SQ_ACCEPTOR_REQUIRED: [400, 'Indicá quién aceptó por el cliente'],
  SQ_ACCEPT_LINES_REQUIRED: [400, 'Elegí al menos una línea aceptada'],
  SQ_ACCEPT_LINES_INVALID: [400, 'Hay líneas que no se pueden aceptar (sin cantidad o ajenas)'],
  SQ_ACCEPT_ONE_TIER: [400, 'Elegí una sola escala de cantidad por ítem'],
  SQ_WORK_ORDER_NOT_FOUND: [404, 'Orden de trabajo no encontrada'],
};

export class SalesQuoteError extends Error {
  constructor(public code: string, public status: number, message?: string) { super(message ?? code); this.name = 'SalesQuoteError'; }
}

function db() {
  if (!isSupabaseAdminConfigured || !supabaseAdmin) throw new Error('SUPABASE_PERSISTENCE_UNAVAILABLE');
  return supabaseAdmin;
}

function rethrow(error: { message?: string; code?: string }, relation: string): never {
  const message = error.message ?? 'PERSISTENCE_ERROR';
  const known = Object.keys(ERRORS).find((code) => message.includes(code));
  if (known) throw new SalesQuoteError(known, ERRORS[known][0], ERRORS[known][1]);
  if (error.code === '23505') throw new SalesQuoteError('SQ_DUPLICATE_TIER', 409, 'Hay dos líneas del mismo ítem con la misma cantidad');
  if (error.code === '42P01' || /does not exist|schema cache/i.test(message)) throw new Error(`SUPABASE_SCHEMA_NOT_READY:${relation}`);
  throw new Error(`${relation}: ${message}`);
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) rethrow(error, name);
  return data as T;
}

type Row = any;

export async function listQuotes(org: string, filter: { q?: string; status?: string } = {}) {
  let query = db().from('sales_quotes').select('id, code, client_name, subject, status, quote_date, valid_until, currency, version, created_at').eq('organization_id', org).order('created_at', { ascending: false }).limit(200);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.q?.trim()) { const term = filter.q.trim().replace(/[%,()]/g, ''); query = query.or(`code.ilike.%${term}%,client_name.ilike.%${term}%,subject.ilike.%${term}%`); }
  const { data, error } = await query;
  if (error) rethrow(error, 'sales_quotes');
  const quotes = data ?? [];
  if (!quotes.length) return [];
  const lines = await db().from('sales_quote_lines').select('quote_id, line_total').eq('organization_id', org).in('quote_id', quotes.map((q: Row) => q.id));
  if (lines.error) rethrow(lines.error, 'sales_quote_lines');
  const wos = await db().from('sales_work_orders').select('id, code, quote_id').eq('organization_id', org).in('quote_id', quotes.map((q: Row) => q.id));
  if (wos.error) rethrow(wos.error, 'sales_work_orders');
  return quotes.map((q: Row) => ({
    ...q,
    lines: (lines.data ?? []).filter((l: Row) => l.quote_id === q.id).length,
    work_order: (wos.data ?? []).find((w: Row) => w.quote_id === q.id) ?? null,
  }));
}

export async function getQuote(org: string, id: string) {
  const [quote, lines, events, wo] = await Promise.all([
    db().from('sales_quotes').select('*').eq('id', id).eq('organization_id', org).maybeSingle(),
    db().from('sales_quote_lines').select('*').eq('quote_id', id).eq('organization_id', org).order('sort_order'),
    db().from('sales_quote_events').select('id, event, detail, created_at').eq('quote_id', id).eq('organization_id', org).order('created_at', { ascending: false }).limit(50),
    db().from('sales_work_orders').select('id, code, status').eq('quote_id', id).eq('organization_id', org).maybeSingle(),
  ]);
  for (const r of [quote, lines, events, wo]) if (r.error) rethrow(r.error, 'sales_quotes');
  if (!quote.data) throw new SalesQuoteError('SQ_NOT_FOUND', 404, ERRORS.SQ_NOT_FOUND[1]);
  return { quote: quote.data as Row, lines: (lines.data ?? []) as Row[], events: (events.data ?? []) as Row[], work_order: wo.data as Row | null };
}

/** Datos de la última firma y condiciones usadas, para no volver a tipearlas. */
export async function getQuoteDefaults(org: string, profileId: string) {
  const [last, profile] = await Promise.all([
    db().from('sales_quotes').select('signer_name, signer_title, signer_company, payment_terms, delivery_terms').eq('organization_id', org).order('created_at', { ascending: false }).limit(1),
    db().from('profiles').select('full_name').eq('id', profileId).maybeSingle(),
  ]);
  const row = last.data?.[0];
  return {
    signer_name: row?.signer_name ?? profile.data?.full_name ?? '', signer_title: row?.signer_title ?? '', signer_company: row?.signer_company ?? '',
    payment_terms: row?.payment_terms ?? 'A convenir', delivery_terms: row?.delivery_terms ?? 'A convenir',
  };
}

export async function saveQuote(org: string, actor: string, input: unknown, quoteId: string | null = null) {
  const { header, lines } = saveQuoteSchema.parse(input);
  return rpc<{ id: string; code: string; version: number }>('sales_quote_save', {
    p_org: org, p_actor: actor, p_quote: quoteId, p_header: header,
    p_lines: lines.map((l) => ({ ...l, sku: l.sku || null })),
  });
}

export const transitionQuote = async (org: string, actor: string, id: string, action: 'SEND' | 'REOPEN' | 'REJECT' | 'VOID', note?: string) =>
  rpc<null>('sales_quote_transition', { p_org: org, p_actor: actor, p_quote: id, p_action: action, p_note: note ?? null });

export const acceptQuote = async (org: string, actor: string, id: string, lineIds: string[], acceptor: string, note?: string) =>
  rpc<{ work_order_id: string; work_order_code: string }>('sales_quote_accept', {
    p_org: org, p_actor: actor, p_quote: id, p_line_ids: z.array(z.string().uuid()).min(1).max(200).parse(lineIds), p_acceptor: acceptor, p_note: note ?? null,
  });

export const setWorkOrderStatus = async (org: string, actor: string, id: string, status: string) =>
  rpc<null>('sales_work_order_status', { p_org: org, p_actor: actor, p_id: id, p_status: status });

export async function listWorkOrders(org: string) {
  const { data, error } = await db().from('sales_work_orders').select('id, code, client_name, status, created_at, quote_version, sales_quotes(id, code, subject)').eq('organization_id', org).order('created_at', { ascending: false }).limit(200);
  if (error) rethrow(error, 'sales_work_orders');
  return data ?? [];
}

export async function getWorkOrder(org: string, id: string) {
  const [wo, items] = await Promise.all([
    db().from('sales_work_orders').select('*, sales_quotes(id, code, subject, currency, accepted_by_name, accepted_at, payment_terms, delivery_terms)').eq('id', id).eq('organization_id', org).maybeSingle(),
    db().from('sales_work_order_items').select('*').eq('work_order_id', id).eq('organization_id', org).order('item_no'),
  ]);
  if (wo.error) rethrow(wo.error, 'sales_work_orders');
  if (items.error) rethrow(items.error, 'sales_work_order_items');
  if (!wo.data) throw new SalesQuoteError('SQ_WORK_ORDER_NOT_FOUND', 404, ERRORS.SQ_WORK_ORDER_NOT_FOUND[1]);
  return { work_order: wo.data as Row, items: (items.data ?? []) as Row[] };
}

export async function searchCompanies(org: string, q: string) {
  const term = q.trim().replace(/[%,()]/g, '').slice(0, 60);
  let query = db().from('crm_companies').select('id, name, legal_name, tax_id').eq('organization_id', org).order('name').limit(20);
  if (term) query = query.or(`name.ilike.%${term}%,legal_name.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) rethrow(error, 'crm_companies');
  return data ?? [];
}

/** Catálogo de SKU con una descripción sugerida que el usuario puede editar. */
export async function searchSkus(org: string, q: string) {
  const term = q.trim().replace(/[%,()]/g, '').slice(0, 60);
  let query = db().from('product_attributes').select('id, sku, size_oz, size_ml, material, paper_weight_gsm, products!inner(name, organization_id, is_active)')
    .eq('products.organization_id', org).eq('products.is_active', true).order('sku').limit(30);
  if (term) query = query.ilike('sku', `%${term}%`);
  const { data, error } = await query;
  if (error) rethrow(error, 'product_attributes');
  return (data ?? []).map((r: Row) => ({
    id: r.id, sku: r.sku, name: r.products.name,
    description: [r.products.name, r.size_ml ? `${Number(r.size_ml)} ml` : r.size_oz ? `${Number(r.size_oz)} oz` : null, r.paper_weight_gsm ? `${Number(r.paper_weight_gsm)} g` : null].filter(Boolean).join(' · '),
  }));
}
