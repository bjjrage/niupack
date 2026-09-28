-- Security baseline: legacy tenant tables (group A).

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'actions', 'brands', 'cost_scenarios', 'cost_sheet_versions',
    'email_threads', 'job_runs', 'markets', 'products'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_select_%I ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY tenant_select_%I ON public.%I FOR SELECT TO authenticated USING (organization_id = (SELECT private.current_organization_id()))',
      table_name, table_name
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;
