-- Atomic persistence for industrial salary bands, personnel and assignments.
-- Apply only after the 20261008, 20261009 and 20261010 prerequisite migrations.

CREATE OR REPLACE FUNCTION public.create_plant_salary_band_with_rate(
    p_organization_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_status TEXT,
    p_monthly_salary_pyg NUMERIC,
    p_valid_from DATE,
    p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_band public.plant_salary_bands;
    v_rate public.plant_salary_band_rates;
BEGIN
    IF p_organization_id IS NULL OR p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'INVALID_SALARY_BAND';
    END IF;
    IF p_status IS NOT NULL AND p_status NOT IN ('ACTIVE', 'INACTIVE') THEN
        RAISE EXCEPTION 'INVALID_STATUS';
    END IF;
    IF p_valid_from IS NULL THEN
        RAISE EXCEPTION 'INVALID_VALID_FROM';
    END IF;
    IF p_monthly_salary_pyg IS NULL OR p_monthly_salary_pyg < 0 THEN
        RAISE EXCEPTION 'INVALID_SALARY';
    END IF;

    INSERT INTO public.plant_salary_bands (
        organization_id, name, description, status
    ) VALUES (
        p_organization_id, btrim(p_name), p_description, COALESCE(p_status, 'ACTIVE')
    ) RETURNING * INTO v_band;

    INSERT INTO public.plant_salary_band_rates (
        organization_id, band_id, monthly_salary_pyg, valid_from, valid_to,
        notes, created_by
    ) VALUES (
        p_organization_id, v_band.id, p_monthly_salary_pyg, p_valid_from, NULL,
        'Tarifa inicial de creación de banda', p_created_by
    ) RETURNING * INTO v_rate;

    RETURN to_jsonb(v_band) || jsonb_build_object(
        'monthly_salary_pyg', v_rate.monthly_salary_pyg,
        'current_rate', to_jsonb(v_rate)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_plant_salary_band_with_rate(
    p_organization_id UUID,
    p_band_id UUID,
    p_updates JSONB,
    p_monthly_salary_pyg NUMERIC,
    p_valid_from DATE,
    p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_band public.plant_salary_bands;
    v_rate public.plant_salary_band_rates;
    v_next_date DATE;
BEGIN
    SELECT * INTO v_band
    FROM public.plant_salary_bands
    WHERE id = p_band_id AND organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SALARY_BAND_NOT_FOUND';
    END IF;

    UPDATE public.plant_salary_bands
    SET name = CASE WHEN p_updates ? 'name' THEN btrim(p_updates->>'name') ELSE name END,
        description = CASE WHEN p_updates ? 'description' THEN p_updates->>'description' ELSE description END,
        status = CASE WHEN p_updates ? 'status' THEN p_updates->>'status' ELSE status END,
        updated_at = NOW()
    WHERE id = p_band_id AND organization_id = p_organization_id
    RETURNING * INTO v_band;

    IF p_monthly_salary_pyg IS NOT NULL THEN
        IF p_monthly_salary_pyg < 0 OR p_valid_from IS NULL THEN
            RAISE EXCEPTION 'INVALID_SALARY';
        END IF;

        SELECT * INTO v_rate
        FROM public.plant_salary_band_rates
        WHERE organization_id = p_organization_id
          AND band_id = p_band_id
          AND valid_from = p_valid_from
        FOR UPDATE;

        IF FOUND THEN
            UPDATE public.plant_salary_band_rates
            SET monthly_salary_pyg = p_monthly_salary_pyg
            WHERE id = v_rate.id AND organization_id = p_organization_id
            RETURNING * INTO v_rate;
        ELSE
            UPDATE public.plant_salary_band_rates
            SET valid_to = p_valid_from - 1
            WHERE organization_id = p_organization_id
              AND band_id = p_band_id
              AND valid_from < p_valid_from
              AND (valid_to IS NULL OR valid_to >= p_valid_from);

            SELECT min(valid_from) INTO v_next_date
            FROM public.plant_salary_band_rates
            WHERE organization_id = p_organization_id
              AND band_id = p_band_id
              AND valid_from > p_valid_from;

            INSERT INTO public.plant_salary_band_rates (
                organization_id, band_id, monthly_salary_pyg, valid_from,
                valid_to, notes, created_by
            ) VALUES (
                p_organization_id, p_band_id, p_monthly_salary_pyg, p_valid_from,
                CASE WHEN v_next_date IS NULL THEN NULL ELSE v_next_date - 1 END,
                'Actualización de tarifa salarial con vigencia', p_created_by
            ) RETURNING * INTO v_rate;
        END IF;
    ELSE
        SELECT * INTO v_rate
        FROM public.plant_salary_band_rates
        WHERE organization_id = p_organization_id
          AND band_id = p_band_id
          AND valid_from <= CURRENT_DATE
          AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
        ORDER BY valid_from DESC
        LIMIT 1;
    END IF;

    RETURN to_jsonb(v_band) || jsonb_build_object(
        'monthly_salary_pyg', COALESCE(v_rate.monthly_salary_pyg, 0),
        'current_rate', CASE WHEN v_rate.id IS NULL THEN NULL ELSE to_jsonb(v_rate) END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_plant_personnel_salary_assignment(
    p_organization_id UUID,
    p_personnel_id UUID,
    p_salary_band_id UUID,
    p_valid_from DATE,
    p_valid_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_person public.plant_personnel;
    v_band public.plant_salary_bands;
    v_rate public.plant_salary_band_rates;
    v_same_start public.plant_personnel_salary_assignments;
    v_result public.plant_personnel_salary_assignments;
    v_next_date DATE;
    v_effective_to DATE;
BEGIN
    IF p_organization_id IS NULL OR p_personnel_id IS NULL OR p_salary_band_id IS NULL
       OR p_valid_from IS NULL OR (p_valid_to IS NOT NULL AND p_valid_to < p_valid_from) THEN
        RAISE EXCEPTION 'INVALID_SALARY_ASSIGNMENT_DATES';
    END IF;
    SELECT * INTO v_person
    FROM public.plant_personnel
    WHERE id = p_personnel_id AND organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERSONNEL_NOT_FOUND';
    END IF;
    IF v_person.status <> 'ACTIVE' OR v_person.hire_date > p_valid_from
       OR (v_person.termination_date IS NOT NULL AND v_person.termination_date < p_valid_from) THEN
        RAISE EXCEPTION 'PERSONNEL_NOT_ACTIVE_ON_DATE';
    END IF;

    SELECT * INTO v_band
    FROM public.plant_salary_bands
    WHERE id = p_salary_band_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SALARY_BAND_NOT_FOUND';
    END IF;

    SELECT * INTO v_rate
    FROM public.plant_salary_band_rates
    WHERE organization_id = p_organization_id
      AND band_id = p_salary_band_id
      AND valid_from <= p_valid_from
      AND (valid_to IS NULL OR valid_to >= p_valid_from)
    ORDER BY valid_from DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SALARY_BAND_RATE_NOT_FOUND';
    END IF;

    SELECT * INTO v_same_start
    FROM public.plant_personnel_salary_assignments
    WHERE organization_id = p_organization_id
      AND personnel_id = p_personnel_id
      AND valid_from = p_valid_from
    FOR UPDATE;

    SELECT min(valid_from) INTO v_next_date
    FROM public.plant_personnel_salary_assignments
    WHERE organization_id = p_organization_id
      AND personnel_id = p_personnel_id
      AND valid_from > p_valid_from;

    v_effective_to := CASE
        WHEN p_valid_to IS NOT NULL AND v_next_date IS NOT NULL THEN LEAST(p_valid_to, v_next_date - 1)
        WHEN p_valid_to IS NOT NULL THEN p_valid_to
        WHEN v_next_date IS NOT NULL THEN v_next_date - 1
        ELSE NULL
    END;

    UPDATE public.plant_personnel_salary_assignments
    SET valid_to = p_valid_from - 1, updated_at = NOW()
    WHERE organization_id = p_organization_id
      AND personnel_id = p_personnel_id
      AND valid_from < p_valid_from
      AND (valid_to IS NULL OR valid_to >= p_valid_from);

    IF v_same_start.id IS NOT NULL THEN
        UPDATE public.plant_personnel_salary_assignments
        SET salary_band_id = p_salary_band_id,
            valid_to = v_effective_to,
            updated_at = NOW()
        WHERE id = v_same_start.id AND organization_id = p_organization_id
        RETURNING * INTO v_result;
    ELSE
        INSERT INTO public.plant_personnel_salary_assignments (
            organization_id, personnel_id, salary_band_id, valid_from, valid_to
        ) VALUES (
            p_organization_id, p_personnel_id, p_salary_band_id, p_valid_from, v_effective_to
        ) RETURNING * INTO v_result;
    END IF;

    RETURN to_jsonb(v_result) || jsonb_build_object(
        'band_name', v_band.name,
        'monthly_salary_pyg', v_rate.monthly_salary_pyg
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_plant_personnel_assignment(
    p_organization_id UUID,
    p_personnel_id UUID,
    p_sector TEXT,
    p_machine_generation TEXT,
    p_line_id TEXT,
    p_allocation_percent NUMERIC,
    p_valid_from DATE,
    p_valid_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_person public.plant_personnel;
    v_salary_assignment public.plant_personnel_salary_assignments;
    v_band public.plant_salary_bands;
    v_rate public.plant_salary_band_rates;
    v_same_start public.plant_personnel_assignments;
    v_result public.plant_personnel_assignments;
    v_next_date DATE;
    v_effective_to DATE;
    v_check_date DATE;
    v_existing_allocation NUMERIC;
BEGIN
    IF p_organization_id IS NULL OR p_personnel_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PERSONNEL';
    END IF;
    -- Serializes all operational assignments for this employee, including concurrent requests.
    SELECT * INTO v_person
    FROM public.plant_personnel
    WHERE id = p_personnel_id AND organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERSONNEL_NOT_FOUND';
    END IF;
    IF v_person.status <> 'ACTIVE' OR v_person.hire_date > p_valid_from
       OR (v_person.termination_date IS NOT NULL AND v_person.termination_date < p_valid_from) THEN
        RAISE EXCEPTION 'PERSONNEL_NOT_ACTIVE_ON_DATE';
    END IF;
    IF p_valid_from IS NULL OR (p_valid_to IS NOT NULL AND p_valid_to < p_valid_from) THEN
        RAISE EXCEPTION 'INVALID_ASSIGNMENT_DATES';
    END IF;
    IF p_sector IS NULL OR p_sector NOT IN ('FORMADO', 'CALIDAD', 'EMPAQUE') THEN
        RAISE EXCEPTION 'INVALID_SECTOR';
    END IF;
    IF (p_sector = 'FORMADO' AND (p_machine_generation IS NULL OR p_machine_generation NOT IN ('GEN1', 'GEN2')))
       OR (p_sector <> 'FORMADO' AND p_machine_generation IS NOT NULL) THEN
        RAISE EXCEPTION 'INVALID_MACHINE_GENERATION';
    END IF;
    IF p_allocation_percent <= 0 OR p_allocation_percent > 100 THEN
        RAISE EXCEPTION 'INVALID_ALLOCATION_PERCENT';
    END IF;

    SELECT * INTO v_salary_assignment
    FROM public.plant_personnel_salary_assignments
    WHERE organization_id = p_organization_id
      AND personnel_id = p_personnel_id
      AND valid_from <= p_valid_from
      AND (valid_to IS NULL OR valid_to >= p_valid_from)
    ORDER BY valid_from DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERSONNEL_SALARY_BAND_REQUIRED';
    END IF;

    SELECT * INTO v_band
    FROM public.plant_salary_bands
    WHERE id = v_salary_assignment.salary_band_id
      AND organization_id = p_organization_id
      AND status = 'ACTIVE';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SALARY_BAND_NOT_FOUND';
    END IF;

    SELECT * INTO v_rate
    FROM public.plant_salary_band_rates
    WHERE organization_id = p_organization_id
      AND band_id = v_salary_assignment.salary_band_id
      AND valid_from <= p_valid_from
      AND (valid_to IS NULL OR valid_to >= p_valid_from)
    ORDER BY valid_from DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SALARY_BAND_RATE_NOT_FOUND';
    END IF;

    SELECT * INTO v_same_start
    FROM public.plant_personnel_assignments
    WHERE organization_id = p_organization_id
      AND personnel_id = p_personnel_id
      AND sector = p_sector
      AND COALESCE(machine_generation, '') = COALESCE(p_machine_generation, '')
      AND valid_from = p_valid_from
    FOR UPDATE;

    SELECT min(valid_from) INTO v_next_date
    FROM public.plant_personnel_assignments
    WHERE organization_id = p_organization_id
      AND personnel_id = p_personnel_id
      AND sector = p_sector
      AND COALESCE(machine_generation, '') = COALESCE(p_machine_generation, '')
      AND valid_from > p_valid_from;

    v_effective_to := CASE
        WHEN p_valid_to IS NOT NULL AND v_next_date IS NOT NULL THEN LEAST(p_valid_to, v_next_date - 1)
        WHEN p_valid_to IS NOT NULL THEN p_valid_to
        WHEN v_next_date IS NOT NULL THEN v_next_date - 1
        ELSE NULL
    END;

    -- Check every interval boundary in the requested period, not only today's allocation.
    FOR v_check_date IN
        SELECT p_valid_from
        UNION
        SELECT a.valid_from
        FROM public.plant_personnel_assignments a
        WHERE a.organization_id = p_organization_id AND a.personnel_id = p_personnel_id
          AND a.valid_from > p_valid_from
          AND (v_effective_to IS NULL OR a.valid_from <= v_effective_to)
        UNION
        SELECT a.valid_to + 1
        FROM public.plant_personnel_assignments a
        WHERE a.organization_id = p_organization_id AND a.personnel_id = p_personnel_id
          AND a.valid_to IS NOT NULL AND a.valid_to >= p_valid_from
          AND (v_effective_to IS NULL OR a.valid_to < v_effective_to)
    LOOP
        SELECT COALESCE(sum(a.allocation_percent), 0) INTO v_existing_allocation
        FROM public.plant_personnel_assignments a
        WHERE a.organization_id = p_organization_id
          AND a.personnel_id = p_personnel_id
          AND (v_same_start.id IS NULL OR a.id <> v_same_start.id)
          AND NOT (
              a.sector = p_sector
              AND COALESCE(a.machine_generation, '') = COALESCE(p_machine_generation, '')
              AND a.valid_from < p_valid_from
          )
          AND a.valid_from <= v_check_date
          AND (a.valid_to IS NULL OR a.valid_to >= v_check_date);
        IF v_existing_allocation + p_allocation_percent > 100 THEN
            RAISE EXCEPTION 'ASSIGNMENT_ALLOCATION_EXCEEDED';
        END IF;
    END LOOP;

    UPDATE public.plant_personnel_assignments
    SET valid_to = p_valid_from - 1, updated_at = NOW()
    WHERE organization_id = p_organization_id
      AND personnel_id = p_personnel_id
      AND sector = p_sector
      AND COALESCE(machine_generation, '') = COALESCE(p_machine_generation, '')
      AND valid_from < p_valid_from
      AND (valid_to IS NULL OR valid_to >= p_valid_from);

    IF v_same_start.id IS NOT NULL THEN
        UPDATE public.plant_personnel_assignments
        SET salary_band_id = v_salary_assignment.salary_band_id,
            line_id = p_line_id,
            allocation_percent = p_allocation_percent,
            valid_to = v_effective_to,
            updated_at = NOW()
        WHERE id = v_same_start.id AND organization_id = p_organization_id
        RETURNING * INTO v_result;
    ELSE
        INSERT INTO public.plant_personnel_assignments (
            organization_id, personnel_id, salary_band_id, sector, machine_generation,
            line_id, allocation_percent, valid_from, valid_to
        ) VALUES (
            p_organization_id, p_personnel_id, v_salary_assignment.salary_band_id,
            p_sector, p_machine_generation, p_line_id, p_allocation_percent,
            p_valid_from, v_effective_to
        ) RETURNING * INTO v_result;
    END IF;

    RETURN to_jsonb(v_result) || jsonb_build_object(
        'band_name', v_band.name,
        'monthly_salary_pyg', v_rate.monthly_salary_pyg
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_plant_personnel_with_assignments(
    p_organization_id UUID,
    p_employee_code TEXT,
    p_display_name TEXT,
    p_status TEXT,
    p_hire_date DATE,
    p_termination_date DATE,
    p_salary_band_id UUID,
    p_sector TEXT,
    p_machine_generation TEXT,
    p_allocation_percent NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_person public.plant_personnel;
BEGIN
    IF p_status = 'ACTIVE' AND p_salary_band_id IS NULL THEN
        RAISE EXCEPTION 'PERSONNEL_SALARY_BAND_REQUIRED';
    END IF;
    IF p_sector IS NOT NULL AND p_salary_band_id IS NULL THEN
        RAISE EXCEPTION 'PERSONNEL_SALARY_BAND_REQUIRED';
    END IF;

    INSERT INTO public.plant_personnel (
        organization_id, employee_code, display_name, status, hire_date, termination_date
    ) VALUES (
        p_organization_id, btrim(p_employee_code), btrim(p_display_name), p_status,
        p_hire_date, p_termination_date
    ) RETURNING * INTO v_person;

    IF p_salary_band_id IS NOT NULL THEN
        PERFORM public.save_plant_personnel_salary_assignment(
            p_organization_id, v_person.id, p_salary_band_id, p_hire_date, NULL
        );
    END IF;
    IF p_sector IS NOT NULL THEN
        PERFORM public.save_plant_personnel_assignment(
            p_organization_id, v_person.id, p_sector, p_machine_generation,
            NULL, p_allocation_percent, p_hire_date, NULL
        );
    END IF;

    RETURN to_jsonb(v_person);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_plant_personnel_with_salary(
    p_organization_id UUID,
    p_personnel_id UUID,
    p_updates JSONB,
    p_salary_band_id UUID DEFAULT NULL,
    p_salary_valid_from DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_person public.plant_personnel;
BEGIN
    SELECT * INTO v_person
    FROM public.plant_personnel
    WHERE id = p_personnel_id AND organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERSONNEL_NOT_FOUND';
    END IF;

    UPDATE public.plant_personnel
    SET employee_code = CASE WHEN p_updates ? 'employee_code' THEN btrim(p_updates->>'employee_code') ELSE employee_code END,
        display_name = CASE WHEN p_updates ? 'display_name' THEN btrim(p_updates->>'display_name') ELSE display_name END,
        status = CASE WHEN p_updates ? 'status' THEN p_updates->>'status' ELSE status END,
        hire_date = CASE WHEN p_updates ? 'hire_date' THEN (p_updates->>'hire_date')::DATE ELSE hire_date END,
        termination_date = CASE WHEN p_updates ? 'termination_date' THEN NULLIF(p_updates->>'termination_date', '')::DATE ELSE termination_date END,
        updated_at = NOW()
    WHERE id = p_personnel_id AND organization_id = p_organization_id
    RETURNING * INTO v_person;

    IF p_salary_band_id IS NOT NULL THEN
        IF p_salary_valid_from IS NULL THEN
            RAISE EXCEPTION 'INVALID_SALARY_ASSIGNMENT_DATES';
        END IF;
        PERFORM public.save_plant_personnel_salary_assignment(
            p_organization_id, p_personnel_id, p_salary_band_id,
            p_salary_valid_from, NULL
        );
    END IF;

    RETURN to_jsonb(v_person);
END;
$$;

REVOKE ALL ON FUNCTION public.create_plant_salary_band_with_rate(UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_plant_salary_band_with_rate(UUID, UUID, JSONB, NUMERIC, DATE, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_plant_personnel_salary_assignment(UUID, UUID, UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_plant_personnel_assignment(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_plant_personnel_with_assignments(UUID, TEXT, TEXT, TEXT, DATE, DATE, UUID, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_plant_personnel_with_salary(UUID, UUID, JSONB, UUID, DATE) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_plant_salary_band_with_rate(UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_plant_salary_band_with_rate(UUID, UUID, JSONB, NUMERIC, DATE, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_plant_personnel_salary_assignment(UUID, UUID, UUID, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_plant_personnel_assignment(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_plant_personnel_with_assignments(UUID, TEXT, TEXT, TEXT, DATE, DATE, UUID, TEXT, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_plant_personnel_with_salary(UUID, UUID, JSONB, UUID, DATE) TO service_role;
