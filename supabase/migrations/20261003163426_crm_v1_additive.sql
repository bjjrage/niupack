-- Commercial CRM V1 additive: tenant-scoped commercial truth.
-- Reconciliado con LIVE: 20261003163426 crm_v1_additive (proyecto tviuvfmhkatdplkisnta).
-- Aditivo, sin DROP, sin destrucción. Reconstruye DB nueva desde cero.
-- RLS real vía private.current_organization_id() (definida en migrations de seguridad previas).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------
-- 1. crm_companies
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT,
  country_code TEXT,
  city TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  source TEXT,
  notes TEXT,
  owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_companies_org ON public.crm_companies (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_companies_owner ON public.crm_companies (organization_id, owner_profile_id);

-- -------------------------------------------------------------------
-- 2. crm_contacts
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  job_title TEXT,
  phone TEXT,
  whatsapp_phone TEXT,
  email TEXT,
  language TEXT,
  country_code TEXT,
  source TEXT,
  owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_org ON public.crm_contacts (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON public.crm_contacts (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_whatsapp ON public.crm_contacts (organization_id, whatsapp_phone);

-- -------------------------------------------------------------------
-- 3. crm_leads
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  source TEXT,
  source_channel TEXT,
  external_source TEXT,
  external_id TEXT,
  country_code TEXT,
  product_interest TEXT,
  capacity TEXT,
  material TEXT,
  printing TEXT,
  estimated_volume NUMERIC,
  volume_period TEXT CHECK (volume_period IS NULL OR volume_period IN ('ONE_OFF','WEEKLY','MONTHLY','ANNUAL')),
  destination_city TEXT,
  destination_state TEXT,
  destination_country TEXT,
  intent TEXT CHECK (intent IS NULL OR intent IN ('PRODUCT_INFO','SPEC_REQUEST','SAMPLE_REQUEST','RFQ','PRICE_REQUEST','LOGISTICS_REQUEST','FOLLOW_UP','HUMAN_REQUEST','OTHER')),
  qualification TEXT CHECK (qualification IS NULL OR qualification IN ('LOW','MEDIUM','HIGH')),
  status TEXT NOT NULL DEFAULT 'NUEVO' CHECK (status IN ('NUEVO','CONTACTADO','CALIFICADO','COTIZACIÓN','NEGOCIACIÓN','GANADO','PERDIDO')),
  owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotencia: mismo proveedor externo no duplica lead dentro del tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_leads_org_external
  ON public.crm_leads (organization_id, external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_org_status ON public.crm_leads (organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_org_company ON public.crm_leads (organization_id, company_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_org_contact ON public.crm_leads (organization_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_org_owner ON public.crm_leads (organization_id, owner_profile_id);

-- -------------------------------------------------------------------
-- 4. crm_opportunities
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'NUEVO' CHECK (stage IN ('NUEVO','CONTACTADO','CALIFICADO','COTIZACIÓN','NEGOCIACIÓN','GANADO','PERDIDO')),
  product_interest TEXT,
  sku TEXT,
  capacity TEXT,
  material TEXT,
  printing TEXT,
  estimated_volume NUMERIC,
  volume_period TEXT CHECK (volume_period IS NULL OR volume_period IN ('ONE_OFF','WEEKLY','MONTHLY','ANNUAL')),
  estimated_value NUMERIC,
  currency TEXT DEFAULT 'USD',
  destination_city TEXT,
  destination_state TEXT,
  destination_country TEXT,
  owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  next_action TEXT,
  next_action_at TIMESTAMPTZ,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_opps_org_stage ON public.crm_opportunities (organization_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_opps_org_lead ON public.crm_opportunities (organization_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_org_company ON public.crm_opportunities (organization_id, company_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_org_owner ON public.crm_opportunities (organization_id, owner_profile_id);

-- -------------------------------------------------------------------
-- 5. crm_tasks
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','DONE','CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  source TEXT,
  external_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_tasks_org_external
  ON public.crm_tasks (organization_id, external_key)
  WHERE external_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_status ON public.crm_tasks (organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_lead ON public.crm_tasks (organization_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_opp ON public.crm_tasks (organization_id, opportunity_id);

-- -------------------------------------------------------------------
-- 6. crm_activities (timeline)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  conversation_id UUID,
  type TEXT NOT NULL CHECK (type IN ('LEAD_CREATED','LEAD_UPDATED','STAGE_CHANGED','NOTE','TASK_CREATED','TASK_COMPLETED','BOT_MESSAGE','HUMAN_MESSAGE','HUMAN_HANDOFF','QUOTE_REQUESTED','QUOTE_CREATED','WON','LOST')),
  source TEXT,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  external_key TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_activities_org_external
  ON public.crm_activities (organization_id, external_key)
  WHERE external_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_activities_org_lead ON public.crm_activities (organization_id, lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_org_opp ON public.crm_activities (organization_id, opportunity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_org_conv ON public.crm_activities (organization_id, conversation_id, occurred_at DESC);

-- -------------------------------------------------------------------
-- 7. crm_conversations (verdad comercial de la conversación; runtime bot en niupackbot_*)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'WHATSAPP' CHECK (channel IN ('WHATSAPP','WEB','EMAIL','OTHER')),
  provider TEXT NOT NULL DEFAULT 'TWILIO' CHECK (provider IN ('TWILIO','MANUAL','OTHER')),
  external_conversation_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','ARCHIVED')),
  control_mode TEXT NOT NULL DEFAULT 'BOT' CHECK (control_mode IN ('BOT','HUMAN','PAUSED')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, channel, external_conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_convs_org_status ON public.crm_conversations (organization_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_convs_org_lead ON public.crm_conversations (organization_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_convs_control ON public.crm_conversations (organization_id, control_mode);

-- -------------------------------------------------------------------
-- RLS: tenant isolation real (no confiar solo en TO authenticated).
-- Aditivo y re-ejecutable: solo crea la policy si no existe (sin DROP).
-- -------------------------------------------------------------------
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_conversations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_companies','crm_contacts','crm_leads','crm_opportunities','crm_tasks','crm_activities','crm_conversations'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'tenant_isolation_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (organization_id = (SELECT private.current_organization_id())) WITH CHECK (organization_id = (SELECT private.current_organization_id()))',
        'tenant_isolation_' || t, t
      );
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON
  public.crm_companies, public.crm_contacts, public.crm_leads, public.crm_opportunities,
  public.crm_tasks, public.crm_activities, public.crm_conversations
FROM anon;
GRANT ALL ON
  public.crm_companies, public.crm_contacts, public.crm_leads, public.crm_opportunities,
  public.crm_tasks, public.crm_activities, public.crm_conversations
TO authenticated, service_role;
