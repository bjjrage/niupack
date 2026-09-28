export type LogisticsMode = 'OCEAN' | 'ROAD';
export type LogisticsRateSource = 'SEARATES_API' | 'OTHER_API' | 'PROVIDER_RFQ' | 'CONTRACT_RATE' | 'MANUAL_RATE';
export type LogisticsRateStatus = 'INDICATIVE' | 'CONFIRMED' | 'SELECTED' | 'EXPIRED' | 'BOOKING_REQUESTED' | 'BOOKED';
export type LogisticsRfqStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_RESPONDED' | 'CLOSED' | 'CANCELLED';
export type LogisticsInvitationStatus = 'PENDING' | 'OPENED' | 'RESPONDED' | 'EXPIRED' | 'REVOKED';
export type LogisticsQuoteStatus = 'RECEIVED' | 'PARTIAL' | 'CONFIRMED' | 'SELECTED' | 'REJECTED' | 'EXPIRED';
export type EquipmentType = 'FTL' | 'LTL' | 'TRUCK' | 'SEMI' | 'OTHER';
export type OceanEquipment = '20GP' | '40GP' | '40HC' | 'LCL';

export interface LocationRef { country: string; city?: string; address?: string; port?: string }
export interface RateComponents {
  pickup?: number;
  origin_charges?: number;
  main_freight?: number;
  border_charges?: number;
  destination_delivery?: number;
  insurance?: number;
  other_charges?: number;
}

export interface LogisticsRate {
  id: string;
  organization_id: string;
  origin: LocationRef;
  destination: LocationRef;
  mode: LogisticsMode;
  supplier_id?: string;
  amount: number;
  currency: string;
  valid_from?: string;
  valid_until?: string;
  transit_days?: number;
  weight_kg?: number;
  volume_m3?: number;
  equipment?: string;
  source: LogisticsRateSource;
  status: LogisticsRateStatus;
  source_reference?: string;
  components: RateComponents;
  fx_source?: string;
  fx_rate?: number;
  fx_timestamp?: string;
  created_at: string;
  updated_at: string;
}

export type LogisticsBookingStatus = 'QUOTE' | 'SELECTED' | 'BOOKING_REQUESTED' | 'BOOKED' | 'IN_TRANSIT' | 'ARRIVED' | 'CANCELLED';
export interface LogisticsBooking {
  id: string;
  organization_id: string;
  rate_id: string;
  status: LogisticsBookingStatus;
  booking_number?: string;
  bill_of_lading?: string;
  container_number?: string;
  provider_reference?: string;
  created_at: string;
  updated_at: string;
}

export interface FreightSearchInput {
  origin: LocationRef;
  destination: LocationRef;
  shipment_date: string;
  load_type: 'FCL' | 'LCL';
  equipment: OceanEquipment;
  weight_kg: number;
  volume_m3: number;
}

export interface RateSearchResult {
  provider: string;
  status: 'OK' | 'NOT_CONFIGURED' | 'ERROR';
  rates: LogisticsRate[];
  message?: string;
}

export interface FreightRateProvider {
  readonly code: LogisticsRateSource;
  searchRates(input: FreightSearchInput, organizationId: string): Promise<RateSearchResult>;
}

export interface LogisticsRfq {
  id: string;
  organization_id: string;
  code: string;
  status: LogisticsRfqStatus;
  origin_country: string;
  origin_city: string;
  origin_address?: string;
  destination_country: string;
  destination_city: string;
  destination_address?: string;
  pickup_date: string;
  delivery_target_date?: string;
  cargo_description: string;
  weight_kg: number;
  volume_m3: number;
  pallet_count: number;
  equipment_type: EquipmentType;
  transport_mode: 'ROAD';
  commercial_term: string;
  notes?: string;
  quote_deadline: string;
  currency_preferences: string[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface LogisticsInvitation {
  id: string;
  organization_id: string;
  rfq_id: string;
  supplier_id: string;
  token_hash: string;
  status: LogisticsInvitationStatus;
  expires_at: string;
  opened_at?: string;
  responded_at?: string;
  revoked_at?: string;
  email_status: 'SENT' | 'EMAIL_NOT_CONFIGURED' | 'SEND_FAILED';
  created_at: string;
}

export interface LogisticsQuote extends RateComponents {
  id: string;
  organization_id: string;
  rfq_id: string;
  invitation_id: string;
  supplier_id: string;
  supplier_name?: string;
  status: LogisticsQuoteStatus;
  currency: string;
  quoted_total: number;
  normalized_total?: number;
  transit_days?: number;
  valid_from?: string;
  valid_until?: string;
  notes?: string;
  contact_name: string;
  contact_email?: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export type TaxTreatment = 'RECOVERABLE' | 'NON_RECOVERABLE' | 'PARTIALLY_RECOVERABLE' | 'EXEMPT' | 'NOT_APPLICABLE' | 'UNCLASSIFIED';
export interface ExportCostComponent {
  id: string;
  label: string;
  amount: number;
  tax_treatment: TaxTreatment;
  recoverable_percent?: number;
}
export interface ExportCostInput {
  sku: string;
  quantity: number;
  manufacturing_components: ExportCostComponent[];
  export_specific_costs: number;
  logistics_rate?: LogisticsRate;
  units_per_box: number;
  boxes_per_pallet?: number;
  total_m3: number;
  total_weight_kg: number;
  fx_source: string;
  fx_rate: number;
  fx_timestamp: string;
}
export interface ExportCostResult {
  cash_cost: number;
  recoverable_tax: number;
  export_specific_cost: number;
  logistics_cost: number;
  economic_export_cost: number;
  freight_per_unit: number;
  freight_per_box: number;
  freight_per_pallet?: number;
  freight_per_m3: number;
  freight_per_kg: number;
  unclassified_component_ids: string[];
}
