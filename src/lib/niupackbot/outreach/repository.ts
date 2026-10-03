// Outreach repository: ÚNICA capa que toca niupackbot_templates / campaigns / campaign_recipients / opt_outs.
// Mismo patrón que crm/repository: Supabase en prod, memoria en test/dev.

import { supabaseAdmin } from '@/lib/db/supabase';
import { crmRepository } from '@/lib/crm/repository';
import type { CampaignRecipient, OptOut, OutreachCampaign, OutreachTemplate, RecipientInput, RecipientStatus } from './types';

interface OutreachMemory {
  templates: OutreachTemplate[];
  campaigns: OutreachCampaign[];
  recipients: CampaignRecipient[];
  optOuts: OptOut[];
}

declare global {
  // eslint-disable-next-line no-var
  var __niu_outreach_store: OutreachMemory | undefined;
}

const emptyMem = (): OutreachMemory => ({ templates: [], campaigns: [], recipients: [], optOuts: [] });
const mem = (): OutreachMemory => (global.__niu_outreach_store ??= emptyMem());
export function resetOutreachMemory(): void {
  global.__niu_outreach_store = emptyMem();
}

const now = () => new Date().toISOString();
const persistedInDb = () => crmRepository.persistenceMode() === 'SUPABASE' && Boolean(supabaseAdmin);
const org = (id?: string) => {
  if (!id) throw new Error('ORGANIZATION_REQUIRED');
  return id;
};
const fail = (table: string, error: { message: string }) => new Error(`${table}: ${error.message}`);
const PAGE = 1000;

const T_TPL = 'niupackbot_templates';
const T_CAMP = 'niupackbot_campaigns';
const T_REC = 'niupackbot_campaign_recipients';
const T_OPT = 'niupackbot_opt_outs';

export const outreachRepository = {
  // ---------- Templates ----------
  async listTemplates(organizationId: string): Promise<OutreachTemplate[]> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_TPL).select('*').eq('organization_id', organizationId).order('created_at', { ascending: false });
      if (error) throw fail(T_TPL, error);
      return (data ?? []) as OutreachTemplate[];
    }
    return mem().templates.filter((t) => t.organization_id === organizationId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getTemplate(id: string, organizationId: string): Promise<OutreachTemplate | undefined> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_TPL).select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
      if (error) throw fail(T_TPL, error);
      return (data as OutreachTemplate | null) ?? undefined;
    }
    return mem().templates.find((t) => t.id === id && t.organization_id === organizationId);
  },

  async findTemplateByName(organizationId: string, name: string): Promise<OutreachTemplate | undefined> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_TPL).select('*').eq('organization_id', organizationId).eq('name', name).maybeSingle();
      if (error) throw fail(T_TPL, error);
      return (data as OutreachTemplate | null) ?? undefined;
    }
    return mem().templates.find((t) => t.name === name && t.organization_id === organizationId);
  },

  async insertTemplate(input: Omit<OutreachTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<OutreachTemplate> {
    org(input.organization_id);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_TPL).insert(input).select().single();
      if (error) throw fail(T_TPL, error);
      return data as OutreachTemplate;
    }
    const rec: OutreachTemplate = { ...input, id: crypto.randomUUID(), created_at: now(), updated_at: now() };
    mem().templates.push(rec);
    return rec;
  },

  async updateTemplate(id: string, organizationId: string, updates: Partial<OutreachTemplate>): Promise<OutreachTemplate> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_TPL).update({ ...updates, updated_at: now() }).eq('id', id).eq('organization_id', organizationId).select().single();
      if (error) throw fail(T_TPL, error);
      return data as OutreachTemplate;
    }
    const t = mem().templates.find((x) => x.id === id && x.organization_id === organizationId);
    if (!t) throw new Error('TEMPLATE_NOT_FOUND');
    Object.assign(t, updates, { updated_at: now() });
    return t;
  },

  // ---------- Campaigns ----------
  async listCampaigns(organizationId: string, statuses?: string[]): Promise<OutreachCampaign[]> {
    org(organizationId);
    if (persistedInDb()) {
      let q = supabaseAdmin!.from(T_CAMP).select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(200);
      if (statuses?.length) q = q.in('status', statuses);
      const { data, error } = await q;
      if (error) throw fail(T_CAMP, error);
      return (data ?? []) as OutreachCampaign[];
    }
    return mem()
      .campaigns.filter((c) => c.organization_id === organizationId && (!statuses?.length || statuses.includes(c.status)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getCampaign(id: string, organizationId: string): Promise<OutreachCampaign | undefined> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_CAMP).select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
      if (error) throw fail(T_CAMP, error);
      return (data as OutreachCampaign | null) ?? undefined;
    }
    return mem().campaigns.find((c) => c.id === id && c.organization_id === organizationId);
  },

  async insertCampaign(input: Omit<OutreachCampaign, 'id' | 'created_at' | 'updated_at'>): Promise<OutreachCampaign> {
    org(input.organization_id);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_CAMP).insert(input).select().single();
      if (error) throw fail(T_CAMP, error);
      return data as OutreachCampaign;
    }
    const rec: OutreachCampaign = { ...input, id: crypto.randomUUID(), created_at: now(), updated_at: now() };
    mem().campaigns.push(rec);
    return rec;
  },

  /** Compare-and-swap de estado: solo actualiza si la campaña sigue en uno de `from`. */
  async updateCampaign(id: string, organizationId: string, updates: Partial<OutreachCampaign>, from?: string[]): Promise<OutreachCampaign | undefined> {
    org(organizationId);
    if (persistedInDb()) {
      let q = supabaseAdmin!.from(T_CAMP).update({ ...updates, updated_at: now() }).eq('id', id).eq('organization_id', organizationId);
      if (from?.length) q = q.in('status', from);
      const { data, error } = await q.select().maybeSingle();
      if (error) throw fail(T_CAMP, error);
      return (data as OutreachCampaign | null) ?? undefined;
    }
    const c = mem().campaigns.find((x) => x.id === id && x.organization_id === organizationId);
    if (!c || (from?.length && !from.includes(c.status))) return undefined;
    Object.assign(c, updates, { updated_at: now() });
    return c;
  },

  // ---------- Recipients ----------
  /** Inserta destinatarios; los teléfonos ya presentes en la campaña se ignoran (idempotente). */
  async insertRecipients(organizationId: string, campaignId: string, rows: Array<RecipientInput & { status?: RecipientStatus }>): Promise<{ inserted: number; skipped: number }> {
    org(organizationId);
    if (rows.length === 0) return { inserted: 0, skipped: 0 };
    const records = rows.map((r) => ({
      organization_id: organizationId,
      campaign_id: campaignId,
      contact_id: r.contact_id ?? null,
      company_id: r.company_id ?? null,
      conversation_id: null,
      name: r.name,
      phone_e164: r.phone_e164,
      content_variables: r.variables ?? {},
      status: r.status ?? ('PENDING' as RecipientStatus),
      attempts: 0,
    }));
    if (persistedInDb()) {
      let inserted = 0;
      for (let i = 0; i < records.length; i += 500) {
        const { data, error } = await supabaseAdmin!
          .from(T_REC)
          .upsert(records.slice(i, i + 500), { onConflict: 'campaign_id,phone_e164', ignoreDuplicates: true })
          .select('id');
        if (error) throw fail(T_REC, error);
        inserted += data?.length ?? 0;
      }
      return { inserted, skipped: records.length - inserted };
    }
    let inserted = 0;
    for (const r of records) {
      if (mem().recipients.some((x) => x.campaign_id === campaignId && x.phone_e164 === r.phone_e164)) continue;
      mem().recipients.push({ ...r, id: crypto.randomUUID(), created_at: now(), updated_at: now() } as CampaignRecipient);
      inserted += 1;
    }
    return { inserted, skipped: records.length - inserted };
  },

  async listRecipients(organizationId: string, campaignId: string, opts: { status?: string; limit?: number; offset?: number } = {}): Promise<CampaignRecipient[]> {
    org(organizationId);
    const limit = Math.min(opts.limit ?? 100, 500);
    const offset = opts.offset ?? 0;
    if (persistedInDb()) {
      let q = supabaseAdmin!
        .from(T_REC)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (opts.status) q = q.eq('status', opts.status);
      const { data, error } = await q;
      if (error) throw fail(T_REC, error);
      return (data ?? []) as CampaignRecipient[];
    }
    return mem()
      .recipients.filter((r) => r.organization_id === organizationId && r.campaign_id === campaignId && (!opts.status || r.status === opts.status))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(offset, offset + limit);
  },

  /** Estado de todos los destinatarios de las campañas pedidas (solo campaign_id + status) para contadores. */
  async recipientStatuses(organizationId: string, campaignIds: string[]): Promise<Array<{ campaign_id: string; status: RecipientStatus }>> {
    org(organizationId);
    if (campaignIds.length === 0) return [];
    if (persistedInDb()) {
      const out: Array<{ campaign_id: string; status: RecipientStatus }> = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabaseAdmin!
          .from(T_REC)
          .select('campaign_id,status')
          .eq('organization_id', organizationId)
          .in('campaign_id', campaignIds)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw fail(T_REC, error);
        out.push(...((data ?? []) as Array<{ campaign_id: string; status: RecipientStatus }>));
        if (!data || data.length < PAGE) break;
      }
      return out;
    }
    return mem()
      .recipients.filter((r) => r.organization_id === organizationId && campaignIds.includes(r.campaign_id))
      .map((r) => ({ campaign_id: r.campaign_id, status: r.status }));
  },

  async getRecipient(id: string, organizationId: string): Promise<CampaignRecipient | undefined> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_REC).select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
      if (error) throw fail(T_REC, error);
      return (data as CampaignRecipient | null) ?? undefined;
    }
    return mem().recipients.find((r) => r.id === id && r.organization_id === organizationId);
  },

  async findRecipientBySid(organizationId: string, sid: string): Promise<CampaignRecipient | undefined> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_REC).select('*').eq('organization_id', organizationId).eq('message_sid', sid).maybeSingle();
      if (error) throw fail(T_REC, error);
      return (data as CampaignRecipient | null) ?? undefined;
    }
    return mem().recipients.find((r) => r.organization_id === organizationId && r.message_sid === sid);
  },

  /** Destinatarios de un teléfono, más reciente primero (todas las campañas). */
  async listRecipientsByPhone(organizationId: string, phone: string): Promise<CampaignRecipient[]> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!
        .from(T_REC)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('phone_e164', phone)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw fail(T_REC, error);
      return (data ?? []) as CampaignRecipient[];
    }
    return mem()
      .recipients.filter((r) => r.organization_id === organizationId && r.phone_e164 === phone)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async listRecipientsByConversations(organizationId: string, conversationIds: string[]): Promise<CampaignRecipient[]> {
    org(organizationId);
    if (conversationIds.length === 0) return [];
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!
        .from(T_REC)
        .select('*')
        .eq('organization_id', organizationId)
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false });
      if (error) throw fail(T_REC, error);
      return (data ?? []) as CampaignRecipient[];
    }
    return mem().recipients.filter((r) => r.organization_id === organizationId && r.conversation_id && conversationIds.includes(r.conversation_id));
  },

  async listByStatus(organizationId: string, campaignId: string, status: RecipientStatus, limit: number, olderThanClaim?: string): Promise<CampaignRecipient[]> {
    org(organizationId);
    if (persistedInDb()) {
      let q = supabaseAdmin!
        .from(T_REC)
        .select('*')
        .eq('organization_id', organizationId)
        .eq('campaign_id', campaignId)
        .eq('status', status)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);
      if (olderThanClaim) q = q.lt('claimed_at', olderThanClaim);
      const { data, error } = await q;
      if (error) throw fail(T_REC, error);
      return (data ?? []) as CampaignRecipient[];
    }
    return mem()
      .recipients.filter(
        (r) =>
          r.organization_id === organizationId &&
          r.campaign_id === campaignId &&
          r.status === status &&
          (!olderThanClaim || (r.claimed_at != null && r.claimed_at < olderThanClaim)),
      )
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit);
  },

  /**
   * Claim atómico PENDING → QUEUED (compare-and-swap). Devuelve undefined si otro worker
   * (refresh de UI, retry de Vercel, tick concurrente) ya lo tomó: ese es el candado anti doble envío.
   */
  async claimRecipient(organizationId: string, id: string): Promise<CampaignRecipient | undefined> {
    org(organizationId);
    if (persistedInDb()) {
      // attempts se incrementa leyendo el valor actual; el CAS por status garantiza un único ganador.
      const current = await this.getRecipient(id, organizationId);
      if (!current || current.status !== 'PENDING') return undefined;
      const { data, error } = await supabaseAdmin!
        .from(T_REC)
        .update({ status: 'QUEUED', claimed_at: now(), attempts: current.attempts + 1, updated_at: now() })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .eq('status', 'PENDING')
        .select()
        .maybeSingle();
      if (error) throw fail(T_REC, error);
      return (data as CampaignRecipient | null) ?? undefined;
    }
    const r = mem().recipients.find((x) => x.id === id && x.organization_id === organizationId);
    if (!r || r.status !== 'PENDING') return undefined;
    Object.assign(r, { status: 'QUEUED', claimed_at: now(), attempts: r.attempts + 1, updated_at: now() });
    return r;
  },

  async updateRecipient(id: string, organizationId: string, updates: Partial<CampaignRecipient>): Promise<CampaignRecipient> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_REC).update({ ...updates, updated_at: now() }).eq('id', id).eq('organization_id', organizationId).select().single();
      if (error) throw fail(T_REC, error);
      return data as CampaignRecipient;
    }
    const r = mem().recipients.find((x) => x.id === id && x.organization_id === organizationId);
    if (!r) throw new Error('RECIPIENT_NOT_FOUND');
    Object.assign(r, updates, { updated_at: now() });
    return r;
  },

  /** Marca como OPT_OUT todos los pendientes/en cola de un teléfono (cualquier campaña). */
  async optOutPendingForPhone(organizationId: string, phone: string): Promise<number> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!
        .from(T_REC)
        .update({ status: 'OPT_OUT', updated_at: now() })
        .eq('organization_id', organizationId)
        .eq('phone_e164', phone)
        .in('status', ['PENDING', 'QUEUED'])
        .select('id');
      if (error) throw fail(T_REC, error);
      return data?.length ?? 0;
    }
    let n = 0;
    for (const r of mem().recipients) {
      if (r.organization_id === organizationId && r.phone_e164 === phone && (r.status === 'PENDING' || r.status === 'QUEUED')) {
        Object.assign(r, { status: 'OPT_OUT', updated_at: now() });
        n += 1;
      }
    }
    return n;
  },

  // ---------- Opt-outs ----------
  async isOptedOut(organizationId: string, phone: string): Promise<boolean> {
    org(organizationId);
    if (persistedInDb()) {
      const { data, error } = await supabaseAdmin!.from(T_OPT).select('id').eq('organization_id', organizationId).eq('phone_e164', phone).maybeSingle();
      if (error) throw fail(T_OPT, error);
      return Boolean(data);
    }
    return mem().optOuts.some((o) => o.organization_id === organizationId && o.phone_e164 === phone);
  },

  async listOptedOut(organizationId: string, phones: string[]): Promise<Set<string>> {
    org(organizationId);
    const out = new Set<string>();
    if (phones.length === 0) return out;
    if (persistedInDb()) {
      for (let i = 0; i < phones.length; i += 200) {
        const { data, error } = await supabaseAdmin!.from(T_OPT).select('phone_e164').eq('organization_id', organizationId).in('phone_e164', phones.slice(i, i + 200));
        if (error) throw fail(T_OPT, error);
        for (const row of data ?? []) out.add((row as { phone_e164: string }).phone_e164);
      }
      return out;
    }
    for (const o of mem().optOuts) if (o.organization_id === organizationId && phones.includes(o.phone_e164)) out.add(o.phone_e164);
    return out;
  },

  async addOptOut(organizationId: string, phone: string, source: OptOut['source'], reason?: string | null): Promise<void> {
    org(organizationId);
    if (persistedInDb()) {
      const { error } = await supabaseAdmin!
        .from(T_OPT)
        .upsert({ organization_id: organizationId, phone_e164: phone, source, reason: reason ?? null }, { onConflict: 'organization_id,phone_e164', ignoreDuplicates: true });
      if (error) throw fail(T_OPT, error);
      return;
    }
    if (!mem().optOuts.some((o) => o.organization_id === organizationId && o.phone_e164 === phone)) {
      mem().optOuts.push({ id: crypto.randomUUID(), organization_id: organizationId, phone_e164: phone, source, reason: reason ?? null, created_at: now() });
    }
  },
};
