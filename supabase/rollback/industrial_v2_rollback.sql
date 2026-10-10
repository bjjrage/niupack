-- ROLLBACK of the industrial migrations 20261008000001 .. 20261010190000.
-- NOT a migration (kept outside supabase/migrations on purpose). Run manually, in one transaction,
-- only if the release must be undone.
--
-- Scope: removes ONLY objects created by those migrations. It never touches pre-existing tables'
-- rows. Tested in scripts/qa-local/compat.mjs: after applying and rolling back, every pre-existing
-- table has the identical rows and schema signature as before.
--
-- WARNING: this DROPS the industrial tables, including any salaries, sessions and snapshots entered
-- after the release. If real industrial data exists, export it first (see docs/industrial-integration-status.md).
BEGIN;

DROP INDEX IF EXISTS public.idx_cost_sheet_versions_one_active_per_org_sku;
ALTER TABLE public.cost_sheet_versions
  DROP COLUMN IF EXISTS true_unit_cost_pyg,
  DROP COLUMN IF EXISTS fx_rate_used;

DROP TABLE IF EXISTS
  public.packing_session_events,
  public.packing_labor_allocations,
  public.packing_session_segments,
  public.packing_sessions,
  public.packing_operator_tokens,
  public.industrial_idempotency_requests,
  public.industrial_process_snapshot_revisions,
  public.industrial_process_snapshots,
  public.plant_production_periods,
  public.plant_personnel_salary_assignments,
  public.plant_personnel_assignments,
  public.plant_personnel,
  public.plant_salary_band_rates,
  public.plant_salary_bands,
  public.plant_process_parameters
CASCADE;

-- Functions last: policies on the dropped tables depend on private.current_user_is_org_admin().
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'public' AND p.proname IN (
      'apply_industrial_cost_to_cost_intelligence_atomic', 'approve_packing_session_with_labor_atomic',
      'assert_industrial_production_basis', 'change_packing_headcount_atomic',
      'claim_industrial_idempotency_request', 'correct_packing_session_atomic',
      'create_plant_personnel_with_assignments', 'create_plant_salary_band_with_rate',
      'finish_industrial_idempotency_request', 'packing_session_json',
      'save_industrial_process_snapshot_atomic', 'save_plant_personnel_assignment',
      'save_plant_personnel_assignment_unlocked_20261010', 'save_plant_personnel_salary_assignment',
      'save_plant_personnel_salary_assignment_unlocked_20261010', 'start_packing_session_atomic',
      'stop_packing_session_atomic', 'update_plant_personnel_with_salary',
      'update_plant_personnel_with_salary_unlocked_20261010', 'update_plant_salary_band_with_rate',
      'validate_packing_operator_token', 'void_packing_session_atomic', 'write_industrial_process_snapshot'))
       OR (n.nspname = 'private' AND p.proname = 'current_user_is_org_admin')
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END;
$$;

-- Migration history: Supabase records applied migrations by name with its own timestamp.
DELETE FROM supabase_migrations.schema_migrations
WHERE name IN ('industrial_processes_v2', 'salary_bands_and_personnel', 'personnel_salary_process_separation',
               'industrial_salary_personnel_atomic_persistence', 'packing_session_atomic_workflow',
               'restrict_salary_tables_to_admins');

NOTIFY pgrst, 'reload schema';
COMMIT;
