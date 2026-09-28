-- Security baseline: legacy child tables inherit tenant scope from their parent.

DO $$
DECLARE
  policy RECORD;
BEGIN
  FOR policy IN SELECT * FROM (VALUES
    ('cost_components', 'cost_sheet_versions', 'cost_sheet_id'),
    ('email_messages', 'email_threads', 'thread_id'),
    ('process_steps', 'process_definitions', 'process_id'),
    ('product_attributes', 'products', 'product_id'),
    ('quote_items', 'supplier_quotes', 'quote_id'),
    ('rfq_items', 'rfqs', 'rfq_id'),
    ('rfq_supplier_dispatches', 'rfqs', 'rfq_id'),
    ('scenario_inputs', 'cost_scenarios', 'scenario_id'),
    ('scenario_results', 'cost_scenarios', 'scenario_id'),
    ('supplier_contacts', 'suppliers', 'supplier_id')
  ) AS mapped(table_name, parent_table, parent_key)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_select_%I ON public.%I', policy.table_name, policy.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_select_%I ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.%I AS parent WHERE parent.id = %I.%I AND parent.organization_id = (SELECT private.current_organization_id())))',
      policy.table_name, policy.table_name, policy.parent_table, policy.table_name, policy.parent_key
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', policy.table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', policy.table_name);
  END LOOP;
END $$;
