-- ===================================================================
-- COMMERCIAL DATA INGESTION: Staging & persistent import jobs
-- Additive migration, tenant-scoped, RLS enabled.
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.crm_import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  target_lifecycle TEXT NOT NULL CHECK (target_lifecycle IN ('CUSTOMER', 'PROSPECT')),
  dataset_type TEXT NOT NULL CHECK (dataset_type IN ('ACCOUNT_LIST', 'TRANSACTION_HISTORY', 'MIXED_TRANSACTIONAL_EXPORT')),
  status TEXT NOT NULL CHECK (status IN ('UPLOADED', 'MAPPED', 'STAGED', 'NEEDS_REVIEW', 'READY', 'COMMITTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  sheet_name TEXT,
  header_row_index INTEGER,
  mapping_json JSONB DEFAULT '{}'::jsonb,
  total_rows INTEGER NOT NULL DEFAULT 0,
  resolved_rows INTEGER NOT NULL DEFAULT 0,
  pending_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  ignored_rows INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_import_jobs_org ON public.crm_import_jobs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_import_jobs_status ON public.crm_import_jobs (organization_id, status);

CREATE TABLE IF NOT EXISTS public.crm_import_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.crm_import_jobs(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,

  customer_raw TEXT,
  tax_id_raw TEXT,
  contact_name_raw TEXT,
  phone_raw TEXT,
  email_raw TEXT,
  country_code_raw TEXT,
  city_raw TEXT,
  website_raw TEXT,

  purchase_date DATE,
  product_raw TEXT,
  sku_raw TEXT,
  quantity NUMERIC,
  document_number TEXT,
  line_number INTEGER,
  unit_price NUMERIC,
  total_value NUMERIC,
  currency TEXT,

  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  sku TEXT,

  customer_status TEXT NOT NULL CHECK (customer_status IN ('RESOLVED', 'UNRESOLVED', 'SKIPPED', 'INVALID')),
  product_status TEXT NOT NULL CHECK (product_status IN ('RESOLVED_CUP', 'RESOLVED_NON_CUP', 'PRODUCT_UNRESOLVED', 'SKIPPED')),
  row_status TEXT NOT NULL CHECK (row_status IN ('READY', 'CUSTOMER_UNRESOLVED', 'PRODUCT_UNRESOLVED', 'INVALID', 'IGNORED')),

  errors JSONB DEFAULT '[]'::jsonb,
  raw_payload JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_crm_import_rows_job_index UNIQUE (job_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_crm_import_rows_job ON public.crm_import_rows (job_id, row_index);
CREATE INDEX IF NOT EXISTS idx_crm_import_rows_org ON public.crm_import_rows (organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_import_rows_company ON public.crm_import_rows (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_import_rows_sku ON public.crm_import_rows (organization_id, sku);
CREATE INDEX IF NOT EXISTS idx_crm_import_rows_status ON public.crm_import_rows (job_id, row_status);

-- -------------------------------------------------------------------
-- RLS policies
-- -------------------------------------------------------------------
ALTER TABLE public.crm_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_import_rows ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_import_jobs','crm_import_rows'] LOOP
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

REVOKE ALL ON public.crm_import_jobs, public.crm_import_rows FROM anon;
GRANT ALL ON public.crm_import_jobs, public.crm_import_rows TO authenticated, service_role;
