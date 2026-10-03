-- CRM/BOT V1 perf: covering indexes FK-led para `unindexed_foreign_keys`.
-- PENDIENTE de aplicar live (única migration pendiente). Aditiva, sin DROP, sin datos.
-- Regla: la columna FK es LEADING COLUMN. `(organization_id, fk)` NO cubre la FK.
-- `idx_crm_contacts_company (company_id)` y `idx_bot_messages_conv (conversation_id, ...)`
-- ya existen en base y no se duplican.

-- crm_companies.owner_profile_id -> profiles(id)
CREATE INDEX IF NOT EXISTS idx_crm_companies_fk_owner ON public.crm_companies (owner_profile_id, organization_id);

-- crm_contacts.company_id ya cubierto por idx_crm_contacts_company (company_id). No duplicar.
-- crm_contacts.owner_profile_id -> profiles(id)
CREATE INDEX IF NOT EXISTS idx_crm_contacts_fk_owner ON public.crm_contacts (owner_profile_id, organization_id);

-- crm_leads FKs
CREATE INDEX IF NOT EXISTS idx_crm_leads_fk_company ON public.crm_leads (company_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_fk_contact ON public.crm_leads (contact_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_fk_owner ON public.crm_leads (owner_profile_id, organization_id);

-- crm_opportunities FKs
CREATE INDEX IF NOT EXISTS idx_crm_opps_fk_company ON public.crm_opportunities (company_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_fk_contact ON public.crm_opportunities (contact_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_fk_lead ON public.crm_opportunities (lead_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_fk_owner ON public.crm_opportunities (owner_profile_id, organization_id);

-- crm_tasks FKs
CREATE INDEX IF NOT EXISTS idx_crm_tasks_fk_lead ON public.crm_tasks (lead_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_fk_opp ON public.crm_tasks (opportunity_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_fk_company ON public.crm_tasks (company_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_fk_assignee ON public.crm_tasks (assigned_to, organization_id);

-- crm_activities FKs (con occurred_at para timeline por entidad)
CREATE INDEX IF NOT EXISTS idx_crm_activities_fk_lead ON public.crm_activities (lead_id, organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_fk_opp ON public.crm_activities (opportunity_id, organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_fk_company ON public.crm_activities (company_id, organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_fk_contact ON public.crm_activities (contact_id, organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_fk_conv ON public.crm_activities (conversation_id, organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_fk_actor ON public.crm_activities (actor_profile_id, organization_id, occurred_at DESC);

-- crm_conversations FKs
CREATE INDEX IF NOT EXISTS idx_crm_convs_fk_lead ON public.crm_conversations (lead_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_convs_fk_opp ON public.crm_conversations (opportunity_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_convs_fk_contact ON public.crm_conversations (contact_id, organization_id);

-- niupackbot_messages.conversation_id ya cubierto por idx_bot_messages_conv. No duplicar.

-- niupackbot_state.conversation_id es PK. organization_id solo para queries (ya existe idx_bot_state_org). Sin índice FK adicional.

-- niupackbot_events FKs (con created_at para timeline)
CREATE INDEX IF NOT EXISTS idx_bot_events_fk_conv ON public.niupackbot_events (conversation_id, organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_fk_lead ON public.niupackbot_events (lead_id, organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_fk_opp ON public.niupackbot_events (opportunity_id, organization_id, created_at DESC);
