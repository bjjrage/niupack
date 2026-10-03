-- CRM sales cockpit: additive commercial columns. No DROP, no data changes.
-- Tablas ya RLS-protegidas; las columnas nuevas heredan las policies existentes.

ALTER TABLE public.crm_companies
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT CHECK (lifecycle_stage IS NULL OR lifecycle_stage IN ('PROSPECT','CUSTOMER','INACTIVE'));

ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS expected_close_at TIMESTAMPTZ;

ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS probability INTEGER CHECK (probability IS NULL OR (probability >= 0 AND probability <= 100));

ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT CHECK (task_type IS NULL OR task_type IN ('CALL','WHATSAPP','EMAIL','MEETING','FOLLOW_UP','QUOTE','OTHER'));
