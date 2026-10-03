-- NIUPACKBOT V1 runtime: verdad conversacional (CRM sigue siendo verdad comercial).
-- Reutiliza public.crm_conversations como ancla; no duplica Company/Contact/Lead/Opportunity.
-- Additive only.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------
-- 1. niupackbot_messages (inbound/outbound, idempotente por provider SID)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.niupackbot_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  channel TEXT NOT NULL DEFAULT 'WHATSAPP',
  provider TEXT NOT NULL DEFAULT 'TWILIO',
  external_message_id TEXT,
  author_role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (author_role IN ('CUSTOMER','BOT','HUMAN_AGENT','SYSTEM')),
  body TEXT NOT NULL,
  intent TEXT,
  language TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_niupackbot_messages_org_external
  ON public.niupackbot_messages (organization_id, external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bot_messages_conv
  ON public.niupackbot_messages (conversation_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_bot_messages_org_conv
  ON public.niupackbot_messages (organization_id, conversation_id, occurred_at DESC);

-- -------------------------------------------------------------------
-- 2. niupackbot_state (runtime por conversación)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.niupackbot_state (
  conversation_id UUID PRIMARY KEY REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bot_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (bot_status IN ('ACTIVE','PAUSED','HANDOFF_REQUESTED','CLOSED')),
  last_intent TEXT,
  language TEXT,
  extracted JSONB DEFAULT '{}'::jsonb,
  turn_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bot_state_org ON public.niupackbot_state (organization_id, bot_status);

-- -------------------------------------------------------------------
-- 3. niupackbot_events (observabilidad mínima, sin secretos ni PII completa)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.niupackbot_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.crm_conversations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  external_message_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'INBOUND_RECEIVED','INBOUND_DUPLICATE','CONTEXT_LOADED','INTENT_EXTRACTED',
    'CRM_UPSERTED','OPPORTUNITY_CREATED','HANDOFF_REQUESTED','REPLY_SENT',
    'REPLY_SKIPPED_HUMAN','FAILURE_HANDLED'
  )),
  duration_ms INTEGER,
  error_code TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bot_events_org_conv
  ON public.niupackbot_events (organization_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_org_type
  ON public.niupackbot_events (organization_id, event_type, created_at DESC);

-- -------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------
ALTER TABLE public.niupackbot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niupackbot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.niupackbot_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['niupackbot_messages','niupackbot_state','niupackbot_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_isolation_' || t, t);
    IF t = 'niupackbot_state' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (organization_id = (SELECT private.current_organization_id())) WITH CHECK (organization_id = (SELECT private.current_organization_id()))',
        'tenant_isolation_' || t, t
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (organization_id = (SELECT private.current_organization_id())) WITH CHECK (organization_id = (SELECT private.current_organization_id()))',
        'tenant_isolation_' || t, t
      );
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON public.niupackbot_messages, public.niupackbot_state, public.niupackbot_events FROM anon;
GRANT ALL ON public.niupackbot_messages, public.niupackbot_state, public.niupackbot_events TO authenticated, service_role;

-- FK diferida: crm_activities.conversation_id -> crm_conversations(id) (no se pudo declarar inline por orden).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_activities_conversation_id_fkey'
  ) THEN
    ALTER TABLE public.crm_activities
      ADD CONSTRAINT crm_activities_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES public.crm_conversations(id) ON DELETE SET NULL;
  END IF;
END $$;
