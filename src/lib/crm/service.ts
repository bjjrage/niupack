// CRM Service: reglas de negocio, idempotencia, autoridad de campos, transiciones, timeline.
// NIUPACKBOT debe usar exclusivamente este servicio. Prohibido `supabase.from('crm_*')` fuera del repository.

import { crmRepository } from './repository';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/db/supabase';
import type {
  ActivityType,
  CrmLead,
  CrmOpportunity,
  Lead360,
  PipelineStage,
  Qualification,
} from './types';
import { isBotStageTransitionAllowed } from './types';

function now(): string {
  return new Date().toISOString();
}

function clean<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function rankQualification(q?: Qualification | null): number {
  if (q === 'HIGH') return 3;
  if (q === 'MEDIUM') return 2;
  if (q === 'LOW') return 1;
  return 0;
}

// ---------- Cross-tenant reference validation (server-side, supabaseAdmin bypassa RLS) ----------
// Toda FK externa debe pertenecer al mismo organizationId. Si no es visible en el tenant
// pero existe en otro, se rechaza con CROSS_TENANT_REFERENCE (no se filtra existencia).

const profileOrgBinding = new Map<string, string>();

export function __resetProfileBindings(): void {
  profileOrgBinding.clear();
}

async function assertProfileInOrg(organizationId: string, profileId: string | null | undefined): Promise<void> {
  if (!profileId) return;
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('profiles').select('id, organization_id').eq('id', profileId).maybeSingle();
    if (error || !data || (data as { organization_id: string }).organization_id !== organizationId) {
      throw new Error('CROSS_TENANT_REFERENCE');
    }
    return;
  }
  const bound = profileOrgBinding.get(profileId);
  if (bound && bound !== organizationId) throw new Error('CROSS_TENANT_REFERENCE');
  if (!bound) profileOrgBinding.set(profileId, organizationId);
}

async function existsInOtherOrg(kind: 'company' | 'contact' | 'lead' | 'opportunity' | 'conversation' | 'task', id: string, organizationId: string): Promise<boolean> {
  // MEMORY_FALLBACK: revisar store global sin filtro org.
  const store = (global as unknown as { __niu_crm_store?: { companies: Array<{ id: string; organization_id: string }>; contacts: Array<{ id: string; organization_id: string }>; leads: Array<{ id: string; organization_id: string }>; opportunities: Array<{ id: string; organization_id: string }>; conversations: Array<{ id: string; organization_id: string }>; tasks: Array<{ id: string; organization_id: string }> } }).__niu_crm_store;
  if (store) {
    const lists: Record<string, Array<{ id: string; organization_id: string }> | undefined> = {
      company: store.companies,
      contact: store.contacts,
      lead: store.leads,
      opportunity: store.opportunities,
      conversation: store.conversations,
      task: store.tasks,
    };
    const list = lists[kind];
    if (list?.some((e) => e.id === id && e.organization_id !== organizationId)) return true;
  }
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const tables: Record<string, string> = {
      company: 'crm_companies',
      contact: 'crm_contacts',
      lead: 'crm_leads',
      opportunity: 'crm_opportunities',
      conversation: 'crm_conversations',
      task: 'crm_tasks',
    };
    try {
      const { data } = await supabaseAdmin.from(tables[kind]).select('id, organization_id').eq('id', id).maybeSingle();
      const row = data as { organization_id: string } | null;
      if (row && row.organization_id !== organizationId) return true;
    } catch {
      // Si falla la verificación, no bloquear por oracle; el NOT_FOUND posterior ya rechaza.
    }
  }
  return false;
}

async function assertCompanyInOrg(organizationId: string, companyId: string | null | undefined): Promise<void> {
  if (!companyId) return;
  const found = await crmRepository.getCompany(companyId, organizationId);
  if (found) return;
  if (await existsInOtherOrg('company', companyId, organizationId)) throw new Error('CROSS_TENANT_REFERENCE');
  throw new Error('COMPANY_NOT_FOUND');
}

async function assertContactInOrg(organizationId: string, contactId: string | null | undefined): Promise<void> {
  if (!contactId) return;
  const found = await crmRepository.getContact(contactId, organizationId);
  if (found) return;
  if (await existsInOtherOrg('contact', contactId, organizationId)) throw new Error('CROSS_TENANT_REFERENCE');
  throw new Error('CONTACT_NOT_FOUND');
}

async function assertLeadInOrg(organizationId: string, leadId: string | null | undefined): Promise<void> {
  if (!leadId) return;
  const found = await crmRepository.getLead(leadId, organizationId);
  if (found) return;
  if (await existsInOtherOrg('lead', leadId, organizationId)) throw new Error('CROSS_TENANT_REFERENCE');
  throw new Error('LEAD_NOT_FOUND');
}

async function assertOpportunityInOrg(organizationId: string, opportunityId: string | null | undefined): Promise<void> {
  if (!opportunityId) return;
  const found = await crmRepository.getOpportunity(opportunityId, organizationId);
  if (found) return;
  if (await existsInOtherOrg('opportunity', opportunityId, organizationId)) throw new Error('CROSS_TENANT_REFERENCE');
  throw new Error('OPPORTUNITY_NOT_FOUND');
}

async function assertConversationInOrg(organizationId: string, conversationId: string | null | undefined): Promise<void> {
  if (!conversationId) return;
  const found = await crmRepository.getConversation(conversationId, organizationId);
  if (found) return;
  if (await existsInOtherOrg('conversation', conversationId, organizationId)) throw new Error('CROSS_TENANT_REFERENCE');
  throw new Error('CONVERSATION_NOT_FOUND');
}

async function assertTaskInOrg(organizationId: string, taskId: string): Promise<void> {
  const found = await crmRepository.getTask(taskId, organizationId);
  if (found) return;
  if (await existsInOtherOrg('task', taskId, organizationId)) throw new Error('CROSS_TENANT_REFERENCE');
  throw new Error('TASK_NOT_FOUND');
}

export const crmService = {
  // ---------- Companies / Contacts ----------
  async createOrUpdateCompany(
    organizationId: string,
    input: { name: string; country_code?: string | null; phone?: string | null; email?: string | null; source?: string | null },
    actorProfileId?: string,
  ) {
    await assertProfileInOrg(organizationId, actorProfileId);
    const existing = (await crmRepository.listCompanies(organizationId)).find(
      (c) => c.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (existing) {
      return crmRepository.updateCompany(
        existing.id,
        organizationId,
        clean({ phone: input.phone ?? undefined, email: input.email ?? undefined, country_code: input.country_code ?? undefined }),
      );
    }
    return crmRepository.createCompany({
      organization_id: organizationId,
      name: input.name,
      country_code: input.country_code ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: input.source ?? null,
      legal_name: null,
      tax_id: null,
      city: null,
      website: null,
      notes: null,
      owner_profile_id: actorProfileId ?? null,
    });
  },

  async createOrUpdateContact(
    organizationId: string,
    input: {
      full_name: string;
      whatsapp_phone?: string | null;
      phone?: string | null;
      country_code?: string | null;
      language?: string | null;
      source?: string | null;
      company_id?: string | null;
    },
    actorProfileId?: string,
  ) {
    await assertCompanyInOrg(organizationId, input.company_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    if (input.whatsapp_phone) {
      const existing = await crmRepository.findContactByWhatsapp(organizationId, input.whatsapp_phone);
      if (existing) {
        return crmRepository.updateContact(
          existing.id,
          organizationId,
          clean({
            full_name: input.full_name !== existing.full_name ? input.full_name : undefined,
            company_id: input.company_id ?? undefined,
            country_code: input.country_code ?? undefined,
            language: input.language ?? undefined,
          }) as never,
        );
      }
    }
    return crmRepository.createContact({
      organization_id: organizationId,
      company_id: input.company_id ?? null,
      full_name: input.full_name,
      job_title: null,
      phone: input.phone ?? input.whatsapp_phone ?? null,
      whatsapp_phone: input.whatsapp_phone ?? null,
      email: null,
      language: input.language ?? null,
      country_code: input.country_code ?? null,
      source: input.source ?? null,
      owner_profile_id: actorProfileId ?? null,
    });
  },

  // ---------- Leads ----------
  listLeads: (organizationId: string, status?: string) => crmRepository.listLeads(organizationId, status),
  getLead: (id: string, organizationId: string) => crmRepository.getLead(id, organizationId),

  async updateLead(id: string, organizationId: string, updates: Partial<CrmLead>, actorProfileId?: string) {
    await assertLeadInOrg(organizationId, id);
    await assertCompanyInOrg(organizationId, updates.company_id);
    await assertContactInOrg(organizationId, updates.contact_id);
    await assertProfileInOrg(organizationId, updates.owner_profile_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    const updated = await crmRepository.updateLead(id, organizationId, clean(updates as Record<string, unknown>) as Partial<CrmLead>);
    await crmRepository.createActivity({
      organization_id: organizationId,
      lead_id: id,
      company_id: updated.company_id ?? null,
      contact_id: updated.contact_id ?? null,
      conversation_id: null,
      opportunity_id: null,
      type: 'LEAD_UPDATED',
      source: 'CRM_UI',
      actor_profile_id: actorProfileId ?? null,
      title: 'Lead actualizado',
      body: null,
      metadata: { updates: Object.keys(updates) },
      external_key: null,
      occurred_at: now(),
    });
    return updated;
  },

  /**
   * Idempotente por (organization_id, external_source, external_id).
   * Autoridad BOT: solo clues comerciales + intent + qualification (nunca downgrade) + last touch.
   * Autoridad HUMAN/CRM: owner, stage/status final, valor, next_action, notas, won/lost.
   */
  async upsertInboundLead(
    organizationId: string,
    input: {
      external_source: string;
      external_id: string;
      source_channel?: string | null;
      contact_name?: string | null;
      whatsapp_phone?: string | null;
      country_code?: string | null;
      language?: string | null;
      product_interest?: string | null;
      capacity?: string | null;
      material?: string | null;
      printing?: string | null;
      estimated_volume?: number | null;
      volume_period?: CrmLead['volume_period'];
      destination_city?: string | null;
      destination_state?: string | null;
      destination_country?: string | null;
      intent?: CrmLead['intent'];
      qualification?: Qualification | null;
    },
  ): Promise<{ lead: CrmLead; created: boolean }> {
    const existing = await crmRepository.findLeadByExternal(organizationId, input.external_source, input.external_id);
    if (!existing) {
      let contactId: string | null = null;
      if (input.whatsapp_phone || input.contact_name) {
        const contact = await this.createOrUpdateContact(organizationId, {
          full_name: input.contact_name || input.whatsapp_phone || 'Contacto WhatsApp',
          whatsapp_phone: input.whatsapp_phone ?? null,
          phone: input.whatsapp_phone ?? null,
          country_code: input.country_code ?? null,
          language: input.language ?? null,
          source: input.external_source,
        });
        contactId = contact.id;
      }
      const lead = await crmRepository.createLead({
        organization_id: organizationId,
        company_id: null,
        contact_id: contactId,
        source: input.external_source,
        source_channel: input.source_channel ?? 'WHATSAPP',
        external_source: input.external_source,
        external_id: input.external_id,
        country_code: input.country_code ?? null,
        product_interest: input.product_interest ?? null,
        capacity: input.capacity ?? null,
        material: input.material ?? null,
        printing: input.printing ?? null,
        estimated_volume: input.estimated_volume ?? null,
        volume_period: input.volume_period ?? null,
        destination_city: input.destination_city ?? null,
        destination_state: input.destination_state ?? null,
        destination_country: input.destination_country ?? null,
        intent: input.intent ?? 'OTHER',
        qualification: input.qualification ?? 'LOW',
        status: 'NUEVO',
        owner_profile_id: null,
        next_action: null,
        next_action_at: null,
      });
      await crmRepository.createActivity({
        organization_id: organizationId,
        lead_id: lead.id,
        company_id: null,
        contact_id: contactId,
        conversation_id: null,
        opportunity_id: null,
        type: 'LEAD_CREATED',
        source: input.external_source,
        actor_profile_id: null,
        title: 'Lead creado por NIUPACKBOT',
        body: null,
        metadata: { external_id: input.external_id, intent: input.intent ?? 'OTHER', qualification: input.qualification ?? 'LOW' },
        external_key: `lead-created:${input.external_source}:${input.external_id}`,
        occurred_at: now(),
      });
      return { lead, created: true };
    }

    // Merge bot-safe: no pisar owner / next_action / status humano.
    const patch: Partial<CrmLead> = {};
    if (input.product_interest && !existing.product_interest) patch.product_interest = input.product_interest;
    if (input.capacity && !existing.capacity) patch.capacity = input.capacity;
    if (input.material && !existing.material) patch.material = input.material;
    if (input.printing && !existing.printing) patch.printing = input.printing;
    if (input.estimated_volume && !existing.estimated_volume) {
      patch.estimated_volume = input.estimated_volume;
      patch.volume_period = input.volume_period ?? existing.volume_period;
    }
    if (input.destination_city && !existing.destination_city) patch.destination_city = input.destination_city;
    if (input.destination_state && !existing.destination_state) patch.destination_state = input.destination_state;
    if (input.destination_country && !existing.destination_country) patch.destination_country = input.destination_country;
    if (input.country_code && !existing.country_code) patch.country_code = input.country_code;
    if (input.intent && existing.intent !== input.intent) patch.intent = input.intent;
    // Qualification: solo upgrade (LOW->MEDIUM->HIGH), nunca downgrade por sync.
    if (input.qualification && rankQualification(input.qualification) > rankQualification(existing.qualification)) {
      patch.qualification = input.qualification;
    }
    // Vincular contacto si faltaba.
    if (!existing.contact_id && (input.whatsapp_phone || input.contact_name)) {
      const contact = await this.createOrUpdateContact(organizationId, {
        full_name: input.contact_name || input.whatsapp_phone || 'Contacto WhatsApp',
        whatsapp_phone: input.whatsapp_phone ?? null,
        phone: input.whatsapp_phone ?? null,
        country_code: input.country_code ?? null,
        language: input.language ?? null,
        source: input.external_source,
      });
      patch.contact_id = contact.id;
    }

    if (Object.keys(patch).length === 0) return { lead: existing, created: false };
    const lead = await crmRepository.updateLead(existing.id, organizationId, patch);
    await crmRepository.createActivity({
      organization_id: organizationId,
      lead_id: lead.id,
      company_id: lead.company_id ?? null,
      contact_id: lead.contact_id ?? null,
      conversation_id: null,
      opportunity_id: null,
      type: 'LEAD_UPDATED',
      source: input.external_source,
      actor_profile_id: null,
      title: 'Lead enriquecido por NIUPACKBOT',
      body: null,
      metadata: { patch: Object.keys(patch) },
      external_key: null,
      occurred_at: now(),
    });
    return { lead, created: false };
  },

  // ---------- Opportunities ----------
  listOpportunities: (organizationId: string, stage?: string) => crmRepository.listOpportunities(organizationId, stage),
  getOpportunity: (id: string, organizationId: string) => crmRepository.getOpportunity(id, organizationId),

  async createOpportunityFromLead(
    organizationId: string,
    leadId: string,
    overrides: { title?: string; stage?: PipelineStage; owner_profile_id?: string | null } = {},
    actorProfileId?: string,
  ): Promise<CrmOpportunity> {
    await assertLeadInOrg(organizationId, leadId);
    await assertProfileInOrg(organizationId, overrides.owner_profile_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    const lead = await crmRepository.getLead(leadId, organizationId);
    if (!lead) throw new Error('LEAD_NOT_FOUND');
    const existing = await crmRepository.listOpportunitiesByLead(organizationId, leadId);
    const open = existing.find((o) => o.stage !== 'GANADO' && o.stage !== 'PERDIDO');
    if (open) return open;

    const title =
      overrides.title ||
      [lead.product_interest || 'Oportunidad', lead.capacity || '', lead.destination_city ? `· ${lead.destination_city}` : '']
        .join(' ')
        .trim()
        .slice(0, 240) ||
      `Oportunidad ${lead.id.slice(0, 8)}`;

    const opp = await crmRepository.createOpportunity({
      organization_id: organizationId,
      company_id: lead.company_id ?? null,
      contact_id: lead.contact_id ?? null,
      lead_id: lead.id,
      title,
      stage: overrides.stage ?? 'NUEVO',
      product_interest: lead.product_interest ?? null,
      sku: null,
      capacity: lead.capacity ?? null,
      material: lead.material ?? null,
      printing: lead.printing ?? null,
      estimated_volume: lead.estimated_volume ?? null,
      volume_period: lead.volume_period ?? null,
      estimated_value: null,
      currency: 'USD',
      destination_city: lead.destination_city ?? null,
      destination_state: lead.destination_state ?? null,
      destination_country: lead.destination_country ?? null,
      owner_profile_id: overrides.owner_profile_id ?? lead.owner_profile_id ?? actorProfileId ?? null,
      next_action: null,
      next_action_at: null,
      won_at: null,
      lost_at: null,
      lost_reason: null,
    });
    await crmRepository.createActivity({
      organization_id: organizationId,
      lead_id: lead.id,
      opportunity_id: opp.id,
      company_id: lead.company_id ?? null,
      contact_id: lead.contact_id ?? null,
      conversation_id: null,
      type: 'STAGE_CHANGED',
      source: 'CRM',
      actor_profile_id: actorProfileId ?? null,
      title: `Oportunidad creada en ${opp.stage}`,
      body: null,
      metadata: { from_lead: lead.id },
      external_key: null,
      occurred_at: now(),
    });
    return opp;
  },

  async createLeadManual(
    organizationId: string,
    input: Omit<CrmLead, 'id' | 'organization_id' | 'created_at' | 'updated_at'>,
    actorProfileId?: string,
  ): Promise<CrmLead> {
    await assertCompanyInOrg(organizationId, input.company_id);
    await assertContactInOrg(organizationId, input.contact_id);
    await assertProfileInOrg(organizationId, input.owner_profile_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    const lead = await crmRepository.createLead({ ...input, organization_id: organizationId });
    await this.addActivity(organizationId, { lead_id: lead.id, type: 'LEAD_CREATED', source: 'CRM_UI', title: 'Lead creado manualmente' }, actorProfileId);
    return lead;
  },

  async createOpportunityManual(
    organizationId: string,
    input: Omit<CrmOpportunity, 'id' | 'organization_id' | 'created_at' | 'updated_at'>,
    actorProfileId?: string,
  ): Promise<CrmOpportunity> {
    await assertCompanyInOrg(organizationId, input.company_id);
    await assertContactInOrg(organizationId, input.contact_id);
    await assertLeadInOrg(organizationId, input.lead_id);
    await assertProfileInOrg(organizationId, input.owner_profile_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    return crmRepository.createOpportunity({ ...input, organization_id: organizationId });
  },

  async updateOpportunity(id: string, organizationId: string, updates: Partial<CrmOpportunity>, actorProfileId?: string): Promise<CrmOpportunity> {
    await assertOpportunityInOrg(organizationId, id);
    await assertCompanyInOrg(organizationId, updates.company_id);
    await assertContactInOrg(organizationId, updates.contact_id);
    await assertLeadInOrg(organizationId, updates.lead_id);
    await assertProfileInOrg(organizationId, updates.owner_profile_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    return crmRepository.updateOpportunity(id, organizationId, clean(updates as Record<string, unknown>) as Partial<CrmOpportunity>);
  },

  async createCompany(
    organizationId: string,
    input: Omit<import('./types').CrmCompany, 'id' | 'organization_id' | 'created_at' | 'updated_at'>,
    actorProfileId?: string,
  ) {
    await assertProfileInOrg(organizationId, input.owner_profile_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    return crmRepository.createCompany({ ...input, organization_id: organizationId });
  },

  async createContact(
    organizationId: string,
    input: Omit<import('./types').CrmContact, 'id' | 'organization_id' | 'created_at' | 'updated_at'>,
    actorProfileId?: string,
  ) {
    await assertCompanyInOrg(organizationId, input.company_id);
    await assertProfileInOrg(organizationId, input.owner_profile_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    return crmRepository.createContact({ ...input, organization_id: organizationId });
  },

  async changeOpportunityStage(
    organizationId: string,
    opportunityId: string,
    to: PipelineStage,
    opts: { actor?: 'BOT' | 'HUMAN'; actorProfileId?: string | null; lost_reason?: string | null } = {},
  ): Promise<CrmOpportunity> {
    const actor = opts.actor ?? 'HUMAN';
    await assertOpportunityInOrg(organizationId, opportunityId);
    await assertProfileInOrg(organizationId, opts.actorProfileId);
    const current = await crmRepository.getOpportunity(opportunityId, organizationId);
    if (!current) throw new Error('OPPORTUNITY_NOT_FOUND');
    if (actor === 'BOT' && !isBotStageTransitionAllowed(current.stage, to)) {
      // No retroceder ni cerrar por sync: se registra y se conserva el stage.
      await crmRepository.createActivity({
        organization_id: organizationId,
        lead_id: current.lead_id ?? null,
        opportunity_id: current.id,
        company_id: current.company_id ?? null,
        contact_id: current.contact_id ?? null,
        conversation_id: null,
        type: 'NOTE',
        source: 'NIUPACKBOT',
        actor_profile_id: null,
        title: `Transición BOT bloqueada: ${current.stage} → ${to}`,
        body: 'El bot sugirió retroceder o cerrar; se conserva el stage por autoridad CRM/HUMAN.',
        metadata: { from: current.stage, to, actor },
        external_key: null,
        occurred_at: now(),
      });
      return current;
    }
    const patch: Partial<CrmOpportunity> = { stage: to };
    if (to === 'GANADO') {
      patch.won_at = now();
      patch.lost_at = null;
      patch.lost_reason = null;
    }
    if (to === 'PERDIDO') {
      patch.lost_at = now();
      patch.won_at = null;
      patch.lost_reason = opts.lost_reason ?? null;
    }
    if (to !== 'GANADO' && to !== 'PERDIDO') {
      patch.won_at = null;
      patch.lost_at = null;
    }
    const updated = await crmRepository.updateOpportunity(opportunityId, organizationId, patch);
    const type: ActivityType = to === 'GANADO' ? 'WON' : to === 'PERDIDO' ? 'LOST' : 'STAGE_CHANGED';
    await crmRepository.createActivity({
      organization_id: organizationId,
      lead_id: updated.lead_id ?? null,
      opportunity_id: updated.id,
      company_id: updated.company_id ?? null,
      contact_id: updated.contact_id ?? null,
      conversation_id: null,
      type,
      source: actor === 'BOT' ? 'NIUPACKBOT' : 'CRM_UI',
      actor_profile_id: opts.actorProfileId ?? null,
      title: `${current.stage} → ${to}`,
      body: opts.lost_reason ?? null,
      metadata: { from: current.stage, to, actor },
      external_key: null,
      occurred_at: now(),
    });
    return updated;
  },

  // ---------- Tasks ----------
  listTasks: (organizationId: string, status?: string) => crmRepository.listTasks(organizationId, status),

  async createTask(
    organizationId: string,
    input: {
      title: string;
      description?: string | null;
      lead_id?: string | null;
      opportunity_id?: string | null;
      company_id?: string | null;
      assigned_to?: string | null;
      due_at?: string | null;
      priority?: CrmOpportunity extends never ? never : 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      source?: string | null;
      external_key?: string | null;
    },
    actorProfileId?: string,
  ) {
    await assertLeadInOrg(organizationId, input.lead_id);
    await assertOpportunityInOrg(organizationId, input.opportunity_id);
    await assertCompanyInOrg(organizationId, input.company_id);
    await assertProfileInOrg(organizationId, input.assigned_to);
    await assertProfileInOrg(organizationId, actorProfileId);
    if (input.external_key) {
      const existing = await crmRepository.findTaskByExternal(organizationId, input.external_key);
      if (existing) return existing;
    }
    const task = await crmRepository.createTask({
      organization_id: organizationId,
      lead_id: input.lead_id ?? null,
      opportunity_id: input.opportunity_id ?? null,
      company_id: input.company_id ?? null,
      title: input.title,
      description: input.description ?? null,
      assigned_to: input.assigned_to ?? null,
      status: 'PENDING',
      priority: input.priority ?? 'MEDIUM',
      due_at: input.due_at ?? null,
      completed_at: null,
      source: input.source ?? 'CRM',
      external_key: input.external_key ?? null,
    });
    await crmRepository.createActivity({
      organization_id: organizationId,
      lead_id: task.lead_id ?? null,
      opportunity_id: task.opportunity_id ?? null,
      company_id: task.company_id ?? null,
      contact_id: null,
      conversation_id: null,
      type: 'TASK_CREATED',
      source: input.source ?? 'CRM',
      actor_profile_id: actorProfileId ?? null,
      title: task.title,
      body: task.description ?? null,
      metadata: { task_id: task.id },
      external_key: input.external_key ? `task-created:${input.external_key}` : null,
      occurred_at: now(),
    });
    return task;
  },

  async updateTask(id: string, organizationId: string, updates: Partial<{ title: string; description: string | null; assigned_to: string | null; status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; due_at: string | null }>, actorProfileId?: string) {
    await assertTaskInOrg(organizationId, id);
    await assertProfileInOrg(organizationId, updates.assigned_to);
    await assertProfileInOrg(organizationId, actorProfileId);
    const task = await crmRepository.updateTask(id, organizationId, clean(updates as Record<string, unknown>) as never);
    if (updates.status === 'DONE') {
      await crmRepository.updateTask(id, organizationId, { completed_at: now() } as never);
      await crmRepository.createActivity({
        organization_id: organizationId,
        lead_id: task.lead_id ?? null,
        opportunity_id: task.opportunity_id ?? null,
        company_id: task.company_id ?? null,
        contact_id: null,
        conversation_id: null,
        type: 'TASK_COMPLETED',
        source: 'CRM',
        actor_profile_id: actorProfileId ?? null,
        title: task.title,
        body: null,
        metadata: { task_id: task.id },
        external_key: null,
        occurred_at: now(),
      });
    }
    return task;
  },

  completeTask(id: string, organizationId: string, actorProfileId?: string) {
    return this.updateTask(id, organizationId, { status: 'DONE' }, actorProfileId);
  },

  // ---------- Activities / Timeline ----------
  async addActivity(
    organizationId: string,
    input: {
      lead_id?: string | null;
      opportunity_id?: string | null;
      company_id?: string | null;
      contact_id?: string | null;
      conversation_id?: string | null;
      type: ActivityType;
      source?: string | null;
      title?: string | null;
      body?: string | null;
      metadata?: Record<string, unknown> | null;
      external_key?: string | null;
    },
    actorProfileId?: string,
  ) {
    await assertLeadInOrg(organizationId, input.lead_id);
    await assertOpportunityInOrg(organizationId, input.opportunity_id);
    await assertCompanyInOrg(organizationId, input.company_id);
    await assertContactInOrg(organizationId, input.contact_id);
    await assertConversationInOrg(organizationId, input.conversation_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    return crmRepository.createActivity({
      organization_id: organizationId,
      lead_id: input.lead_id ?? null,
      opportunity_id: input.opportunity_id ?? null,
      company_id: input.company_id ?? null,
      contact_id: input.contact_id ?? null,
      conversation_id: input.conversation_id ?? null,
      type: input.type,
      source: input.source ?? 'CRM',
      actor_profile_id: actorProfileId ?? null,
      title: input.title ?? null,
      body: input.body ?? null,
      metadata: input.metadata ?? {},
      external_key: input.external_key ?? null,
      occurred_at: now(),
    });
  },

  listActivities: (organizationId: string, filter?: { lead_id?: string; opportunity_id?: string; conversation_id?: string }) =>
    crmRepository.listActivities(organizationId, filter),

  // ---------- Lead 360 ----------
  async getLead360(organizationId: string, leadId: string): Promise<Lead360 | undefined> {
    const lead = await crmRepository.getLead(leadId, organizationId);
    if (!lead) return undefined;
    const [company, contact, opportunities, tasks, activities] = await Promise.all([
      lead.company_id ? crmRepository.getCompany(lead.company_id, organizationId) : Promise.resolve(undefined),
      lead.contact_id ? crmRepository.getContact(lead.contact_id, organizationId) : Promise.resolve(undefined),
      crmRepository.listOpportunitiesByLead(organizationId, leadId),
      crmRepository.listTasks(organizationId).then((all) => all.filter((t) => t.lead_id === leadId)),
      crmRepository.listActivities(organizationId, { lead_id: leadId }),
    ]);
    const conversations = await crmRepository.listConversations(organizationId);
    const conversation = conversations.find((c) => c.lead_id === leadId) ?? null;
    return {
      lead,
      company: company ?? null,
      contact: contact ?? null,
      opportunities,
      tasks,
      activities,
      conversation,
    };
  },

  // ---------- Handoff ----------
  async requestHumanHandoff(
    organizationId: string,
    input: { lead_id?: string | null; conversation_id: string; reason?: string | null; createTask?: boolean },
    actorProfileId?: string,
  ) {
    await assertConversationInOrg(organizationId, input.conversation_id);
    await assertLeadInOrg(organizationId, input.lead_id);
    await assertProfileInOrg(organizationId, actorProfileId);
    const conv = await crmRepository.getConversation(input.conversation_id, organizationId);
    if (!conv) throw new Error('CONVERSATION_NOT_FOUND');
    const updated =
      conv.control_mode === 'HUMAN'
        ? conv
        : await crmRepository.updateConversation(conv.id, organizationId, { control_mode: 'HUMAN' });
    await crmRepository.createActivity({
      organization_id: organizationId,
      lead_id: input.lead_id ?? conv.lead_id ?? null,
      opportunity_id: conv.opportunity_id ?? null,
      company_id: null,
      contact_id: conv.contact_id ?? null,
      conversation_id: conv.id,
      type: 'HUMAN_HANDOFF',
      source: 'NIUPACKBOT',
      actor_profile_id: actorProfileId ?? null,
      title: 'Handoff a humano solicitado',
      body: input.reason ?? 'El cliente pidió hablar con un humano.',
      metadata: { from: conv.control_mode, to: 'HUMAN' },
      external_key: `handoff:${conv.id}`,
      occurred_at: now(),
    });
    let task = null;
    if (input.createTask !== false && (input.lead_id || conv.lead_id)) {
      const key = `handoff:${conv.id}`;
      task = await this.createTask(
        organizationId,
        {
          title: 'Seguimiento humano solicitado por NIUPACKBOT',
          description: input.reason ?? 'Revisar conversación y continuar atención humana.',
          lead_id: input.lead_id ?? conv.lead_id ?? null,
          opportunity_id: conv.opportunity_id ?? null,
          source: 'NIUPACKBOT',
          external_key: key,
          priority: 'HIGH',
        },
        actorProfileId,
      );
    }
    return { conversation: updated, task };
  },
};
