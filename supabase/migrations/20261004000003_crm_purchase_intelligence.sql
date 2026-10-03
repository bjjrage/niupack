-- Customer Purchase Intelligence: historial de compras por cliente x producto/SKU.
-- Aditivo, sin DROP, sin cambios de datos. RLS tenant-safe en tablas nuevas.

-- 0. external id de cliente (para matching contra legajos externos).
ALTER TABLE public.crm_companies
  ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE INDEX IF NOT EXISTS idx_crm_companies_org_external ON public.crm_companies (organization_id, external_id);

-- -------------------------------------------------------------------
-- 1. crm_customer_purchases
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_customer_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  purchase_date DATE NOT NULL,
  external_document_id TEXT,
  document_number TEXT,
  line_number INTEGER,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'u',
  unit_price NUMERIC CHECK (unit_price IS NULL OR unit_price >= 0),
  total_value NUMERIC CHECK (total_value IS NULL OR total_value >= 0),
  currency TEXT DEFAULT 'USD',
  source TEXT NOT NULL DEFAULT 'IMPORT',
  fingerprint TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotencia con documento + línea.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_purchases_org_doc_line
  ON public.crm_customer_purchases (organization_id, external_document_id, line_number)
  WHERE external_document_id IS NOT NULL AND line_number IS NOT NULL;
-- Idempotencia sin documento: fingerprint estable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_purchases_org_fingerprint
  ON public.crm_customer_purchases (organization_id, fingerprint)
  WHERE external_document_id IS NULL AND fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_purchases_org ON public.crm_customer_purchases (organization_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_purchases_company_date ON public.crm_customer_purchases (company_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_purchases_company_sku_date ON public.crm_customer_purchases (company_id, sku, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_purchases_sku ON public.crm_customer_purchases (organization_id, sku);
CREATE INDEX IF NOT EXISTS idx_crm_purchases_product ON public.crm_customer_purchases (organization_id, product_id);
CREATE INDEX IF NOT EXISTS idx_crm_purchases_doc ON public.crm_customer_purchases (organization_id, external_document_id);

-- -------------------------------------------------------------------
-- 2. Alias de matching (cliente y producto), confirmados por el usuario.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_customer_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  alias_normalized TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, alias_normalized)
);
CREATE INDEX IF NOT EXISTS idx_crm_customer_aliases_company ON public.crm_customer_aliases (company_id);

CREATE TABLE IF NOT EXISTS public.crm_product_aliases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  alias_normalized TEXT NOT NULL,
  sku TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, alias_normalized)
);
CREATE INDEX IF NOT EXISTS idx_crm_product_aliases_sku ON public.crm_product_aliases (organization_id, sku);

-- -------------------------------------------------------------------
-- 3. RLS
-- -------------------------------------------------------------------
ALTER TABLE public.crm_customer_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_customer_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_product_aliases ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_customer_purchases','crm_customer_aliases','crm_product_aliases'] LOOP
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

REVOKE ALL ON public.crm_customer_purchases, public.crm_customer_aliases, public.crm_product_aliases FROM anon;
GRANT ALL ON public.crm_customer_purchases, public.crm_customer_aliases, public.crm_product_aliases TO authenticated, service_role;

-- -------------------------------------------------------------------
-- 4. VIEW agregada por cliente x SKU ( двигатель TS calcula medianas/cadencia ).
-- -------------------------------------------------------------------
CREATE OR REPLACE VIEW public.customer_product_purchase_stats AS
SELECT
  organization_id,
  company_id,
  sku,
  COUNT(*)::INTEGER AS purchase_count,
  MIN(purchase_date) AS first_purchase_date,
  MAX(purchase_date) AS last_purchase_date,
  (ARRAY_AGG(quantity ORDER BY purchase_date DESC))[1] AS last_purchase_quantity,
  AVG(quantity)::NUMERIC AS average_order_quantity,
  SUM(quantity FILTER (WHERE purchase_date >= CURRENT_DATE - INTERVAL '30 days'))::NUMERIC AS total_quantity_30d,
  SUM(quantity FILTER (WHERE purchase_date >= CURRENT_DATE - INTERVAL '90 days'))::NUMERIC AS total_quantity_90d,
  SUM(quantity FILTER (WHERE purchase_date >= CURRENT_DATE - INTERVAL '180 days'))::NUMERIC AS total_quantity_180d,
  SUM(quantity FILTER (WHERE purchase_date >= CURRENT_DATE - INTERVAL '365 days'))::NUMERIC AS total_quantity_365d,
  AVG(COALESCE(total_value, quantity * COALESCE(unit_price, 0)))::NUMERIC AS average_order_value,
  SUM(COALESCE(total_value, quantity * COALESCE(unit_price, 0)) FILTER (WHERE purchase_date >= CURRENT_DATE - INTERVAL '365 days'))::NUMERIC AS total_value_365d,
  COUNT(*) FILTER (WHERE purchase_date >= CURRENT_DATE - INTERVAL '365 days')::INTEGER AS purchases_365d
FROM public.crm_customer_purchases
GROUP BY organization_id, company_id, sku;
