-- Salary data must only be visible to organization admins.
-- The app reads and writes these tables exclusively with the service role (which bypasses RLS);
-- these policies close direct PostgREST access for every other authenticated member
-- (analyst, operator, executive) who could otherwise query salaries with the public anon key.

CREATE OR REPLACE FUNCTION private.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.role = 'admin'
      AND (
        p.auth_user_id = (SELECT auth.uid())
        OR (p.auth_user_id IS NULL AND lower(p.email) = lower(coalesce((SELECT auth.email()), '')))
      )
  );
$$;

REVOKE ALL ON FUNCTION private.current_user_is_org_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_user_is_org_admin() TO authenticated, service_role;

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'plant_salary_bands',
        'plant_salary_band_rates',
        'plant_personnel',
        'plant_personnel_assignments',
        'plant_personnel_salary_assignments',
        'packing_labor_allocations'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_tenant_isolation', v_table);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_admin_only', v_table);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
            'USING (organization_id = (SELECT private.current_organization_id()) AND (SELECT private.current_user_is_org_admin())) '
            'WITH CHECK (organization_id = (SELECT private.current_organization_id()) AND (SELECT private.current_user_is_org_admin()))',
            v_table || '_admin_only', v_table
        );
    END LOOP;
END;
$$;
