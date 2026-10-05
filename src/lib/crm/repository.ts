// CRM Repository: persistencia + queries. Única capa autorizada a tocar `crm_*` en Supabase.
// Service y NIUPACKBOT deben pasar por acá (vía crmService). Prohibido insert directo fuera de este archivo.

import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/db/supabase';
import type {
  CrmActivity,
  CrmCompany,
  CrmContact,
  CrmConversation,
  CrmLead,
  CrmOpportunity,
  CrmTask,
} from './types';
import type { CustomerPurchase } from './purchase-types';

interface CrmMemory {
  companies: CrmCompany[];
  contacts: CrmContact[];
  leads: CrmLead[];
  opportunities: CrmOpportunity[];
  tasks: CrmTask[];
  activities: CrmActivity[];
  conversations: CrmConversation[];
  purchases: CustomerPurchase[];
  customerAliases: Array<{ organization_id: string; alias_normalized: string; company_id: string }>;
  productAliases: Array<{ organization_id: string; alias_normalized: string; sku: string }>;
}

declare global {
  // eslint-disable-next-line no-var
  var __niu_crm_store: CrmMemory | undefined;
}

function mem(): CrmMemory {
  if (!global.__niu_crm_store) {
    global.__niu_crm_store = {
      companies: [],
      contacts: [],
      leads: [],
      opportunities: [],
      tasks: [],
      activities: [],
      conversations: [],
      purchases: [],
      customerAliases: [],
      productAliases: [],
    };
  }
  return global.__niu_crm_store;
}

export function resetCrmMemory(): void {
  global.__niu_crm_store = {
    companies: [],
    contacts: [],
    leads: [],
    opportunities: [],
    tasks: [],
    activities: [],
    conversations: [],
    purchases: [],
    customerAliases: [],
    productAliases: [],
  };
}

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

type Mode = 'SUPABASE' | 'MEMORY_FALLBACK' | 'NOT_CONFIGURED';

function mode(nodeEnv: string | undefined = process.env.NODE_ENV, allowMemory = process.env.NIU_CRM_ALLOW_MEMORY === 'true'): Mode {
  if (isSupabaseAdminConfigured && supabaseAdmin) return 'SUPABASE';
  if (nodeEnv === 'test' || (nodeEnv === 'development' && allowMemory)) return 'MEMORY_FALLBACK';
  // En dev sin flag explícito también permitimos memoria para no tumbar /commercial,
  // pero la API informa persistence para que la UI muestre estado real.
  if (nodeEnv === 'development') return 'MEMORY_FALLBACK';
  return 'NOT_CONFIGURED';
}

async function sb<T>(table: string, fn: (client: NonNullable<typeof supabaseAdmin>) => Promise<{ data: T | null; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await fn(supabaseAdmin!);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T;
}

function mustOrg(organizationId?: string): string {
  if (!organizationId) throw new Error('ORGANIZATION_REQUIRED');
  return organizationId;
}

export const crmRepository = {
  persistenceMode: mode,

  assertWritable(nodeEnv: string | undefined = process.env.NODE_ENV): void {
    if (mode(nodeEnv) === 'NOT_CONFIGURED') throw new Error('CRM_PERSISTENCE_NOT_CONFIGURED');
  },

  // ---------- Companies ----------
  async listCompanies(organizationId: string): Promise<CrmCompany[]> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_companies')
        .select('*')
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(2000);
      if (error) throw new Error(`crm_companies: ${error.message}`);
      return (data ?? []) as CrmCompany[];
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem().companies.filter((c) => c.organization_id === organizationId).slice(0, 2000);
  },

  async getCompany(id: string, organizationId: string): Promise<CrmCompany | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_companies')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw new Error(`crm_companies: ${error.message}`);
      return (data as CrmCompany | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().companies.find((c) => c.id === id && c.organization_id === organizationId);
  },

  async createCompany(input: Omit<CrmCompany, 'id' | 'created_at' | 'updated_at'>): Promise<CrmCompany> {
    this.assertWritable();
    const record = { ...input, id: uid(), created_at: now(), updated_at: now() };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      return sb<CrmCompany>('crm_companies', (c) =>
        // supabase typed via any
        c.from('crm_companies').insert(record).select().single() as never,
      );
    }
    mem().companies.unshift(record as CrmCompany);
    return record as CrmCompany;
  },

  async updateCompany(id: string, organizationId: string, updates: Partial<CrmCompany>): Promise<CrmCompany> {
    this.assertWritable();
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_companies')
        // supabase typed via any
        .update({ ...updates, updated_at: now() })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();
      if (error) throw new Error(`crm_companies: ${error.message}`);
      return data as CrmCompany;
    }
    const store = mem();
    const idx = store.companies.findIndex((c) => c.id === id && c.organization_id === organizationId);
    if (idx < 0) throw new Error('COMPANY_NOT_FOUND');
    store.companies[idx] = { ...store.companies[idx], ...updates, updated_at: now() };
    return store.companies[idx];
  },

  // ---------- Contacts ----------
  async listContacts(organizationId: string, companyId?: string): Promise<CrmContact[]> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      let q = supabaseAdmin.from('crm_contacts').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }).limit(3000);
      if (companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) throw new Error(`crm_contacts: ${error.message}`);
      return (data ?? []) as CrmContact[];
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem().contacts.filter((c) => c.organization_id === organizationId && (!companyId || c.company_id === companyId)).slice(0, 3000);
  },

  async getContact(id: string, organizationId: string): Promise<CrmContact | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('crm_contacts').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
      if (error) throw new Error(`crm_contacts: ${error.message}`);
      return (data as CrmContact | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().contacts.find((c) => c.id === id && c.organization_id === organizationId);
  },

  async findContactByWhatsapp(organizationId: string, whatsapp: string): Promise<CrmContact | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('crm_contacts').select('*').eq('organization_id', organizationId).eq('whatsapp_phone', whatsapp).maybeSingle();
      if (error) throw new Error(`crm_contacts: ${error.message}`);
      return (data as CrmContact | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().contacts.find((c) => c.organization_id === organizationId && c.whatsapp_phone === whatsapp);
  },

  async createContact(input: Omit<CrmContact, 'id' | 'created_at' | 'updated_at'>): Promise<CrmContact> {
    this.assertWritable();
    const record = { ...input, id: uid(), created_at: now(), updated_at: now() };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      return sb<CrmContact>('crm_contacts', (c) =>
        // supabase typed via any
        c.from('crm_contacts').insert(record).select().single() as never,
      );
    }
    mem().contacts.unshift(record as CrmContact);
    return record as CrmContact;
  },

  async updateContact(id: string, organizationId: string, updates: Partial<CrmContact>): Promise<CrmContact> {
    this.assertWritable();
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_contacts')
        // supabase typed via any
        .update({ ...updates, updated_at: now() })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();
      if (error) throw new Error(`crm_contacts: ${error.message}`);
      return data as CrmContact;
    }
    const store = mem();
    const idx = store.contacts.findIndex((c) => c.id === id && c.organization_id === organizationId);
    if (idx < 0) throw new Error('CONTACT_NOT_FOUND');
    store.contacts[idx] = { ...store.contacts[idx], ...updates, updated_at: now() };
    return store.contacts[idx];
  },

  // ---------- Leads ----------
  async listLeads(organizationId: string, status?: string): Promise<CrmLead[]> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      let q = supabaseAdmin.from('crm_leads').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }).limit(300);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw new Error(`crm_leads: ${error.message}`);
      return (data ?? []) as CrmLead[];
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem().leads.filter((l) => l.organization_id === organizationId && (!status || l.status === status)).slice(0, 300);
  },

  async getLead(id: string, organizationId: string): Promise<CrmLead | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('crm_leads').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
      if (error) throw new Error(`crm_leads: ${error.message}`);
      return (data as CrmLead | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().leads.find((l) => l.id === id && l.organization_id === organizationId);
  },

  async findLeadByExternal(organizationId: string, externalSource: string, externalId: string): Promise<CrmLead | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_leads')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('external_source', externalSource)
        .eq('external_id', externalId)
        .maybeSingle();
      if (error) throw new Error(`crm_leads: ${error.message}`);
      return (data as CrmLead | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().leads.find((l) => l.organization_id === organizationId && l.external_source === externalSource && l.external_id === externalId);
  },

  async createLead(input: Omit<CrmLead, 'id' | 'created_at' | 'updated_at'>): Promise<CrmLead> {
    this.assertWritable();
    const record = { ...input, id: uid(), created_at: now(), updated_at: now() };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        // supabase typed via any
        .from('crm_leads').insert(record).select().single();
      if (error) {
        if (error.code === '23505') throw new Error('LEAD_DUPLICATE_EXTERNAL');
        throw new Error(`crm_leads: ${error.message}`);
      }
      return data as CrmLead;
    }
    const dup = mem().leads.find(
      (l) => l.organization_id === record.organization_id && l.external_source && l.external_source === record.external_source && l.external_id === record.external_id,
    );
    if (dup && record.external_source && record.external_id) throw new Error('LEAD_DUPLICATE_EXTERNAL');
    mem().leads.unshift(record as CrmLead);
    return record as CrmLead;
  },

  async updateLead(id: string, organizationId: string, updates: Partial<CrmLead>): Promise<CrmLead> {
    this.assertWritable();
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_leads')
        // supabase typed via any
        .update({ ...updates, updated_at: now() })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();
      if (error) throw new Error(`crm_leads: ${error.message}`);
      return data as CrmLead;
    }
    const store = mem();
    const idx = store.leads.findIndex((l) => l.id === id && l.organization_id === organizationId);
    if (idx < 0) throw new Error('LEAD_NOT_FOUND');
    store.leads[idx] = { ...store.leads[idx], ...updates, updated_at: now() };
    return store.leads[idx];
  },

  // ---------- Opportunities ----------
  async listOpportunities(organizationId: string, stage?: string): Promise<CrmOpportunity[]> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      let q = supabaseAdmin.from('crm_opportunities').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }).limit(300);
      if (stage) q = q.eq('stage', stage);
      const { data, error } = await q;
      if (error) throw new Error(`crm_opportunities: ${error.message}`);
      return (data ?? []) as CrmOpportunity[];
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem().opportunities.filter((o) => o.organization_id === organizationId && (!stage || o.stage === stage)).slice(0, 300);
  },

  async getOpportunity(id: string, organizationId: string): Promise<CrmOpportunity | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('crm_opportunities').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
      if (error) throw new Error(`crm_opportunities: ${error.message}`);
      return (data as CrmOpportunity | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().opportunities.find((o) => o.id === id && o.organization_id === organizationId);
  },

  async listOpportunitiesByLead(organizationId: string, leadId: string): Promise<CrmOpportunity[]> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('crm_opportunities').select('*').eq('organization_id', organizationId).eq('lead_id', leadId).order('created_at', { ascending: false });
      if (error) throw new Error(`crm_opportunities: ${error.message}`);
      return (data ?? []) as CrmOpportunity[];
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem().opportunities.filter((o) => o.organization_id === organizationId && o.lead_id === leadId);
  },

  async createOpportunity(input: Omit<CrmOpportunity, 'id' | 'created_at' | 'updated_at'>): Promise<CrmOpportunity> {
    this.assertWritable();
    const record = { ...input, id: uid(), created_at: now(), updated_at: now() };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      return sb<CrmOpportunity>('crm_opportunities', (c) =>
        // supabase typed via any
        c.from('crm_opportunities').insert(record).select().single() as never,
      );
    }
    mem().opportunities.unshift(record as CrmOpportunity);
    return record as CrmOpportunity;
  },

  async updateOpportunity(id: string, organizationId: string, updates: Partial<CrmOpportunity>): Promise<CrmOpportunity> {
    this.assertWritable();
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_opportunities')
        // supabase typed via any
        .update({ ...updates, updated_at: now() })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();
      if (error) throw new Error(`crm_opportunities: ${error.message}`);
      return data as CrmOpportunity;
    }
    const store = mem();
    const idx = store.opportunities.findIndex((o) => o.id === id && o.organization_id === organizationId);
    if (idx < 0) throw new Error('OPPORTUNITY_NOT_FOUND');
    store.opportunities[idx] = { ...store.opportunities[idx], ...updates, updated_at: now() };
    return store.opportunities[idx];
  },

  // ---------- Tasks ----------
  async listTasks(organizationId: string, status?: string): Promise<CrmTask[]> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      let q = supabaseAdmin.from('crm_tasks').select('*').eq('organization_id', organizationId).order('due_at', { ascending: true }).limit(300);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw new Error(`crm_tasks: ${error.message}`);
      return (data ?? []) as CrmTask[];
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem().tasks.filter((t) => t.organization_id === organizationId && (!status || t.status === status)).slice(0, 300);
  },

  async getTask(id: string, organizationId: string): Promise<CrmTask | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('crm_tasks').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
      if (error) throw new Error(`crm_tasks: ${error.message}`);
      return (data as CrmTask | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().tasks.find((t) => t.id === id && t.organization_id === organizationId);
  },

  async findTaskByExternal(organizationId: string, externalKey: string): Promise<CrmTask | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('crm_tasks').select('*').eq('organization_id', organizationId).eq('external_key', externalKey).maybeSingle();
      if (error) throw new Error(`crm_tasks: ${error.message}`);
      return (data as CrmTask | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().tasks.find((t) => t.organization_id === organizationId && t.external_key === externalKey);
  },

  async createTask(input: Omit<CrmTask, 'id' | 'created_at' | 'updated_at'>): Promise<CrmTask> {
    this.assertWritable();
    const record = { ...input, id: uid(), created_at: now(), updated_at: now() };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        // supabase typed via any
        .from('crm_tasks').insert(record).select().single();
      if (error) {
        if (error.code === '23505') throw new Error('TASK_DUPLICATE_EXTERNAL');
        throw new Error(`crm_tasks: ${error.message}`);
      }
      return data as CrmTask;
    }
    if (record.external_key && mem().tasks.some((t) => t.organization_id === record.organization_id && t.external_key === record.external_key)) {
      throw new Error('TASK_DUPLICATE_EXTERNAL');
    }
    mem().tasks.unshift(record as CrmTask);
    return record as CrmTask;
  },

  async updateTask(id: string, organizationId: string, updates: Partial<CrmTask>): Promise<CrmTask> {
    this.assertWritable();
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_tasks')
        // supabase typed via any
        .update({ ...updates, updated_at: now() })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();
      if (error) throw new Error(`crm_tasks: ${error.message}`);
      return data as CrmTask;
    }
    const store = mem();
    const idx = store.tasks.findIndex((t) => t.id === id && t.organization_id === organizationId);
    if (idx < 0) throw new Error('TASK_NOT_FOUND');
    store.tasks[idx] = { ...store.tasks[idx], ...updates, updated_at: now() };
    return store.tasks[idx];
  },

  // ---------- Activities ----------
  async listActivities(organizationId: string, filter: { lead_id?: string; opportunity_id?: string; conversation_id?: string; company_id?: string } = {}): Promise<CrmActivity[]> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      let q = supabaseAdmin.from('crm_activities').select('*').eq('organization_id', organizationId).order('occurred_at', { ascending: false }).limit(300);
      if (filter.lead_id) q = q.eq('lead_id', filter.lead_id);
      if (filter.opportunity_id) q = q.eq('opportunity_id', filter.opportunity_id);
      if (filter.conversation_id) q = q.eq('conversation_id', filter.conversation_id);
      if (filter.company_id) q = q.eq('company_id', filter.company_id);
      const { data, error } = await q;
      if (error) throw new Error(`crm_activities: ${error.message}`);
      return (data ?? []) as CrmActivity[];
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem()
      .activities.filter(
        (a) =>
          a.organization_id === organizationId &&
          (!filter.lead_id || a.lead_id === filter.lead_id) &&
          (!filter.opportunity_id || a.opportunity_id === filter.opportunity_id) &&
          (!filter.conversation_id || a.conversation_id === filter.conversation_id) &&
          (!filter.company_id || a.company_id === filter.company_id),
      )
      .slice(0, 300);
  },

  async createActivity(input: Omit<CrmActivity, 'id' | 'created_at'>): Promise<CrmActivity> {
    this.assertWritable();
    const record = { ...input, id: uid(), created_at: now() };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        // supabase typed via any
        .from('crm_activities').insert(record).select().single();
      if (error) {
        if (error.code === '23505') {
          // Idempotente: devolver existente por external_key si se reintenta.
          if (record.external_key) {
            const { data: existing } = await supabaseAdmin
              .from('crm_activities')
              .select('*')
              .eq('organization_id', record.organization_id)
              .eq('external_key', record.external_key)
              .maybeSingle();
            if (existing) return existing as CrmActivity;
          }
          throw new Error('ACTIVITY_DUPLICATE_EXTERNAL');
        }
        throw new Error(`crm_activities: ${error.message}`);
      }
      return data as CrmActivity;
    }
    if (record.external_key && mem().activities.some((a) => a.organization_id === record.organization_id && a.external_key === record.external_key)) {
      return mem().activities.find((a) => a.organization_id === record.organization_id && a.external_key === record.external_key)!;
    }
    mem().activities.unshift(record as CrmActivity);
    return record as CrmActivity;
  },

  // ---------- Conversations ----------
  async listConversations(organizationId: string, status?: string): Promise<CrmConversation[]> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      let q = supabaseAdmin.from('crm_conversations').select('*').eq('organization_id', organizationId).order('last_message_at', { ascending: false }).limit(200);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw new Error(`crm_conversations: ${error.message}`);
      return (data ?? []) as CrmConversation[];
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem().conversations.filter((c) => c.organization_id === organizationId && (!status || c.status === status)).slice(0, 200);
  },

  async getConversation(id: string, organizationId: string): Promise<CrmConversation | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('crm_conversations').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle();
      if (error) throw new Error(`crm_conversations: ${error.message}`);
      return (data as CrmConversation | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().conversations.find((c) => c.id === id && c.organization_id === organizationId);
  },

  async findConversationByExternal(organizationId: string, channel: string, externalId: string): Promise<CrmConversation | undefined> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('channel', channel)
        .eq('external_conversation_id', externalId)
        .maybeSingle();
      if (error) throw new Error(`crm_conversations: ${error.message}`);
      return (data as CrmConversation | null) ?? undefined;
    }
    if (mode() === 'NOT_CONFIGURED') return undefined;
    return mem().conversations.find((c) => c.organization_id === organizationId && c.channel === channel && c.external_conversation_id === externalId);
  },

  async createConversation(input: Omit<CrmConversation, 'id' | 'created_at' | 'updated_at'>): Promise<CrmConversation> {
    this.assertWritable();
    const record = { ...input, id: uid(), created_at: now(), updated_at: now() };
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        // supabase typed via any
        .from('crm_conversations').insert(record).select().single();
      if (error) {
        if (error.code === '23505') throw new Error('CONVERSATION_DUPLICATE');
        throw new Error(`crm_conversations: ${error.message}`);
      }
      return data as CrmConversation;
    }
    const dup = mem().conversations.find(
      (c) => c.organization_id === record.organization_id && c.channel === record.channel && c.external_conversation_id === record.external_conversation_id,
    );
    if (dup) throw new Error('CONVERSATION_DUPLICATE');
    mem().conversations.unshift(record as CrmConversation);
    return record as CrmConversation;
  },

  async updateConversation(id: string, organizationId: string, updates: Partial<CrmConversation>): Promise<CrmConversation> {
    this.assertWritable();
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_conversations')
        // supabase typed via any
        .update({ ...updates, updated_at: now() })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();
      if (error) throw new Error(`crm_conversations: ${error.message}`);
      return data as CrmConversation;
    }
    const store = mem();
    const idx = store.conversations.findIndex((c) => c.id === id && c.organization_id === organizationId);
    if (idx < 0) throw new Error('CONVERSATION_NOT_FOUND');
    store.conversations[idx] = { ...store.conversations[idx], ...updates, updated_at: now() };
    return store.conversations[idx];
  },

  // ---------- Customer purchases ----------
  async listPurchases(organizationId: string, companyId?: string, limit = 5000): Promise<CustomerPurchase[]> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      let q = supabaseAdmin
        .from('crm_customer_purchases')
        .select('*')
        .eq('organization_id', organizationId)
        .order('purchase_date', { ascending: false })
        .limit(limit);
      if (companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) throw new Error(`crm_customer_purchases: ${error.message}`);
      return (data ?? []) as CustomerPurchase[];
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem()
      .purchases.filter((p) => p.organization_id === organizationId && (!companyId || p.company_id === companyId))
      .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))
      .slice(0, limit);
  },

  /** Inserta idempotente: doc+línea o fingerprint. Retorna {purchase, duplicate}. */
  async insertPurchaseIdempotent(
    input: Omit<CustomerPurchase, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<{ purchase: CustomerPurchase; duplicate: boolean }> {
    this.assertWritable();
    mustOrg(input.organization_id);
    const record = { ...input, id: uid(), created_at: now(), updated_at: now() };
    const isDoc = Boolean(record.external_document_id && record.line_number != null);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        // supabase typed via any
        .from('crm_customer_purchases').insert(record).select().single();
      if (error) {
        if (error.code === '23505') {
          let q = supabaseAdmin.from('crm_customer_purchases').select('*').eq('organization_id', record.organization_id);
          q = isDoc
            ? q.eq('external_document_id', record.external_document_id).eq('line_number', record.line_number)
            : q.eq('fingerprint', record.fingerprint);
          const { data: existing } = await q.maybeSingle();
          if (existing) return { purchase: existing as CustomerPurchase, duplicate: true };
          throw new Error('PURCHASE_DUPLICATE');
        }
        throw new Error(`crm_customer_purchases: ${error.message}`);
      }
      return { purchase: data as CustomerPurchase, duplicate: false };
    }
    const dup = mem().purchases.find((p) =>
      p.organization_id === record.organization_id &&
      (isDoc
        ? p.external_document_id === record.external_document_id && p.line_number === record.line_number
        : p.fingerprint != null && p.fingerprint === record.fingerprint),
    );
    if (dup) return { purchase: dup, duplicate: true };
    mem().purchases.unshift(record as CustomerPurchase);
    return { purchase: record as CustomerPurchase, duplicate: false };
  },

  // ---------- Import aliases ----------
  async listCustomerAliases(organizationId: string): Promise<Array<{ alias_normalized: string; company_id: string }>> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_customer_aliases')
        .select('alias_normalized, company_id')
        .eq('organization_id', organizationId);
      if (error) throw new Error(`crm_customer_aliases: ${error.message}`);
      return (data ?? []) as Array<{ alias_normalized: string; company_id: string }>;
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem().customerAliases.filter((a) => a.organization_id === organizationId);
  },

  async saveCustomerAlias(organizationId: string, alias_normalized: string, company_id: string): Promise<void> {
    this.assertWritable();
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { error } = await supabaseAdmin
        // supabase typed via any
        .from('crm_customer_aliases')
        .upsert({ organization_id: organizationId, alias_normalized, company_id }, { onConflict: 'organization_id,alias_normalized' });
      if (error) throw new Error(`crm_customer_aliases: ${error.message}`);
      return;
    }
    const store = mem();
    if (!store.customerAliases.some((a) => a.organization_id === organizationId && a.alias_normalized === alias_normalized)) {
      store.customerAliases.push({ organization_id: organizationId, alias_normalized, company_id });
    }
  },

  async listProductAliases(organizationId: string): Promise<Array<{ alias_normalized: string; sku: string }>> {
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('crm_product_aliases')
        .select('alias_normalized, sku')
        .eq('organization_id', organizationId);
      if (error) throw new Error(`crm_product_aliases: ${error.message}`);
      return (data ?? []) as Array<{ alias_normalized: string; sku: string }>;
    }
    if (mode() === 'NOT_CONFIGURED') return [];
    return mem().productAliases.filter((a) => a.organization_id === organizationId);
  },

  async saveProductAlias(organizationId: string, alias_normalized: string, sku: string): Promise<void> {
    this.assertWritable();
    mustOrg(organizationId);
    if (mode() === 'SUPABASE' && supabaseAdmin) {
      const { error } = await supabaseAdmin
        // supabase typed via any
        .from('crm_product_aliases')
        .upsert({ organization_id: organizationId, alias_normalized, sku }, { onConflict: 'organization_id,alias_normalized' });
      if (error) throw new Error(`crm_product_aliases: ${error.message}`);
      return;
    }
    const store = mem();
    if (!store.productAliases.some((a) => a.organization_id === organizationId && a.alias_normalized === alias_normalized)) {
      store.productAliases.push({ organization_id: organizationId, alias_normalized, sku });
    }
  },
};
