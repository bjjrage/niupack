-- CRM V1 perf: índices FK/tenant faltantes. Aditivo, sin DROP, sin cambios de datos.
-- Reconciliación: 20261003000001_crm_v1 y 20261003000002_niupackbot_v1 ya aplicadas en vivo
-- (proyecto tviuvfmhkatdplkisnta, según certificación). Este archivo solo agrega índices.

-- contacts: tenant + company / owner
CREATE INDEX IF NOT EXISTS idx_crm_contacts_org_company ON public.crm_contacts (organization_id, company_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_org_owner ON public.crm_contacts (organization_id, owner_profile_id);

-- opportunities: tenant + contact
CREATE INDEX IF NOT EXISTS idx_crm_opps_org_contact ON public.crm_opportunities (organization_id, contact_id);

-- tasks: tenant + company / assignee
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_company ON public.crm_tasks (organization_id, company_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_assignee ON public.crm_tasks (organization_id, assigned_to);

-- activities: tenant + company / contact
CREATE INDEX IF NOT EXISTS idx_crm_activities_org_company ON public.crm_activities (organization_id, company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_org_contact ON public.crm_activities (organization_id, contact_id, occurred_at DESC);

-- conversations: tenant + opportunity / contact
CREATE INDEX IF NOT EXISTS idx_crm_convs_org_opp ON public.crm_conversations (organization_id, opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_convs_org_contact ON public.crm_conversations (organization_id, contact_id);

-- bot events: tenant + lead / opportunity (timeline)
CREATE INDEX IF NOT EXISTS idx_bot_events_org_lead ON public.niupackbot_events (organization_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_org_opp ON public.niupackbot_events (organization_id, opportunity_id, created_at DESC);
