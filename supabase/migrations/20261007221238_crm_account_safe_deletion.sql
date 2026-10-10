-- RECONCILED FROM PRODUCTION (supabase_migrations.schema_migrations, version 20261007221238).
-- This migration was applied directly to the production project and was missing from the repo.
-- It is recorded here verbatim so local/QA databases and production share one history.
-- It must NOT be re-applied to production (already present). Statements are idempotent.
--
-- Account deletion is separate from ingestion. No existing FK or data changes.
-- Only the server's service_role can call this SECURITY INVOKER function.
-- Any reference (including aliases, staging and outreach) blocks deletion.
-- Contacts are the sole cleanup exception, after checking ALL their real FKs.
CREATE OR REPLACE FUNCTION public.crm_account_deletion(
  p_organization_id uuid, p_company_id uuid, p_execute boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  account_name text;
  dependency_counts jsonb := '{"purchases":0,"opportunities":0,"conversations":0,"leads":0,"tasks":0,"activities":0,"aliases":0,"staged_rows":0,"campaign_recipients":0,"shared_contacts":0,"other":0}';
  reference_counts jsonb := '{}';
  contact_count bigint;
  foreign_contact_count bigint;
  dependent_count bigint;
  deleted_contact_count bigint := 0;
  dependency_key text;
  dependency record;
  result jsonb;
BEGIN
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'ORGANIZATION_REQUIRED'; END IF;
  IF p_execute IS NULL THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
  IF p_execute THEN
    -- FOR UPDATE conflicts with FK key-share locks: new references cannot slip
    -- between the final inspection and deletion. Lock company before contacts.
    SELECT name INTO account_name FROM public.crm_companies
      WHERE id = p_company_id AND organization_id = p_organization_id FOR UPDATE;
  ELSE
    SELECT name INTO account_name FROM public.crm_companies
      WHERE id = p_company_id AND organization_id = p_organization_id;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('company_id',p_company_id,'name','','status','NOT_FOUND',
      'dependencies',dependency_counts,'references',reference_counts,'contacts',0,
      'deleted',false,'deleted_contacts',0);
  END IF;
  IF p_execute THEN
    PERFORM id FROM public.crm_contacts WHERE company_id = p_company_id ORDER BY id FOR UPDATE;
  END IF;
  SELECT count(*) FILTER (WHERE organization_id = p_organization_id),
         count(*) FILTER (WHERE organization_id <> p_organization_id)
    INTO contact_count, foreign_contact_count
    FROM public.crm_contacts WHERE company_id = p_company_id;
  dependency_counts := jsonb_set(dependency_counts, '{shared_contacts}', to_jsonb(foreign_contact_count));

  -- Discover actual constraints, including future tables and composite FKs.
  -- Count each dependent row once even if it references both company/contact.
  -- Deliberately inspect references from ALL tenants to avoid destroying shared
  -- or incorrectly linked data. Only owned contacts can ever be deleted.
  FOR dependency IN
    SELECT child_ns.nspname AS schema_name, child.relname AS table_name,
      string_agg(pg_catalog.format(
        'EXISTS (SELECT 1 FROM %I.%I parent WHERE %s AND %s)',
        parent_ns.nspname, parent_table.relname,
        CASE WHEN fk.confrelid = 'public.crm_companies'::regclass
          THEN 'parent.id = $1' ELSE 'parent.company_id = $1' END,
        (SELECT string_agg(pg_catalog.format('child.%I = parent.%I', ca.attname, pa.attname), ' AND ')
         FROM unnest(fk.conkey, fk.confkey) AS keys(child_key, parent_key)
         JOIN pg_catalog.pg_attribute ca ON ca.attrelid = fk.conrelid AND ca.attnum = keys.child_key
         JOIN pg_catalog.pg_attribute pa ON pa.attrelid = fk.confrelid AND pa.attnum = keys.parent_key)
      ), ' OR ') AS predicate
    FROM pg_catalog.pg_constraint fk
    JOIN pg_catalog.pg_class child ON child.oid = fk.conrelid
    JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_catalog.pg_class parent_table ON parent_table.oid = fk.confrelid
    JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent_table.relnamespace
    WHERE fk.contype = 'f'
      AND fk.confrelid IN ('public.crm_companies'::regclass, 'public.crm_contacts'::regclass)
      AND NOT (fk.conrelid = 'public.crm_contacts'::regclass AND fk.confrelid = 'public.crm_companies'::regclass)
    GROUP BY child_ns.nspname, child.relname
    ORDER BY child_ns.nspname, child.relname
  LOOP
    EXECUTE pg_catalog.format('SELECT count(*) FROM %I.%I child WHERE %s',
      dependency.schema_name, dependency.table_name, dependency.predicate)
      INTO dependent_count USING p_company_id;
    IF dependent_count = 0 THEN CONTINUE; END IF;
    reference_counts := reference_counts || jsonb_build_object(
      dependency.schema_name || '.' || dependency.table_name, dependent_count);
    dependency_key := CASE dependency.schema_name || '.' || dependency.table_name
      WHEN 'public.crm_customer_purchases' THEN 'purchases'
      WHEN 'public.crm_opportunities' THEN 'opportunities'
      WHEN 'public.crm_conversations' THEN 'conversations'
      WHEN 'public.crm_leads' THEN 'leads'
      WHEN 'public.crm_tasks' THEN 'tasks'
      WHEN 'public.crm_activities' THEN 'activities'
      WHEN 'public.crm_customer_aliases' THEN 'aliases'
      WHEN 'public.crm_import_rows' THEN 'staged_rows'
      WHEN 'public.niupackbot_campaign_recipients' THEN 'campaign_recipients'
      ELSE 'other' END;
    dependency_counts := jsonb_set(dependency_counts, ARRAY[dependency_key],
      to_jsonb((dependency_counts->>dependency_key)::bigint + dependent_count));
  END LOOP;
  result := jsonb_build_object('company_id',p_company_id,'name',account_name,
    'dependencies',dependency_counts,'references',reference_counts,'contacts',contact_count,
    'deleted',false,'deleted_contacts',0);
  IF reference_counts <> '{}'::jsonb OR foreign_contact_count > 0 THEN
    RETURN result || '{"status":"BLOCKED_BY_BUSINESS_DATA"}'::jsonb;
  END IF;
  IF NOT p_execute THEN RETURN result || '{"status":"SAFE_TO_DELETE"}'::jsonb; END IF;

  -- Explicit, narrow deletion; no cascade is used to clean business data.
  -- Both statements are in the same transaction; any failure rolls both back.
  DELETE FROM public.crm_contacts WHERE company_id = p_company_id AND organization_id = p_organization_id;
  GET DIAGNOSTICS deleted_contact_count = ROW_COUNT;
  DELETE FROM public.crm_companies WHERE id = p_company_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_CHANGED_BEFORE_DELETE'; END IF;
  RETURN result || jsonb_build_object('status','DELETED','deleted',true,'deleted_contacts',deleted_contact_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_account_deletion_batch(
  p_organization_id uuid, p_company_ids uuid[], p_execute boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE account_id uuid; results jsonb := '[]'; account_result jsonb;
BEGIN
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'ORGANIZATION_REQUIRED'; END IF;
  IF p_execute IS NULL THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
  IF cardinality(p_company_ids) IS NULL OR cardinality(p_company_ids) NOT BETWEEN 1 AND 500
     OR array_position(p_company_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_COMPANY_IDS';
  END IF;
  -- Consistent lock order; one roundtrip for up to 500 accounts.
  FOR account_id IN SELECT DISTINCT id FROM unnest(p_company_ids) id ORDER BY id LOOP
    BEGIN
      account_result := public.crm_account_deletion(p_organization_id, account_id, p_execute);
    EXCEPTION WHEN OTHERS THEN
      IF NOT p_execute THEN RAISE; END IF;
      -- Exception subtransaction rolls back this account's contact/company
      -- cleanup without losing successful accounts elsewhere in the batch.
      account_result := jsonb_build_object('company_id',account_id,'status','FAILED',
        'name','','dependencies',public.crm_account_deletion(p_organization_id,NULL,false)->'dependencies',
        'references','{}'::jsonb,'contacts',0,'deleted',false,'deleted_contacts',0);
    END;
    results := results || jsonb_build_array(account_result);
  END LOOP;
  RETURN results;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_account_deletion(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_account_deletion_batch(uuid,uuid[],boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_account_deletion(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_account_deletion_batch(uuid,uuid[],boolean) TO service_role;
COMMENT ON FUNCTION public.crm_account_deletion(uuid,uuid,boolean) IS
  'Server-only atomic account/contact cleanup. Any actual FK dependency blocks; aliases/staging/history remain untouched.';
NOTIFY pgrst, 'reload schema';
