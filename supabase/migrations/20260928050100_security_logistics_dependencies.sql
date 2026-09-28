-- Security baseline: supplier master and append-only audit log.

DROP POLICY IF EXISTS tenant_select_suppliers ON public.suppliers;
CREATE POLICY tenant_select_suppliers
  ON public.suppliers
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT private.current_organization_id()));

DROP POLICY IF EXISTS audit_same_tenant_select ON public.audit_events;
CREATE POLICY audit_same_tenant_select
  ON public.audit_events
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT private.current_organization_id()));

REVOKE ALL ON TABLE public.suppliers, public.audit_events FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.suppliers, public.audit_events TO service_role;

ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_event_type_check;

ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_event_type_check CHECK (event_type IN (
    'battery_freeze', 'cost_edit', 'rfq_approval', 'email_sent', 'strategy_changes', 'budget_exceeded',
    'RFQ_CREATED', 'INVITATION_CREATED', 'INVITATION_SENT', 'INVITATION_OPENED', 'QUOTE_SUBMITTED',
    'QUOTE_UPDATED', 'RFQ_CLOSED', 'RATE_SELECTED', 'BOOKING_CREATED', 'BOOKING_REQUESTED',
    'BOOKING_CONFIRMED', 'BOOKING_STATUS_CHANGED', 'EXPORT_COST_CALCULATED'
  ));
