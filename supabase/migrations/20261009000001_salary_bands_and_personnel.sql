-- Migration: Centralized Salary Bands and Personnel Master for Industrial Costing
-- Tenant-isolated tables for plant salary bands, historical band rates, personnel,
-- multi-sector personnel assignments, and packing labor allocations.

-- 1. Bandas Salariales (Plant Salary Bands)
CREATE TABLE IF NOT EXISTS public.plant_salary_bands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_plant_salary_bands_org_status
    ON public.plant_salary_bands (organization_id, status);

ALTER TABLE public.plant_salary_bands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plant_salary_bands_tenant_isolation ON public.plant_salary_bands;
CREATE POLICY plant_salary_bands_tenant_isolation
    ON public.plant_salary_bands
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.plant_salary_bands TO service_role;

-- 2. Tarifas Históricas y Vigencias de Bandas (Plant Salary Band Rates)
CREATE TABLE IF NOT EXISTS public.plant_salary_band_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES public.plant_salary_bands(id) ON DELETE CASCADE,
    monthly_salary_pyg NUMERIC NOT NULL CHECK (monthly_salary_pyg >= 0),
    valid_from DATE NOT NULL,
    valid_to DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_band_rates_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_plant_salary_band_rates_band_dates
    ON public.plant_salary_band_rates (band_id, valid_from, valid_to);

ALTER TABLE public.plant_salary_band_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plant_salary_band_rates_tenant_isolation ON public.plant_salary_band_rates;
CREATE POLICY plant_salary_band_rates_tenant_isolation
    ON public.plant_salary_band_rates
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.plant_salary_band_rates TO service_role;

-- 3. Maestro de Personal de Planta (Plant Personnel)
CREATE TABLE IF NOT EXISTS public.plant_personnel (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_code TEXT NOT NULL,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    termination_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, employee_code),
    CONSTRAINT chk_personnel_dates CHECK (termination_date IS NULL OR termination_date >= hire_date)
);

CREATE INDEX IF NOT EXISTS idx_plant_personnel_org_status
    ON public.plant_personnel (organization_id, status);

ALTER TABLE public.plant_personnel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plant_personnel_tenant_isolation ON public.plant_personnel;
CREATE POLICY plant_personnel_tenant_isolation
    ON public.plant_personnel
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.plant_personnel TO service_role;

-- 4. Asignaciones de Personal a Sectores Industriales (Plant Personnel Assignments)
CREATE TABLE IF NOT EXISTS public.plant_personnel_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    personnel_id UUID NOT NULL REFERENCES public.plant_personnel(id) ON DELETE CASCADE,
    salary_band_id UUID NOT NULL REFERENCES public.plant_salary_bands(id) ON DELETE RESTRICT,
    sector TEXT NOT NULL CHECK (sector IN ('FORMADO_GEN1', 'FORMADO_GEN2', 'CALIDAD', 'EMPAQUE')),
    line_id TEXT,
    allocation_percent NUMERIC NOT NULL DEFAULT 100 CHECK (allocation_percent > 0 AND allocation_percent <= 100),
    valid_from DATE NOT NULL,
    valid_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_assignment_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_plant_personnel_assignments_lookup
    ON public.plant_personnel_assignments (organization_id, sector, personnel_id, valid_from, valid_to);

ALTER TABLE public.plant_personnel_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plant_personnel_assignments_tenant_isolation ON public.plant_personnel_assignments;
CREATE POLICY plant_personnel_assignments_tenant_isolation
    ON public.plant_personnel_assignments
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.plant_personnel_assignments TO service_role;

-- 5. Imputaciones Salariales de Sesiones de Empaque Aprobadas (Packing Labor Allocations)
CREATE TABLE IF NOT EXISTS public.packing_labor_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.packing_sessions(id) ON DELETE CASCADE,
    session_segment_id UUID REFERENCES public.packing_session_segments(id) ON DELETE CASCADE,
    salary_band_id UUID NOT NULL REFERENCES public.plant_salary_bands(id) ON DELETE RESTRICT,
    headcount INTEGER NOT NULL CHECK (headcount > 0),
    hourly_rate_snapshot_pyg NUMERIC NOT NULL CHECK (hourly_rate_snapshot_pyg >= 0),
    calculated_cost_pyg NUMERIC NOT NULL CHECK (calculated_cost_pyg >= 0),
    notes TEXT,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packing_labor_allocations_session
    ON public.packing_labor_allocations (session_id, salary_band_id);

-- A rate or assignment must never point across organization boundaries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_salary_bands_org_id_unique
    ON public.plant_salary_bands (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_personnel_org_id_unique
    ON public.plant_personnel (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_sessions_org_id_unique
    ON public.packing_sessions (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_packing_session_segments_session_id_unique
    ON public.packing_session_segments (session_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_salary_band_rates_effective_start
    ON public.plant_salary_band_rates (organization_id, band_id, valid_from);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_personnel_assignments_effective_start
    ON public.plant_personnel_assignments (organization_id, personnel_id, sector, valid_from);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plant_salary_band_rates_band_org' AND conrelid = 'public.plant_salary_band_rates'::regclass) THEN
        ALTER TABLE public.plant_salary_band_rates
            ADD CONSTRAINT fk_plant_salary_band_rates_band_org
            FOREIGN KEY (band_id, organization_id)
            REFERENCES public.plant_salary_bands (id, organization_id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plant_personnel_assignments_person_org' AND conrelid = 'public.plant_personnel_assignments'::regclass) THEN
        ALTER TABLE public.plant_personnel_assignments
            ADD CONSTRAINT fk_plant_personnel_assignments_person_org
            FOREIGN KEY (personnel_id, organization_id)
            REFERENCES public.plant_personnel (id, organization_id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plant_personnel_assignments_band_org' AND conrelid = 'public.plant_personnel_assignments'::regclass) THEN
        ALTER TABLE public.plant_personnel_assignments
            ADD CONSTRAINT fk_plant_personnel_assignments_band_org
            FOREIGN KEY (salary_band_id, organization_id)
            REFERENCES public.plant_salary_bands (id, organization_id)
            ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_packing_labor_allocations_session_org' AND conrelid = 'public.packing_labor_allocations'::regclass) THEN
        ALTER TABLE public.packing_labor_allocations
            ADD CONSTRAINT fk_packing_labor_allocations_session_org
            FOREIGN KEY (session_id, organization_id)
            REFERENCES public.packing_sessions (id, organization_id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_packing_labor_allocations_segment_session' AND conrelid = 'public.packing_labor_allocations'::regclass) THEN
        ALTER TABLE public.packing_labor_allocations
            ADD CONSTRAINT fk_packing_labor_allocations_segment_session
            FOREIGN KEY (session_id, session_segment_id)
            REFERENCES public.packing_session_segments (session_id, id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_packing_labor_allocations_band_org' AND conrelid = 'public.packing_labor_allocations'::regclass) THEN
        ALTER TABLE public.packing_labor_allocations
            ADD CONSTRAINT fk_packing_labor_allocations_band_org
            FOREIGN KEY (salary_band_id, organization_id)
            REFERENCES public.plant_salary_bands (id, organization_id)
            ON DELETE RESTRICT;
    END IF;
END $$;

ALTER TABLE public.packing_labor_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS packing_labor_allocations_tenant_isolation ON public.packing_labor_allocations;
CREATE POLICY packing_labor_allocations_tenant_isolation
    ON public.packing_labor_allocations
    FOR ALL
    TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));

GRANT ALL ON TABLE public.packing_labor_allocations TO service_role;
