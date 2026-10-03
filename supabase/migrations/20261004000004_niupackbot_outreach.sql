-- NIUPACKBOT Outreach: templates WhatsApp, campañas, destinatarios y opt-out.
-- ADITIVA: no altera ni elimina nada de crm_* ni niupackbot_* existentes.
-- La conversación se vincula por recipient.conversation_id (no se agregan columnas a crm_conversations).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------
-- 1. Templates (Twilio Content API). Se envían solo si status = APPROVED.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.niupackbot_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name ~ '^[a-z0-9_]{3,64}$'),
  language TEXT NOT NULL DEFAULT 'es' CHECK (language IN ('es','es_AR','pt_BR','en')),
  category TEXT NOT NULL DEFAULT 'MARKETING' CHECK (category IN ('MARKETING','UTILITY')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1024),
  -- Valores de ejemplo por variable: {"1": "María", "2": "NIUPACK"}
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  twilio_content_sid TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAUSED','DISABLED')),
  rejection_reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);
CREATE INDEX IF NOT EXISTS idx_bot_templates_org_status ON public.niupackbot_templates (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_templates_created_by ON public.niupackbot_templates (created_by);

-- -------------------------------------------------------------------
-- 2. Campañas
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.niupackbot_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 140),
  template_id UUID NOT NULL REFERENCES public.niupackbot_templates(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SCHEDULED','RUNNING','PAUSED','COMPLETED','CANCELLED')),
  scheduled_at TIMESTAMPTZ,
  -- Ritmo de envío (mensajes por minuto). El scheduler nunca supera este tope por tick.
  send_rate_per_min INTEGER NOT NULL DEFAULT 20 CHECK (send_rate_per_min BETWEEN 1 AND 60),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  launched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bot_campaigns_org_status ON public.niupackbot_campaigns (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_campaigns_template ON public.niupackbot_campaigns (template_id);
CREATE INDEX IF NOT EXISTS idx_bot_campaigns_created_by ON public.niupackbot_campaigns (created_by);

-- -------------------------------------------------------------------
-- 3. Destinatarios (1 fila por teléfono por campaña)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.niupackbot_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.niupackbot_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.crm_conversations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  content_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','QUEUED','SENT','DELIVERED','READ','REPLIED','HUMAN','NO_INTEREST','OPT_OUT','FAILED'
  )),
  message_sid TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un teléfono no puede estar dos veces en la misma campaña (idempotencia de importación).
  UNIQUE (campaign_id, phone_e164)
);
-- Un MessageSid pertenece a un único destinatario (idempotencia de callbacks y de envío).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_recipients_org_sid
  ON public.niupackbot_campaign_recipients (organization_id, message_sid)
  WHERE message_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bot_recipients_campaign_status ON public.niupackbot_campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_recipients_org_phone ON public.niupackbot_campaign_recipients (organization_id, phone_e164, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_recipients_conversation ON public.niupackbot_campaign_recipients (conversation_id);
CREATE INDEX IF NOT EXISTS idx_bot_recipients_contact ON public.niupackbot_campaign_recipients (contact_id);
CREATE INDEX IF NOT EXISTS idx_bot_recipients_company ON public.niupackbot_campaign_recipients (company_id);

-- -------------------------------------------------------------------
-- 4. Opt-out (bloquea todo outbound futuro de campañas a ese teléfono)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.niupackbot_opt_outs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'INBOUND_KEYWORD' CHECK (source IN ('INBOUND_KEYWORD','MANUAL','IMPORT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, phone_e164)
);

-- -------------------------------------------------------------------
-- RLS: tenant isolation (mismo patrón que crm_* / niupackbot_*). Re-ejecutable.
-- -------------------------------------------------------------------
ALTER TABLE public.niupackbot_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niupackbot_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niupackbot_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niupackbot_opt_outs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['niupackbot_templates','niupackbot_campaigns','niupackbot_campaign_recipients','niupackbot_opt_outs'] LOOP
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
  public.niupackbot_templates, public.niupackbot_campaigns,
  public.niupackbot_campaign_recipients, public.niupackbot_opt_outs
FROM anon;
GRANT ALL ON
  public.niupackbot_templates, public.niupackbot_campaigns,
  public.niupackbot_campaign_recipients, public.niupackbot_opt_outs
TO authenticated, service_role;
