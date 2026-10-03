// Purchase Intelligence — tipos. Unidad de análisis: CLIENTE × SKU.

export interface CustomerPurchase {
  id: string;
  organization_id: string;
  company_id: string;
  contact_id?: string | null;
  purchase_date: string; // YYYY-MM-DD
  external_document_id?: string | null;
  document_number?: string | null;
  line_number?: number | null;
  product_id?: string | null;
  sku: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price?: number | null;
  total_value?: number | null;
  currency?: string | null;
  source: string;
  fingerprint?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type RepurchaseStatus = 'ON_CYCLE' | 'CONTACT_SOON' | 'OVERDUE' | 'INSUFFICIENT_DATA';
export type CadenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SkuConsumption {
  company_id: string;
  sku: string;
  product_name: string;
  purchase_count: number;
  first_purchase_date: string;
  last_purchase_date: string;
  last_purchase_quantity: number;
  average_order_quantity: number;
  median_order_quantity: number;
  total_quantity_30d: number;
  total_quantity_90d: number;
  total_quantity_180d: number;
  total_quantity_365d: number;
  purchases_365d: number;
  average_order_value: number | null;
  total_value_365d: number;
  average_days_between_orders: number | null;
  median_days_between_orders: number | null;
  min_days_between_orders: number | null;
  max_days_between_orders: number | null;
  expected_next_purchase_at: string | null;
  days_until_expected_purchase: number | null;
  cadence_confidence: CadenceConfidence;
  repurchase_status: RepurchaseStatus;
}

export interface CustomerTotals {
  company_id: string;
  last_purchase_date: string | null;
  value_30d: number;
  value_90d: number;
  value_365d: number;
  active_skus: number;
  soon_count: number;
  overdue_count: number;
  worst_status: RepurchaseStatus | null;
  next_repurchase_at: string | null;
  next_repurchase_sku: string | null;
}

export interface RepurchaseAlert extends SkuConsumption {
  company_name: string;
  owner_profile_id?: string | null;
  expected_value: number | null;
}

export interface ImportRow {
  index: number;
  raw: Record<string, string>;
  cliente?: string | null;
  fecha?: string | null;
  producto?: string | null;
  cantidad?: number | null;
  company_id?: string | null;
  company_candidates?: Array<{ id: string; name: string }> | null;
  sku?: string | null;
  product_name?: string | null;
  sku_candidates?: Array<{ sku: string; name: string }> | null;
  errors: string[];
}
