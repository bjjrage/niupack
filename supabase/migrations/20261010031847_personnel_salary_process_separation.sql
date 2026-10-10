-- A person's salary-band history is independent from their operational process assignment.
CREATE TABLE IF NOT EXISTS public.plant_personnel_salary_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    personnel_id UUID NOT NULL REFERENCES public.plant_personnel(id) ON DELETE CASCADE,
    salary_band_id UUID NOT NULL REFERENCES public.plant_salary_bands(id) ON DELETE RESTRICT,
    valid_from DATE NOT NULL,
    valid_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_personnel_salary_assignment_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_personnel_salary_assignments_effective_start
    ON public.plant_personnel_salary_assignments (organization_id, personnel_id, valid_from);
CREATE INDEX IF NOT EXISTS idx_personnel_salary_assignments_lookup
    ON public.plant_personnel_salary_assignments (organization_id, personnel_id, valid_from, valid_to);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_personnel_salary_assignments_person_org'
          AND conrelid = 'public.plant_personnel_salary_assignments'::regclass
    ) THEN
        ALTER TABLE public.plant_personnel_salary_assignments
            ADD CONSTRAINT fk_personnel_salary_assignments_person_org
            FOREIGN KEY (personnel_id, organization_id)
            REFERENCES public.plant_personnel (id, organization_id)
            ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_personnel_salary_assignments_band_org'
          AND conrelid = 'public.plant_personnel_salary_assignments'::regclass
    ) THEN
        ALTER TABLE public.plant_personnel_salary_assignments
            ADD CONSTRAINT fk_personnel_salary_assignments_band_org
            FOREIGN KEY (salary_band_id, organization_id)
            REFERENCES public.plant_salary_bands (id, organization_id)
            ON DELETE RESTRICT;
    END IF;
END $$;

ALTER TABLE public.plant_personnel_salary_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plant_personnel_salary_assignments_tenant_isolation
    ON public.plant_personnel_salary_assignments;
CREATE POLICY plant_personnel_salary_assignments_tenant_isolation
    ON public.plant_personnel_salary_assignments
    FOR ALL TO authenticated
    USING (organization_id = (SELECT private.current_organization_id()))
    WITH CHECK (organization_id = (SELECT private.current_organization_id()));
GRANT ALL ON TABLE public.plant_personnel_salary_assignments TO service_role;

-- Keep generation as an operational attribute while making FORMADO one process.
ALTER TABLE public.plant_personnel_assignments
    ADD COLUMN IF NOT EXISTS machine_generation TEXT;

DROP INDEX IF EXISTS public.idx_plant_personnel_assignments_effective_start;
ALTER TABLE public.plant_personnel_assignments
    DROP CONSTRAINT IF EXISTS plant_personnel_assignments_sector_check;
ALTER TABLE public.plant_personnel_assignments
    DROP CONSTRAINT IF EXISTS chk_personnel_assignment_machine_generation;

UPDATE public.plant_personnel_assignments
SET machine_generation = CASE sector
        WHEN 'FORMADO_GEN1' THEN 'GEN1'
        WHEN 'FORMADO_GEN2' THEN 'GEN2'
        ELSE machine_generation
    END,
    sector = CASE
        WHEN sector IN ('FORMADO_GEN1', 'FORMADO_GEN2') THEN 'FORMADO'
        ELSE sector
    END
WHERE sector IN ('FORMADO_GEN1', 'FORMADO_GEN2');

ALTER TABLE public.plant_personnel_assignments
    ADD CONSTRAINT plant_personnel_assignments_sector_check
    CHECK (sector IN ('FORMADO', 'CALIDAD', 'EMPAQUE'));
ALTER TABLE public.plant_personnel_assignments
    ADD CONSTRAINT chk_personnel_assignment_machine_generation
    CHECK (machine_generation IS NULL OR (sector = 'FORMADO' AND machine_generation IN ('GEN1', 'GEN2')));

CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_personnel_assignments_effective_start
    ON public.plant_personnel_assignments (
        organization_id,
        personnel_id,
        sector,
        (COALESCE(machine_generation, '')),
        valid_from
    );

-- Backfill one salary history row per person and effective date from legacy assignments.
WITH legacy_salary_starts AS (
    SELECT DISTINCT ON (organization_id, personnel_id, valid_from)
        id,
        organization_id,
        personnel_id,
        salary_band_id,
        valid_from,
        valid_to
    FROM public.plant_personnel_assignments
    ORDER BY organization_id, personnel_id, valid_from, updated_at DESC, created_at DESC, id
), salary_periods AS (
    SELECT
        id,
        organization_id,
        personnel_id,
        salary_band_id,
        valid_from,
        valid_to,
        LEAD(valid_from) OVER (PARTITION BY organization_id, personnel_id ORDER BY valid_from) AS next_valid_from
    FROM legacy_salary_starts
)
INSERT INTO public.plant_personnel_salary_assignments (
    id, organization_id, personnel_id, salary_band_id, valid_from, valid_to
)
SELECT
    id,
    organization_id,
    personnel_id,
    salary_band_id,
    valid_from,
    CASE
        WHEN next_valid_from IS NOT NULL THEN next_valid_from - 1
        ELSE valid_to
    END
FROM salary_periods
ON CONFLICT (organization_id, personnel_id, valid_from) DO NOTHING;
