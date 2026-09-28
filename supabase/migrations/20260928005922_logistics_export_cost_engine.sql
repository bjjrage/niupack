-- NIUPACK Logistics + Export Cost Engine
-- Server-only tables: public/anonymous Data API access is explicitly revoked.

CREATE TABLE logistics_provider_profiles (
  supplier_id UUID PRIMARY KEY REFERENCES suppliers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  countries TEXT[] NOT NULL DEFAULT '{}',
  equipment TEXT[] NOT NULL DEFAULT '{}',
  transport_modes TEXT[] NOT NULL DEFAULT '{}',
  currencies TEXT[] NOT NULL DEFAULT '{}',
  contact_emails TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE logistics_provider_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  origin_country TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_id, origin_country, destination_country)
);

CREATE TABLE logistics_rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','OPEN','PARTIALLY_RESPONDED','CLOSED','CANCELLED')),
  origin_country TEXT NOT NULL,
  origin_city TEXT NOT NULL,
  origin_address TEXT,
  destination_country TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  destination_address TEXT,
  pickup_date DATE NOT NULL,
  delivery_target_date DATE,
  cargo_description TEXT NOT NULL,
  weight_kg NUMERIC(14,3) NOT NULL CHECK (weight_kg >= 0),
  volume_m3 NUMERIC(14,4) NOT NULL CHECK (volume_m3 >= 0),
  pallet_count INTEGER NOT NULL DEFAULT 0 CHECK (pallet_count >= 0),
  equipment_type TEXT NOT NULL CHECK (equipment_type IN ('FTL','LTL','TRUCK','SEMI','OTHER')),
  transport_mode TEXT NOT NULL DEFAULT 'ROAD' CHECK (transport_mode = 'ROAD'),
  commercial_term TEXT NOT NULL,
  notes TEXT,
  quote_deadline TIMESTAMPTZ NOT NULL,
  currency_preferences TEXT[] NOT NULL DEFAULT ARRAY['USD'],
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE logistics_rfq_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rfq_id UUID NOT NULL REFERENCES logistics_rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('PENDING','OPENED','RESPONDED','EXPIRED','REVOKED')),
  expires_at TIMESTAMPTZ NOT NULL,
  opened_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  email_status TEXT NOT NULL DEFAULT 'EMAIL_NOT_CONFIGURED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rfq_id, supplier_id)
);

CREATE TABLE logistics_rfq_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rfq_id UUID NOT NULL REFERENCES logistics_rfqs(id) ON DELETE CASCADE,
  invitation_id UUID NOT NULL UNIQUE REFERENCES logistics_rfq_invitations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED','PARTIAL','CONFIRMED','SELECTED','REJECTED','EXPIRED')),
  currency TEXT NOT NULL,
  quoted_total NUMERIC(16,4) NOT NULL CHECK (quoted_total >= 0),
  normalized_total NUMERIC(16,4),
  transit_days INTEGER CHECK (transit_days >= 0),
  valid_from DATE,
  valid_until DATE,
  pickup NUMERIC(16,4),
  origin_charges NUMERIC(16,4),
  main_freight NUMERIC(16,4),
  border_charges NUMERIC(16,4),
  destination_delivery NUMERIC(16,4),
  insurance NUMERIC(16,4),
  other_charges NUMERIC(16,4),
  notes TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE logistics_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  origin JSONB NOT NULL,
  destination JSONB NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('OCEAN','ROAD')),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  amount NUMERIC(16,4) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL,
  valid_from DATE,
  valid_until DATE,
  transit_days INTEGER,
  weight_kg NUMERIC(14,3),
  volume_m3 NUMERIC(14,4),
  equipment TEXT,
  source TEXT NOT NULL CHECK (source IN ('SEARATES_API','OTHER_API','PROVIDER_RFQ','CONTRACT_RATE','MANUAL_RATE')),
  status TEXT NOT NULL CHECK (status IN ('INDICATIVE','CONFIRMED','SELECTED','EXPIRED','BOOKING_REQUESTED','BOOKED')),
  source_reference TEXT,
  components JSONB NOT NULL DEFAULT '{}'::jsonb,
  fx_source TEXT,
  fx_rate NUMERIC(18,6),
  fx_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE logistics_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rate_id UUID NOT NULL REFERENCES logistics_rates(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('QUOTE','SELECTED','BOOKING_REQUESTED','BOOKED','IN_TRANSIT','ARRIVED','CANCELLED')),
  booking_number TEXT,
  bill_of_lading TEXT,
  container_number TEXT,
  provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE export_cost_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  quantity NUMERIC(16,4) NOT NULL CHECK (quantity > 0),
  logistics_rate_id UUID REFERENCES logistics_rates(id) ON DELETE RESTRICT,
  cash_cost NUMERIC(16,6) NOT NULL,
  recoverable_tax NUMERIC(16,6) NOT NULL,
  export_specific_cost NUMERIC(16,6) NOT NULL,
  logistics_cost NUMERIC(16,6) NOT NULL,
  economic_export_cost NUMERIC(16,6) NOT NULL,
  components JSONB NOT NULL,
  fx_source TEXT NOT NULL,
  fx_rate NUMERIC(18,6) NOT NULL,
  fx_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logistics_rfqs_org_status ON logistics_rfqs(organization_id, status);
CREATE INDEX idx_logistics_invitations_rfq ON logistics_rfq_invitations(rfq_id, status);
CREATE INDEX idx_logistics_quotes_rfq ON logistics_rfq_quotes(rfq_id, status);
CREATE INDEX idx_logistics_rates_route ON logistics_rates(organization_id, mode, created_at DESC);
CREATE INDEX idx_logistics_rates_validity ON logistics_rates(valid_until, status);
CREATE INDEX idx_logistics_bookings_status ON logistics_bookings(organization_id, status);
CREATE INDEX idx_export_cost_sku ON export_cost_adjustments(organization_id, sku, created_at DESC);

ALTER TABLE logistics_provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_provider_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_rfq_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_rfq_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_cost_adjustments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON logistics_provider_profiles, logistics_provider_routes, logistics_rfqs,
  logistics_rfq_invitations, logistics_rfq_quotes, logistics_rates,
  logistics_bookings, export_cost_adjustments FROM anon, authenticated;
GRANT ALL ON logistics_provider_profiles, logistics_provider_routes, logistics_rfqs,
  logistics_rfq_invitations, logistics_rfq_quotes, logistics_rates,
  logistics_bookings, export_cost_adjustments TO service_role;
