ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_uidx
  ON profiles(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.current_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT p.organization_id
  FROM public.profiles AS p
  WHERE p.auth_user_id = auth.uid()
     OR (p.auth_user_id IS NULL AND lower(p.email) = lower(coalesce(auth.email(), '')))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_organization_id() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_organization_id() TO authenticated, service_role;

ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_event_type_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_event_type_check CHECK (event_type IN (
  'battery_freeze', 'cost_edit', 'rfq_approval', 'email_sent', 'strategy_changes', 'budget_exceeded',
  'RFQ_CREATED', 'INVITATION_CREATED', 'INVITATION_SENT', 'INVITATION_OPENED', 'QUOTE_SUBMITTED',
  'QUOTE_UPDATED', 'RFQ_CLOSED', 'RATE_SELECTED', 'BOOKING_CREATED', 'BOOKING_REQUESTED',
  'BOOKING_CONFIRMED', 'BOOKING_STATUS_CHANGED', 'EXPORT_COST_CALCULATED'
));

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'logistics_provider_profiles',
    'logistics_provider_routes',
    'logistics_rfqs',
    'logistics_rfq_invitations',
    'logistics_rfq_quotes',
    'logistics_rates',
    'logistics_bookings',
    'export_cost_adjustments'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_isolation_' || table_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (organization_id = (SELECT private.current_organization_id())) WITH CHECK (organization_id = (SELECT private.current_organization_id()))',
      'tenant_isolation_' || table_name,
      table_name
    );
  END LOOP;
END $$;

REVOKE ALL ON public.logistics_provider_profiles, public.logistics_provider_routes,
  public.logistics_rfqs, public.logistics_rfq_invitations, public.logistics_rfq_quotes,
  public.logistics_rates, public.logistics_bookings, public.export_cost_adjustments
  FROM anon;
