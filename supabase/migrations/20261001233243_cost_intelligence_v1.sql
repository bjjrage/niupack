-- Cost Intelligence V1: one persisted, tenant-scoped configuration per active SKU.
-- The JSON payload preserves the existing paper formula while the six V1 rubrics
-- remain the only cost inputs used by the simulator and True Cost view.

CREATE TABLE IF NOT EXISTS public.cost_v1_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    input_json JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_cost_v1_configurations_sku
    ON public.cost_v1_configurations (organization_id, sku, is_active);

ALTER TABLE public.cost_v1_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_v1_configurations_tenant_isolation ON public.cost_v1_configurations;
CREATE POLICY cost_v1_configurations_tenant_isolation
    ON public.cost_v1_configurations
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.cost_v1_configurations TO service_role;

