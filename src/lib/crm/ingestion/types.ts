export type DatasetType = 'ACCOUNT_LIST' | 'TRANSACTION_HISTORY' | 'MIXED_TRANSACTIONAL_EXPORT';

export type ImportJobStatus =
  | 'UPLOADED'
  | 'MAPPED'
  | 'STAGED'
  | 'NEEDS_REVIEW'
  | 'READY'
  | 'COMMITTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type CustomerRowStatus = 'RESOLVED' | 'UNRESOLVED' | 'SKIPPED' | 'INVALID';

export type ProductRowStatus = 'RESOLVED_CUP' | 'RESOLVED_NON_CUP' | 'PRODUCT_UNRESOLVED' | 'SKIPPED';

export type IngestionRowStatus =
  | 'READY'
  | 'CUSTOMER_UNRESOLVED'
  | 'PRODUCT_UNRESOLVED'
  | 'INVALID'
  | 'IGNORED';

export type TargetLifecycle = 'CUSTOMER' | 'PROSPECT';

export const ACCOUNT_CANONICAL_FIELDS = [
  'company_name',
  'contact_name',
  'phone',
  'email',
  'country_code',
  'city',
  'tax_id',
  'website',
] as const;

export type AccountCanonicalField = (typeof ACCOUNT_CANONICAL_FIELDS)[number];

export const TRANSACTION_CANONICAL_FIELDS = [
  'customer_name',
  'tax_id',
  'purchase_date',
  'product_description',
  'sku',
  'quantity',
  'document_number',
  'line_number',
  'unit_price',
  'total_value',
  'currency',
] as const;

export type TransactionCanonicalField = (typeof TRANSACTION_CANONICAL_FIELDS)[number];

export const ALL_CANONICAL_FIELDS = Array.from(
  new Set<string>([...ACCOUNT_CANONICAL_FIELDS, ...TRANSACTION_CANONICAL_FIELDS]),
);

export type AnyCanonicalField = AccountCanonicalField | TransactionCanonicalField;

export interface InferredSchema {
  dataset_type: DatasetType;
  sheet_name: string;
  header_row_index: number;
  mapping: Record<string, number | null>;
  confidence: Record<string, number | null>;
}

export interface CrmImportJob {
  id: string;
  organization_id: string;
  filename: string;
  target_lifecycle: TargetLifecycle;
  dataset_type: DatasetType;
  status: ImportJobStatus;
  sheet_name: string | null;
  header_row_index: number | null;
  mapping_json: Record<string, number | null>;
  total_rows: number;
  resolved_rows: number;
  pending_rows: number;
  invalid_rows: number;
  ignored_rows: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  committed_at: string | null;
}

export interface CrmImportRow {
  id: string;
  organization_id: string;
  job_id: string;
  row_index: number;
  customer_raw: string | null;
  tax_id_raw: string | null;
  contact_name_raw: string | null;
  phone_raw: string | null;
  email_raw: string | null;
  country_code_raw: string | null;
  city_raw: string | null;
  website_raw: string | null;
  purchase_date: string | null;
  product_raw: string | null;
  sku_raw: string | null;
  quantity: number | null;
  document_number: string | null;
  line_number: number | null;
  unit_price: number | null;
  total_value: number | null;
  currency: string | null;
  company_id: string | null;
  sku: string | null;
  customer_status: CustomerRowStatus;
  product_status: ProductRowStatus;
  row_status: IngestionRowStatus;
  errors: string[];
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UnresolvedGroup {
  type: 'product' | 'customer';
  raw_value: string;
  normalized_value: string;
  occurrences: number;
  candidates: Array<{ id?: string; sku?: string; name: string }>;
}

export interface IngestionCockpitSummary {
  job_id: string;
  filename: string;
  dataset_type: DatasetType;
  target_lifecycle: TargetLifecycle;
  status: ImportJobStatus;
  sheet_name: string;
  header_row_index: number;
  columns: string[];
  mapping: Record<string, number | null>;
  total_movements: number;
  unique_clients_count: number;
  resolved_cups_count: number;
  resolved_non_cups_count: number;
  unresolved_products_count: number;
  unresolved_clients_count: number;
  invalid_rows_count: number;
  unresolved_product_groups: UnresolvedGroup[];
  unresolved_customer_groups: UnresolvedGroup[];
  errors_summary: Array<{ row_index: number; error: string }>;
  sample_rows: Array<Record<string, unknown>>;
  llm_inferred: boolean;
}

export interface BatchCommitResult {
  job_id: string;
  batch_index: number;
  total_batches: number;
  batch_size: number;
  inserted_companies: number;
  inserted_purchases: number;
  duplicate_purchases: number;
  errors: Array<{ row_index: number; error: string }>;
  status: ImportJobStatus;
}
