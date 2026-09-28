CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
  ON public.profiles (organization_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_organization_id
  ON public.suppliers (organization_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_organization_id
  ON public.audit_events (organization_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id
  ON public.audit_events (actor_id);
