-- Cover logistics foreign keys used by deletes, joins and tenant-scoped queries.
CREATE INDEX IF NOT EXISTS idx_logistics_provider_profiles_org
  ON logistics_provider_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_logistics_provider_routes_org
  ON logistics_provider_routes(organization_id);
CREATE INDEX IF NOT EXISTS idx_logistics_invitations_org
  ON logistics_rfq_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_logistics_invitations_supplier
  ON logistics_rfq_invitations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_logistics_quotes_org
  ON logistics_rfq_quotes(organization_id);
CREATE INDEX IF NOT EXISTS idx_logistics_quotes_supplier
  ON logistics_rfq_quotes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_logistics_rates_supplier
  ON logistics_rates(supplier_id);
CREATE INDEX IF NOT EXISTS idx_logistics_bookings_rate
  ON logistics_bookings(rate_id);
CREATE INDEX IF NOT EXISTS idx_export_cost_adjustments_rate
  ON export_cost_adjustments(logistics_rate_id);
