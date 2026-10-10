-- Migration: Industrial Processes V2 (Parametrización industrial, cronómetro de empaque y Cost Intelligence)
-- Tenant-isolated tables for plant parameters, packing sessions, segments, production periods and process snapshots.

-- 1. Parámetros Generales de Planta
CREATE TABLE IF NOT EXISTS public.plant_process_parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    electricity_rate_pyg_kwh NUMERIC NOT NULL DEFAULT 450,
    monthly_salary_hours NUMERIC NOT NULL DEFAULT 200,
    labor_charges_percent NUMERIC NOT NULL DEFAULT 16.5,
    operator_monthly_salary_pyg NUMERIC NOT NULL DEFAULT 3500000,
    packer_monthly_salary_pyg NUMERIC NOT NULL DEFAULT 2800000,
    gen1_machines_count INTEGER NOT NULL DEFAULT 4,
    gen1_power_kw NUMERIC NOT NULL DEFAULT 4.5,
    gen1_operators_count INTEGER NOT NULL DEFAULT 2,
    gen1_operating_hours NUMERIC NOT NULL DEFAULT 160,
    gen2_machines_count INTEGER NOT NULL DEFAULT 2,
    gen2_power_kw NUMERIC NOT NULL DEFAULT 6.0,
    gen2_operators_count INTEGER NOT NULL DEFAULT 1,
    gen2_operating_hours NUMERIC NOT NULL DEFAULT 160,
    quality_inspectors_count INTEGER NOT NULL DEFAULT 2,
    quality_monthly_salary_pyg NUMERIC NOT NULL DEFAULT 3200000,
    quality_polypaper_percent NUMERIC NOT NULL DEFAULT 70,
    quality_labor_charges_included BOOLEAN NOT NULL DEFAULT true,
    packaging_materials_cost_per_thousand_usd NUMERIC NOT NULL DEFAULT 0, -- 0 = not configured (no assumed cost)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (organization_id)
);

ALTER TABLE public.plant_process_parameters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plant_process_parameters_tenant_isolation ON public.plant_process_parameters;
CREATE POLICY plant_process_parameters_tenant_isolation
    ON public.plant_process_parameters
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.plant_process_parameters TO service_role;

-- 2. Sesiones de Cronómetro de Empaque
CREATE TABLE IF NOT EXISTS public.packing_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    session_code TEXT NOT NULL,
    line_name TEXT NOT NULL DEFAULT 'Polipapel',
    sku TEXT,
    production_order TEXT,
    operator_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stopped_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'STOPPED', 'APPROVED', 'CORRECTED', 'VOIDED')),
    total_person_hours NUMERIC NOT NULL DEFAULT 0,
    total_duration_minutes NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packing_sessions_tenant_status
    ON public.packing_sessions (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_packing_sessions_sku
    ON public.packing_sessions (organization_id, sku);

ALTER TABLE public.packing_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS packing_sessions_tenant_isolation ON public.packing_sessions;
CREATE POLICY packing_sessions_tenant_isolation
    ON public.packing_sessions
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.packing_sessions TO service_role;

-- 3. Segmentos de Sesiones de Empaque (Cambios de dotación con timestamps de servidor)
CREATE TABLE IF NOT EXISTS public.packing_session_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.packing_sessions(id) ON DELETE CASCADE,
    segment_order INTEGER NOT NULL,
    headcount INTEGER NOT NULL CHECK (headcount > 0),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_minutes NUMERIC NOT NULL DEFAULT 0,
    person_hours NUMERIC NOT NULL DEFAULT 0,
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_packing_session_segments_session
    ON public.packing_session_segments (session_id, segment_order);

ALTER TABLE public.packing_session_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS packing_session_segments_tenant_isolation ON public.packing_session_segments;
CREATE POLICY packing_session_segments_tenant_isolation
    ON public.packing_session_segments
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.packing_sessions s
            WHERE s.id = packing_session_segments.session_id
            AND s.organization_id = (SELECT private.current_organization_id())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.packing_sessions s
            WHERE s.id = packing_session_segments.session_id
            AND s.organization_id = (SELECT private.current_organization_id())
        )
    );

GRANT ALL ON TABLE public.packing_session_segments TO service_role;

-- 4. Períodos de Producción de Planta (Base de unidades buenas producidas para prorrateo)
CREATE TABLE IF NOT EXISTS public.plant_production_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    sku TEXT NOT NULL,
    good_units_produced NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, period, sku)
);

CREATE INDEX IF NOT EXISTS idx_plant_production_periods_lookup
    ON public.plant_production_periods (organization_id, period, sku);

ALTER TABLE public.plant_production_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plant_production_periods_tenant_isolation ON public.plant_production_periods;
CREATE POLICY plant_production_periods_tenant_isolation
    ON public.plant_production_periods
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.plant_production_periods TO service_role;

-- 5. Snapshots Históricos de Procesos Industriales
CREATE TABLE IF NOT EXISTS public.industrial_process_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    period TEXT NOT NULL,
    detail_json JSONB NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (organization_id, period, sku)
);

ALTER TABLE public.industrial_process_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS industrial_process_snapshots_tenant_isolation ON public.industrial_process_snapshots;
CREATE POLICY industrial_process_snapshots_tenant_isolation
    ON public.industrial_process_snapshots
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.industrial_process_snapshots TO service_role;
