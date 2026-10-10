import { digitsOnly, normalizeName } from '@/lib/crm/purchase-import';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/db/supabase';
import { scoreCompany, type CompanyFacts } from './scoring';
import type { ParsedTender, ScoreReason } from './types';

export class LicitacionError extends Error {
  constructor(public code: string, public status: number, message?: string) {
    super(message ?? code);
    this.name = 'LicitacionError';
  }
}

const RPC_STATUS: Record<string, number> = {
  LICITACION_CANDIDATE_NOT_FOUND: 404,
  LICITACION_CANDIDATE_NOT_REVIEWED: 409,
  LICITACION_CANDIDATE_DISCARDED: 409,
  LICITACION_AMBIGUOUS_COMPANY: 409,
  LICITACION_LINK_COMPANY_NOT_FOUND: 404,
  INVALID_LICITACION_IMPORT: 400,
  INVALID_LICITACION_CONVERSION: 400,
};

function db() {
  // Sin respaldo en memoria: si Supabase no está disponible, la operación falla de forma explícita.
  if (!isSupabaseAdminConfigured || !supabaseAdmin) throw new Error('SUPABASE_PERSISTENCE_UNAVAILABLE');
  return supabaseAdmin;
}

function rethrow(error: { message?: string; code?: string }, relation: string): never {
  const message = error.message ?? 'PERSISTENCE_ERROR';
  const known = Object.keys(RPC_STATUS).find((code) => message.includes(code));
  if (known) throw new LicitacionError(known, RPC_STATUS[known]);
  if (error.code === '42P01' || /does not exist|schema cache/i.test(message)) throw new Error(`SUPABASE_SCHEMA_NOT_READY:${relation}`);
  throw new Error(`${relation}: ${message}`);
}

export interface ImportResult {
  tender_id: string;
  created: boolean;
  items: number;
  parties: number;
  candidates: number;
}

export async function importTender(organizationId: string, actorProfileId: string | null, tender: ParsedTender, rawDocument?: unknown): Promise<ImportResult> {
  const client = db();
  const payload = {
    tender: {
      source: tender.source, external_id: tender.external_id, source_url: tender.source_url, title: tender.title,
      convening_entity: tender.convening_entity, procurement_object: tender.procurement_object, status: tender.status,
      published_at: tender.published_at, closing_at: tender.closing_at, awarded_at: tender.awarded_at,
      is_test_data: tender.is_test_data,
      raw_document: { release: rawDocument ?? null, documents: tender.documents, unconfirmed: tender.unconfirmed },
    },
    items: tender.items.map(({ source_item_id: _omit, ...item }) => item),
    parties: tender.parties.filter((p) => p.name.trim()),
  };
  const { data, error } = await client.rpc('import_licitacion_atomic', {
    p_organization_id: organizationId, p_actor_profile_id: actorProfileId, p_payload: payload,
  });
  if (error) rethrow(error, 'import_licitacion_atomic');
  const imported = data as { tender_id: string; created: boolean; items: number; parties: number };
  const candidates = await refreshCandidates(organizationId);
  return { ...imported, candidates };
}

interface PartyRow { id: string; tender_id: string; item_id: string | null; role: string; name: string; name_normalized: string; ruc: string | null; ruc_digits: string | null; role_confirmed: boolean }
interface ItemRow { id: string; tender_id: string; description: string; quantity: number | null; is_injectable: boolean; presentation: string | null; injectable_evidence: string | null }

/**
 * Recalcula las candidatas desde los hechos guardados (idempotente y determinista).
 * Conserva revisión humana y vínculos CRM; solo actualiza puntaje, razones y trazabilidad.
 */
export async function refreshCandidates(organizationId: string): Promise<number> {
  const client = db();
  const [partiesRes, itemsRes] = await Promise.all([
    client.from('licitaciones_parties').select('id, tender_id, item_id, role, name, name_normalized, ruc, ruc_digits, role_confirmed').eq('organization_id', organizationId).neq('role', 'CONVOCANTE'),
    client.from('licitaciones_items').select('id, tender_id, description, quantity, is_injectable, presentation, injectable_evidence').eq('organization_id', organizationId),
  ]);
  if (partiesRes.error) rethrow(partiesRes.error, 'licitaciones_parties');
  if (itemsRes.error) rethrow(itemsRes.error, 'licitaciones_items');
  const parties = (partiesRes.data ?? []) as PartyRow[];
  const items = (itemsRes.data ?? []) as ItemRow[];
  const itemById = new Map(items.map((i) => [i.id, i]));
  const itemsByTender = new Map<string, ItemRow[]>();
  for (const item of items) itemsByTender.set(item.tender_id, [...(itemsByTender.get(item.tender_id) ?? []), item]);

  // Un nombre con dos RUC distintos es ambiguo: nunca se fusiona por similitud.
  const rucsByName = new Map<string, Set<string>>();
  for (const p of parties) if (p.ruc_digits) rucsByName.set(p.name_normalized, (rucsByName.get(p.name_normalized) ?? new Set()).add(p.ruc_digits));
  const keyOf = (p: PartyRow): { key: string; ambiguous: boolean } => {
    if (p.ruc_digits) return { key: `ruc:${p.ruc_digits}`, ambiguous: false };
    const rucs = rucsByName.get(p.name_normalized);
    if (rucs?.size === 1) return { key: `ruc:${[...rucs][0]}`, ambiguous: false };
    return { key: `n:${p.name_normalized}`, ambiguous: Boolean(rucs && rucs.size > 1) };
  };

  const groups = new Map<string, { ambiguous: boolean; parties: PartyRow[] }>();
  for (const p of parties) {
    if (!p.name_normalized) continue;
    const { key, ambiguous } = keyOf(p);
    const group = groups.get(key) ?? { ambiguous, parties: [] };
    group.parties.push(p);
    groups.set(key, group);
  }

  let touched = 0;
  for (const [key, group] of groups) {
    const names = new Map<string, number>();
    for (const p of group.parties) names.set(p.name, (names.get(p.name) ?? 0) + 1);
    const displayName = [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const ruc = group.parties.find((p) => p.ruc)?.ruc ?? null;
    const rucDigits = group.parties.find((p) => p.ruc_digits)?.ruc_digits ?? null;

    const facts: CompanyFacts = { ruc: rucDigits, roles: [] };
    const products = new Set<string>();
    const tenderIds = new Set<string>();
    const rolesSeen = new Map<string, boolean>();
    for (const p of group.parties) {
      const scoped = p.item_id ? [itemById.get(p.item_id)].filter(Boolean) as ItemRow[] : itemsByTender.get(p.tender_id) ?? [];
      const injectable = scoped.filter((i) => i.is_injectable);
      injectable.forEach((i) => products.add(i.description));
      tenderIds.add(p.tender_id);
      rolesSeen.set(p.role, (rolesSeen.get(p.role) ?? false) || p.role_confirmed);
      facts.roles.push({
        role: p.role, tender_id: p.tender_id, confirmed: p.role_confirmed,
        injectable_items: injectable.length,
        injectable_units: injectable.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0),
        ampolla_items: injectable.filter((i) => /ampoll/i.test(`${i.presentation ?? ''} ${i.description}`)).length,
      });
    }
    const result = scoreCompany(facts);
    const reasons: ScoreReason[] = [...result.reasons];
    if (group.ambiguous) reasons.push({ code: 'AMBIGUO', points: 0, text: 'El mismo nombre aparece con RUC distintos: requiere revisión humana antes de agregarlo al CRM' });

    const row = {
      organization_id: organizationId, candidate_key: key, display_name: displayName, name_normalized: normalizeName(displayName),
      ruc, ruc_digits: rucDigits ? digitsOnly(rucDigits) : null,
    };
    const scoring = {
      potential: result.potential, score: result.score, reasons,
      roles: [...rolesSeen].map(([role, confirmed]) => ({ role, confirmed })),
      tender_ids: [...tenderIds], products: [...products].slice(0, 12), updated_at: new Date().toISOString(),
    };
    const ins = await client.from('licitaciones_candidates').upsert({ ...row, ...scoring }, { onConflict: 'organization_id,candidate_key', ignoreDuplicates: true });
    if (ins.error) rethrow(ins.error, 'licitaciones_candidates');
    const upd = await client.from('licitaciones_candidates').update({ ...scoring, display_name: displayName, ruc, ruc_digits: row.ruc_digits })
      .eq('organization_id', organizationId).eq('candidate_key', key);
    if (upd.error) rethrow(upd.error, 'licitaciones_candidates');
    touched += 1;
  }

  // Candidatas pendientes que ya no corresponden a ningún grupo (p. ej. se unificó por RUC) se retiran.
  const { data: existing, error: existingError } = await client.from('licitaciones_candidates').select('id, candidate_key, review_status').eq('organization_id', organizationId);
  if (existingError) rethrow(existingError, 'licitaciones_candidates');
  const stale = (existing ?? []).filter((c: any) => c.review_status === 'PENDIENTE' && !groups.has(c.candidate_key)).map((c: any) => c.id);
  if (stale.length) {
    const del = await client.from('licitaciones_candidates').delete().eq('organization_id', organizationId).in('id', stale);
    if (del.error) rethrow(del.error, 'licitaciones_candidates');
  }
  return touched;
}

export async function listTenders(organizationId: string) {
  const { data, error } = await db().from('licitaciones_tenders')
    .select('id, source, external_id, source_url, title, convening_entity, status, published_at, awarded_at, is_test_data, created_at')
    .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(200);
  if (error) rethrow(error, 'licitaciones_tenders');
  return data ?? [];
}

export async function getTenderDetail(organizationId: string, tenderId: string) {
  const client = db();
  const { data: tender, error } = await client.from('licitaciones_tenders').select('*').eq('organization_id', organizationId).eq('id', tenderId).maybeSingle();
  if (error) rethrow(error, 'licitaciones_tenders');
  if (!tender) throw new LicitacionError('LICITACION_NOT_FOUND', 404);
  const [items, parties] = await Promise.all([
    client.from('licitaciones_items').select('*').eq('organization_id', organizationId).eq('tender_id', tenderId).order('line_no'),
    client.from('licitaciones_parties').select('*').eq('organization_id', organizationId).eq('tender_id', tenderId).order('role'),
  ]);
  if (items.error) rethrow(items.error, 'licitaciones_items');
  if (parties.error) rethrow(parties.error, 'licitaciones_parties');
  return { tender, items: items.data ?? [], parties: parties.data ?? [] };
}

export async function listCandidates(organizationId: string) {
  const { data, error } = await db().from('licitaciones_candidates').select('*')
    .eq('organization_id', organizationId).order('score', { ascending: false }).limit(500);
  if (error) rethrow(error, 'licitaciones_candidates');
  return data ?? [];
}

export async function reviewCandidate(organizationId: string, candidateId: string, profileId: string, decision: 'APROBADA' | 'DESCARTADA' | 'PENDIENTE', note?: string) {
  const client = db();
  const { data: current, error: readError } = await client.from('licitaciones_candidates').select('id, review_status').eq('organization_id', organizationId).eq('id', candidateId).maybeSingle();
  if (readError) rethrow(readError, 'licitaciones_candidates');
  if (!current) throw new LicitacionError('LICITACION_CANDIDATE_NOT_FOUND', 404);
  if (current.review_status === 'CONVERTIDA') throw new LicitacionError('LICITACION_CANDIDATE_ALREADY_CONVERTED', 409);
  const { data, error } = await client.from('licitaciones_candidates')
    .update({ review_status: decision, review_note: note ?? null, reviewed_by_profile_id: profileId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId).eq('id', candidateId).neq('review_status', 'CONVERTIDA').select().maybeSingle();
  if (error) rethrow(error, 'licitaciones_candidates');
  if (!data) throw new LicitacionError('LICITACION_CANDIDATE_ALREADY_CONVERTED', 409);
  return data;
}

export interface ConversionOptions { createOpportunity?: boolean; opportunityTitle?: string; linkCompanyId?: string; forceCreate?: boolean }

export async function convertCandidateToProspect(organizationId: string, actorProfileId: string, candidateId: string, options: ConversionOptions = {}) {
  const { data, error } = await db().rpc('convert_licitacion_candidate_to_prospect', {
    p_organization_id: organizationId, p_candidate_id: candidateId, p_actor_profile_id: actorProfileId,
    p_create_opportunity: Boolean(options.createOpportunity), p_opportunity_title: options.opportunityTitle ?? null,
    p_link_company_id: options.linkCompanyId ?? null, p_force_create: Boolean(options.forceCreate),
  });
  if (error) rethrow(error, 'convert_licitacion_candidate_to_prospect');
  return data as { company_id: string; company_created: boolean; opportunity_id: string | null; already_converted: boolean };
}
