// ====================================================================
// NIU INTELLIGENCE OS - DOMAIN TYPES
// Core data structures for all 4 engines + Strategy + Actions
// ====================================================================

export type MarketCode = 'BR' | 'AR' | 'BO' | 'PY';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'analyst' | 'operator' | 'executive';
  avatar_url?: string;
}

export interface Brand {
  id: string;
  organization_id: string;
  name: string;
  legal_name: string;
  country_of_origin: string;
  website_url: string;
  description?: string;
  is_primary: boolean;
}

export interface Market {
  id: string;
  organization_id: string;
  code: MarketCode;
  name: string;
  primary_city: string;
  currency: string;
  timezone: string;
  is_active: boolean;
  is_control: boolean;
}

export type ProductCategory = 'cups' | 'lids' | 'bowls' | 'trays' | 'thermoformed' | 'custom';

export interface Product {
  id: string;
  organization_id: string;
  brand_id?: string;
  code: string;
  name: string;
  category: ProductCategory;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductAttribute {
  id: string;
  product_id: string;
  sku: string;
  size_oz?: number;
  size_ml?: number;
  height_mm?: number;
  top_diameter_mm?: number;
  bottom_diameter_mm?: number;
  material: string;
  paper_weight_gsm?: number;
  coating: string;
  wall_type: 'single' | 'double' | 'n/a';
  max_colors: number;
  pack_quantity: number;
  carton_quantity: number;
  compatible_lids?: string;
  moq: number;
  notes?: string;
}

// ==========================================
// 1. AI VISIBILITY TYPES
// ==========================================

export type QueryCategory =
  | 'proveedor'
  | 'fabricante'
  | 'producto'
  | 'geográfica'
  | 'comparativa'
  | 'aplicación'
  | 'food service'
  | 'volumen'
  | 'mayorista'
  | 'personalización'
  | 'marca privada'
  | 'importación/exportación'
  | 'suministro regional'
  | 'precio'
  | 'grandes compradores';

export type QueryStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'ACTIVE';

export interface QueryBattery {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  description?: string;
  version: number;
  is_frozen: boolean;
  frozen_at?: string;
  frozen_by?: string;
  query_count: number;
  market_codes: MarketCode[];
  battery_type?: 'FROZEN_MEASUREMENT' | 'DYNAMIC_DISCOVERY';
  status: 'DRAFT' | 'APPROVED' | 'FROZEN' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

export interface QueryItem {
  id: string;
  battery_id: string;
  organization_id: string;
  text: string;
  language: 'pt' | 'es' | 'en';
  country_code: MarketCode;
  city_context: string;
  intent: string;
  category: QueryCategory | string;
  product_id?: string;
  sku?: string;
  buyer_persona: string;
  commercial_priority: 'HIGH' | 'MEDIUM' | 'LOW';
  generated_by: 'AI' | 'MANUAL';
  generation_source?: 'AI_DYNAMIC' | 'TEMPLATE_FALLBACK';
  is_fixed: boolean;
  version: number;
  status: QueryStatus;
  created_at: string;
  updated_at: string;
}

export interface QueryRun {
  id: string;
  organization_id: string;
  battery_id: string;
  name: string;
  execution_label?: 'DAY_1' | 'DAY_15' | 'DAY_30' | 'CUSTOM' | 'D1 BASELINE' | 'D15' | 'D30' | string;
  market_codes: MarketCode[];
  model: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
  is_simulated?: boolean;
  generation_source?: 'AI_DYNAMIC' | 'TEMPLATE_FALLBACK';
  total_queries: number;
  executed_queries: number;
  successful_queries: number;
  failed_queries: number;
  visibility_score?: number;
  mention_rate?: number;
  link_rate?: number;
  source_rate?: number;
  estimated_cost_usd: number;
  actual_cost_usd: number;
  max_spend_limit_usd: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  created_at: string;
}

export interface QueryResult {
  id: string;
  run_id: string;
  query_id: string;
  organization_id: string;
  country_code: MarketCode;
  model: string;
  model_used?: string;
  raw_prompt: string;
  raw_response: string;
  sources_json: Array<{ url: string; title: string; snippet?: string }>;
  search_queries_json: string[];
  tokens_input: number;
  tokens_output: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status?: string;
  error_message?: string;
  created_at: string;
}

export interface QueryMentionAnalysis {
  id: string;
  run_id?: string;
  result_id: string;
  query_id: string;
  organization_id: string;
  niupack_mentioned: boolean;
  niupack_linked: boolean;
  niupack_as_source?: boolean;
  niupack_sourced?: boolean;
  mention_count: number;
  position: 'FIRST' | 'EARLY' | 'MIDDLE' | 'LATE' | 'NONE' | number | string;
  sentiment_accuracy?: 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'NONE';
  sentiment?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  confidence_score?: number;
  analysis_notes?: string;
  competitors?: Array<{ name: string; domain?: string; order: number }>;
  competitors_mentioned?: string[];
  sources?: Array<{ url: string; domain: string; is_niupack: boolean }>;
  sources_cited?: string[];
}

export interface VisibilitySnapshot {
  id: string;
  organization_id: string;
  battery_id: string;
  run_id?: string;
  snapshot_day: 'DAY_1' | 'DAY_15' | 'DAY_30' | 'CUSTOM' | 'AD_HOC';
  execution_label?: 'DAY_1' | 'DAY_15' | 'DAY_30' | 'CUSTOM' | 'D1 BASELINE' | 'D15' | 'D30' | string;
  market_code: MarketCode | 'TOTAL';
  overall_score: number;
  visibility_score?: number;
  mention_rate: number;
  link_rate: number;
  source_rate: number;
  total_queries: number;
  won_queries?: number;
  won_queries_count?: number;
  lost_queries?: number;
  lost_queries_count?: number;
  competitor_share_json: Record<string, number>;
  top_sources_json: Array<{ domain: string; count: number }>;
  captured_at?: string;
  created_at?: string;
}

export interface DiagnosticCluster {
  id: string;
  market_code: MarketCode;
  product_or_category: string;
  intent_type: string;
  failed_query_count: number;
  evidence: string;
  hypothesis: string;
  suggested_action: string;
  dominant_competitors: string[];
  dominant_sources: string[];
}

export interface SearchDiscoveryCheck {
  url: string;
  accessible: boolean;
  http_status: number;
  robots_url: string;
  sitemap_url: string;
  robots_txt_exists: boolean;
  oai_searchbot_allowed: boolean;
  sitemap_exists: boolean;
  canonical_url?: string;
  canonical_classification: 'LIVE_SITE' | 'FUTURE_CANONICAL_DOMAIN' | 'OTHER_DOMAIN' | 'MISSING';
  future_canonical_domain: string;
  live_accessibility_status: 'GREEN' | 'YELLOW' | 'RED';
  ai_crawler_status: 'GREEN' | 'YELLOW' | 'RED';
  seo_readiness_status: 'GREEN' | 'YELLOW' | 'RED';
  future_domain_status: 'LIVE' | 'NOT_LIVE' | 'UNKNOWN';
  technical_checks: {
    http_accessible: boolean;
    response_code_ok: boolean;
    robots_txt: boolean;
    sitemap_xml: boolean;
    oai_searchbot_allowed: boolean;
    title: boolean;
    meta_description: boolean;
    h1: boolean;
    canonical: boolean;
    hreflang: boolean;
    organization_schema: boolean;
    website_schema: boolean;
    image_alt_coverage: boolean;
    internal_links: boolean;
    language_alternates: boolean;
    sitemap_urls: boolean;
    robots_sitemap_declaration: boolean;
    noindex_nofollow_absent: boolean;
    viewport: boolean;
    basic_seo_readiness: boolean;
  };
  title?: string;
  meta_description?: string;
  h1_count: number;
  image_count: number;
  images_missing_alt: number;
  internal_link_count: number;
  hreflang_urls: string[];
  sitemap_url_count: number;
  robots_sitemap_declared: boolean;
  noindex_or_nofollow: boolean;
  last_checked: string;
  overall_status: 'GREEN' | 'YELLOW' | 'RED';
  warnings: string[];
}

// ==========================================
// 2. MARKET INTELLIGENCE TYPES
// ==========================================

export type PriceSourceType =
  | 'FORMAL_QUOTE'
  | 'DIRECT_EMAIL'
  | 'SUPPLIER_CATALOG'
  | 'B2B_MARKETPLACE'
  | 'RETAIL';

export interface MarketPriceObservation {
  id: string;
  organization_id: string;
  country_code: MarketCode;
  supplier_id?: string;
  supplier_name?: string;
  product_id?: string;
  sku: string;
  quantity: number;
  moq?: number;
  original_price: number;
  original_currency: string;
  exchange_rate_to_usd: number;
  normalized_price_usd: number;
  normalized_unit_price_usd: number;
  observation_date: string;
  source_type: PriceSourceType;
  source_url?: string;
  source_reference?: string;
  incoterm?: string;
  taxes_included: boolean;
  freight_included: boolean;
  printing_included: boolean;
  tooling_cost_usd: number;
  payment_terms?: string;
  lead_time_days?: number;
  validity_date?: string;
  confidence_level: number;
  is_active: boolean;
  notes?: string;
}

export interface MarketBenchmark {
  sku: string;
  country_code: MarketCode;
  min_price_usd: number;
  median_price_usd: number;
  max_price_usd: number;
  weighted_benchmark_usd: number;
  observation_count: number;
  avg_confidence: number;
  volume_range: { min: number; max: number };
  last_updated: string;
}

// ==========================================
// 3. COST & PRICING INTELLIGENCE TYPES
// ==========================================

export type CostCategory =
  | 'materia_prima'
  | 'papel'
  | 'coating'
  | 'tintas'
  | 'impresion'
  | 'formado'
  | 'mano_de_obra'
  | 'maquina'
  | 'energia'
  | 'merma'
  | 'empaque'
  | 'almacenamiento'
  | 'flete_inbound'
  | 'flete_outbound'
  | 'aduana'
  | 'impuestos'
  | 'financiero'
  | 'comercial'
  | 'overhead'
  | 'setup'
  | 'herramental'
  | 'otros';

export type CostBasis =
  | 'PER_UNIT'
  | 'PER_1000'
  | 'PER_KG'
  | 'PER_TON'
  | 'PER_SHEET'
  | 'PER_M2'
  | 'PER_M3'
  | 'PER_BOX'
  | 'PER_CONTAINER'
  | 'FIXED'
  | 'PER_BATCH';

export type CostV1RubricKey =
  | 'raw_material'
  | 'printing_die_cut'
  | 'operational'
  | 'scrap'
  | 'depreciation'
  | 'packaging';

export type CostInputSource = 'MANUAL' | 'FORMULA' | 'QUOTE' | 'PROCESS';
export type CostV1Unit = 'PER_UNIT' | 'PER_1000' | 'TOTAL_BATCH' | 'PERCENT';

export interface CostV1RubricConfig {
  enabled: boolean;
  source: CostInputSource;
  unit: CostV1Unit;
  notes?: string;
}

export type CostV1RubricConfigMap = Record<CostV1RubricKey, CostV1RubricConfig>;

export interface CostV1RubricResult extends CostV1RubricConfig {
  key: CostV1RubricKey;
  label: string;
  impact_usd_per_unit: number;
  impact_usd_batch: number;
}

export interface DualCurrencyValue {
  amount_original: number;
  currency_original: string;
  fx_rate_used: number;
  amount_usd: number;
  amount_pyg: number;
  formatted_usd?: string;
  formatted_pyg?: string;
}

export interface CostComponent {
  id: string;
  cost_sheet_id: string;
  category: CostCategory;
  name: string;
  component_type: 'FIXED' | 'VARIABLE';
  basis: CostBasis;
  rate_usd: number;
  quantity: number;
  unit_of_measure: string;
  normalized_unit_cost_usd?: number;
  normalized_unit_cost_pyg?: number;
  currency?: string;
  effective_date: string;
  notes?: string;
}

export interface CostSheetVersion {
  id: string;
  organization_id: string;
  product_id?: string;
  sku: string;
  version: number;
  name: string;
  batch_size: number;
  effective_date: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  true_unit_cost_usd: number;
  true_unit_cost_pyg?: number;
  fx_rate_id?: string;
  fx_rate_used?: number;
  minimum_sustainable_price_usd: number;
  minimum_sustainable_price_pyg?: number;
  break_even_units: number;
  components?: CostComponent[];
  notes?: string;
}

export interface ProcessStep {
  id: string;
  process_id: string;
  step_order: number;
  name: string;
  machine_name: string;
  operators_count: number;
  cycle_time_seconds: number;
  setup_time_minutes: number;
  capacity_units_per_hour: number;
  energy_kwh_per_hour: number;
  hourly_cost_usd: number;
  scrap_rate_percent: number; // merma
  yield_percent: number;
  is_bottleneck: boolean;
  notes?: string;
}

export interface ProcessDefinition {
  id: string;
  organization_id: string;
  sku: string;
  name: string;
  description?: string;
  is_active: boolean;
  steps: ProcessStep[];
}

export interface CostScenario {
  id: string;
  organization_id: string;
  cost_sheet_id: string;
  sku: string;
  name: string;
  description?: string;
  base_unit_cost_usd: number;
  simulated_unit_cost_usd: number;
  base_margin_percent: number;
  simulated_margin_percent: number;
  target_price_usd: number;
  price_gap_usd: number;
  price_gap_percent: number;
  annual_impact_usd: number;
  inputs: {
    batch_size: number;
    raw_material_delta_percent: number;
    scrap_delta_percent: number;
    efficiency_delta_percent: number;
    margin_target_percent: number;
    freight_delta_percent: number;
    exchange_rate_delta_percent: number;
  };
}

export interface EfficiencyOpportunity {
  id: string;
  title: string;
  component_or_process: string;
  current_metric: string;
  target_metric: string;
  annual_savings_usd: number;
  ease_score: 1 | 2 | 3 | 4 | 5; // 5 = trivial, 1 = very difficult
  investment_required_usd: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  implementation_time_weeks: number;
  roi_score: number;
}

export type PricingStrategyType =
  | 'TARGET_MARGIN'
  | 'MARKET_MATCH'
  | 'PENETRATION_PRICE'
  | 'VOLUME_PRICE'
  | 'CONTRACT_PRICE'
  | 'MINIMUM_DEFENSIBLE_PRICE'
  | 'PREMIUM';

export interface PricingStrategyResult {
  strategy: PricingStrategyType;
  title: string;
  unit_cost_usd: number;
  suggested_price_usd: number;
  margin_percent: number;
  margin_usd: number;
  market_benchmark_usd: number;
  price_gap_usd: number;
  price_gap_percent: number;
  assumptions: string;
}

// ==========================================
// 4. RFQ INTELLIGENCE TYPES
// ==========================================

export type SupplierStatus =
  | 'DISCOVERED'
  | 'REVIEWED'
  | 'APPROVED_FOR_CONTACT'
  | 'CONTACTED'
  | 'RESPONDED'
  | 'INVALID';

export interface Supplier {
  id: string;
  organization_id: string;
  name: string;
  country_code: MarketCode | 'OTHER';
  city?: string;
  website?: string;
  email?: string;
  phone?: string;
  contact_name?: string;
  contact_page?: string;
  status: SupplierStatus;
  human_authorized_contact?: boolean;
  discovery_source: string;
  discovery_evidence?: string;
  notes?: string;
}

export type RFQStatus =
  | 'DRAFT'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'SENT'
  | 'REPLIED'
  | 'PARSED'
  | 'BENCHMARKED'
  | 'CANCELLED';

export interface RFQItem {
  id: string;
  rfq_id: string;
  sku: string;
  quantity: number;
  alternative_quantities: number[];
  material: string;
  printing_spec: string;
  color_count: number;
  packaging_spec?: string;
  tooling_requirements?: string;
  notes?: string;
}

export interface RFQ {
  id: string;
  organization_id: string;
  code: string;
  title: string;
  status: RFQStatus;
  delivery_destination: string;
  incoterm: 'EXW' | 'FOB' | 'CIF' | 'CIP' | 'DDP';
  target_lead_time_days: number;
  payment_terms: string;
  validity_date?: string;
  notes?: string;
  items: RFQItem[];
  suppliers_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SupplierQuote {
  id: string;
  organization_id: string;
  rfq_id?: string;
  supplier_id: string;
  supplier_name?: string;
  quote_reference?: string;
  raw_quote_text?: string;
  currency: string;
  incoterm: string;
  freight_included: boolean;
  printing_included: boolean;
  tooling_cost: number;
  payment_terms?: string;
  lead_time_days?: number;
  validity_date?: string;
  status: 'EXTRACTED' | 'REVIEWED' | 'ACCEPTED' | 'REJECTED';
  confidence_score: number;
  operator_notes?: string;
  items: Array<{
    sku: string;
    quantity: number;
    unit_price: number;
    normalized_unit_price_usd: number;
    moq?: number;
    lead_time_days?: number;
  }>;
  created_at: string;
}

// ==========================================
// 5. STRATEGY & ACTIONS TYPES
// ==========================================

export interface StrategyMatrixRow {
  country_code: MarketCode;
  country_name: string;
  sku: string;
  sku_name: string;
  visibility_score: number;
  market_benchmark_usd: number;
  benchmark_confidence: number;
  niupack_cost_usd: number;
  current_sell_price_usd: number;
  target_price_usd: number;
  price_gap_usd: number;
  price_gap_percent: number;
  margin_percent: number;
  critical_drivers: string[];
  recommended_scenario: string;
  strategic_recommendation: string;
  competitive_status: 'COMPETITIVE' | 'PARITY' | 'DISADVANTAGE' | 'CRITICAL';
}

export type ActionType =
  | 'visibility_check'
  | 'query_battery_update'
  | 'supplier_research'
  | 'rfq_followup'
  | 'cost_data_missing'
  | 'efficiency_review'
  | 'pricing_review'
  | 'market_gap_review';

export interface ActionItem {
  id: string;
  organization_id: string;
  action_type: ActionType;
  title: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string;
  recommended_action: string;
  owner: string;
  due_date?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';
  market_code?: MarketCode;
  sku?: string;
  related_object_id?: string;
  created_at: string;
}

// ==========================================
// 6. JOBS & AUDIT TYPES
// ==========================================

export type JobType =
  | 'generate_query_battery'
  | 'execute_visibility_run'
  | 'analyze_visibility_result'
  | 'discover_suppliers'
  | 'sync_mailbox'
  | 'parse_supplier_reply'
  | 'normalize_quote'
  | 'recalculate_market_benchmark'
  | 'recalculate_cost_sheet'
  | 'run_scenario'
  | 'build_strategy_snapshot';

export interface JobRun {
  id: string;
  organization_id: string;
  job_type: JobType;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
  progress_percent: number;
  retries: number;
  max_retries: number;
  last_error?: string;
  started_at?: string;
  completed_at?: string;
  idempotency_key?: string;
  payload: Record<string, any>;
  result?: Record<string, any>;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  organization_id: string;
  actor_id?: string;
  event_type:
    | 'battery_freeze'
    | 'cost_edit'
    | 'rfq_approval'
    | 'email_sent'
    | 'strategy_changes'
    | 'budget_exceeded'
    | 'RFQ_CREATED'
    | 'INVITATION_CREATED'
    | 'INVITATION_SENT'
    | 'INVITATION_OPENED'
    | 'QUOTE_SUBMITTED'
    | 'QUOTE_UPDATED'
    | 'RFQ_CLOSED'
    | 'RATE_SELECTED'
    | 'BOOKING_CREATED'
    | 'BOOKING_REQUESTED'
    | 'BOOKING_CONFIRMED'
    | 'BOOKING_STATUS_CHANGED'
    | 'EXPORT_COST_CALCULATED';
  target_entity: string;
  entity_id: string;
  metadata: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface SystemSettings {
  max_queries_per_run: number;
  max_concurrency: number;
  max_spend_per_run_usd: number;
  max_monthly_spend_usd: number;
  current_month_spend_usd: number;
  openai_model_visibility: string;
  openai_model_analysis: string;
  gmail_connected: boolean;
  openai_api_key?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_secure?: boolean;
  smtp_from_email?: string;
  smtp_from_name?: string;
}

// ==========================================
// 7. INDUSTRIAL PAPER & COST ENGINE TYPES
// ==========================================

export interface IndustrialPaperFormula {
  fob_price_ton_usd?: number;         // USD por tonelada FOB (origen). CIF = FOB + flete
  freight_ton_usd?: number;           // USD por tonelada de flete internacional
  cif_price_ton_usd: number;          // USD por tonelada CIF
  customs_dispatch_percent?: number;  // % Despacho / Gastos de importación (default 13%)
  customs_dispatch_ton_usd?: number;  // USD por tonelada despacho / aduana (calculado como CIF * 13%)
  financial_cost_percent?: number;    // % Costo del dinero (default 6%)
  financial_cost_ton_usd?: number;    // USD por tonelada costo del dinero (calculado como CIF * 6%)
  printing_method: 'OFFSET' | 'FLEXO';
  // Offset specific
  sheet_width_mm?: number;            // Ancho pliego mm (ej. 700)
  sheet_height_mm?: number;           // Largo pliego mm (ej. 1000)
  gsm: number;                        // Gramaje papel (ej. 260)
  coating_gsm?: number;               // Recubrimiento PE (ej. 18)
  units_per_sheet?: number;           // Conos x pliego
  // Flexo specific
  web_width_mm?: number;              // Ancho de bobina mm
  units_per_linear_meter?: number;    // Conos x metro lineal
  // Calculated or Direct Yield
  paper_yield_units_per_ton: number;  // Rendimiento total de conos por tonelada
}

export interface IndustrialBottomFormula {
  cif_price_ton_usd: number;           // Costo CIF por tonelada papel fondo
  customs_dispatch_percent?: number;   // % Despacho / gastos importación (default 13%)
  customs_dispatch_ton_usd?: number;   // Calculado (CIF * 13%)
  financial_cost_percent?: number;     // % Costo del dinero (default 6%)
  financial_cost_ton_usd?: number;     // Calculado (CIF * 6%)
  total_ton_cost_usd?: number;         // CIF + Despacho + Costo del Dinero (CIF * 1.19)
  gsm: number;                         // Gramaje base papel fondo (ej. 210)
  coating_gsm?: number;                // Recubrimiento PE fondo (ej. 18)
  sheet_width_mm?: number;             // Ancho pliego mm (default 1000)
  sheet_height_mm?: number;            // Largo pliego mm (default 1000)
  units_per_m2: number;                // Rendimiento culitos x m² del SKU (ej. 200 para 12oz)
  units_per_sheet?: number;            // Cantidad de culitos por pliego
  price_per_m2_usd?: number;           // Costo por m² calculado
  price_per_sheet_usd?: number;        // Costo por pliego calculado
  yield_units_per_ton?: number;        // Rendimiento total culitos x ton calculado
}

export interface IndustrialCostCurrencyMeta {
  currency: 'USD' | 'PYG';
  fx_rate: number;
  fob_price_ton_original?: number;
  freight_ton_original?: number;
  bottom_paper_cost_ton_original?: number;
  quoted_printing_rate_original?: number;
  operational_cost_per_thousand_original?: number;
  machine_depreciation_per_thousand_original?: number;
  packaging_cost_per_thousand_original?: number;
}

export interface IndustrialProductCostInput {
  sku: string;
  paper_formula: IndustrialPaperFormula;
  bottom_formula?: IndustrialBottomFormula;  // Formulación por rendimiento m² / pliego
  bottom_paper_cost_ton_usd: number;        // Costo bobina fondo CIF (USD/ton)
  bottom_yield_units_per_ton: number;       // Rendimiento fondos por ton (legacy o fallback)
  printing_cost_mode: 'PER_THOUSAND' | 'PER_UNIT' | 'TOTAL_BATCH';
  quoted_printing_rate_usd: number;         // Cotización de imprenta variable
  operational_cost_per_thousand_usd: number;// Mano de obra directa + energía + planta ($/1000u)
  machine_depreciation_per_thousand_usd: number; // Depreciación formadora ($/1000u)
  scrap_rate_percent: number;               // Merma %
  packaging_cost_per_thousand_usd: number;  // Empaque cajas y bolsas ($/1000u)
  batch_size: number;                       // Tamaño de lote a cotizar
  /** V1 control plane. Missing entries remain enabled for backwards compatibility. */
  rubrics?: Partial<CostV1RubricConfigMap>;
  /** Industrial Processes V2 switches & calculated cache */
  operational_process_enabled?: boolean;
  packaging_process_enabled?: boolean;
  process_operational_cost_per_thousand_usd?: number;
  process_packaging_cost_per_thousand_usd?: number;
  process_snapshot_id?: string;
  process_calculation_detail?: IndustrialProcessCalculationDetail;
  /** Currency load and presentation metadata */
  currency_mode?: 'USD' | 'PYG' | 'BOTH';
  input_currency?: 'USD' | 'PYG';
  fx_rate_applied?: number;
  currency_meta?: IndustrialCostCurrencyMeta;
}

export interface IndustrialCostBreakdown {
  cost_paper_cone_usd: number;
  cost_bottom_usd: number;
  cost_printing_diecut_usd: number;
  cost_operational_usd: number;
  cost_depreciation_usd: number;
  cost_scrap_usd: number;
  cost_packaging_usd: number;
  true_unit_cost_usd: number;
  batch_total_cost_usd: number;
  // Detail calculations for cone
  total_paper_ton_cost_usd: number;
  customs_dispatch_ton_usd: number;
  financial_cost_ton_usd: number;
  cost_financial_usd?: number;
  cost_dispatch_usd?: number;
  price_per_sheet_usd?: number;
  price_per_linear_meter_usd?: number;
  // Detail calculations for bottom (culito)
  bottom_cif_price_ton_usd?: number;
  total_bottom_ton_cost_usd?: number;
  bottom_customs_dispatch_ton_usd?: number;
  bottom_financial_cost_ton_usd?: number;
  cost_bottom_m2_usd?: number;
  cost_bottom_sheet_usd?: number;
  bottom_units_per_m2?: number;
  bottom_units_per_sheet?: number;
  // Component status and traceability
  cost_paper_cone_status?: 'COMPLETE' | 'INCOMPLETE';
  cost_bottom_status?: 'COMPLETE' | 'INCOMPLETE';
  cost_raw_material_status?: 'COMPLETE' | 'INCOMPLETE';
  cost_paper_cone_missing?: string[];
  cost_bottom_missing?: string[];
  exact_cost_paper_cone_usd?: number;
  exact_cost_bottom_usd?: number;
  exact_true_unit_cost_usd?: number;
  currency_mode?: 'USD' | 'PYG' | 'BOTH';
  fx_rate?: number;
  // Share percentages
  share_paper_cone_percent: number;
  share_bottom_percent: number;
  share_printing_percent: number;
  share_operational_percent: number;
  share_depreciation_percent: number;
  share_scrap_percent: number;
  share_packaging_percent: number;
  // Separate outsourced vs internal costs
  printing_outsourced_cost_usd?: number;
  die_cutting_outsourced_cost_usd?: number;
  printing_internal_cost_usd?: number;
  die_cutting_internal_cost_usd?: number;
  configured?: boolean;
  missing_configuration?: string[];
  rubrics?: CostV1RubricResult[];
  share_raw_material_percent?: number;
}

export interface CostV1Configuration {
  id?: string;
  organization_id?: string;
  product_id?: string;
  sku: string;
  input: IndustrialProductCostInput;
  version: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// ==========================================
// 8. INDUSTRIAL PROCESSES V2 TYPES
// ==========================================

export interface PlantGeneralParameters {
  id?: string;
  organization_id?: string;
  // Shared global parameters
  electricity_rate_pyg_kwh: number;      // Tarifa eléctrica global Gs./kWh
  monthly_salary_hours: number;          // Horas salariales al mes (e.g. 192)
  labor_charges_percent: number;         // Cargas laborales % (e.g. 16.5)
  // Forming machine operators
  operator_monthly_salary_pyg: number;   // Salario mensual de referencia para operador de formado Gs.
  // Forming machines - Generation 1
  gen1_machines_count: number;           // Cantidad de máquinas de 1.ª gen activas
  gen1_power_kw: number;                  // Potencia kW por máquina 1.ª gen
  gen1_operators_count: number;          // Cantidad de operadores 1.ª gen
  gen1_operating_hours: number;          // Horas de operación aplicables 1.ª gen
  // Forming machines - Generation 2
  gen2_machines_count: number;           // Cantidad de máquinas de 2.ª gen activas
  gen2_power_kw: number;                  // Potencia kW por máquina 2.ª gen
  gen2_operators_count: number;          // Cantidad de operadores 2.ª gen
  gen2_operating_hours: number;          // Horas de operación aplicables 2.ª gen
  // Quality control
  quality_inspectors_count: number;      // Cantidad de personas en calidad (default 2)
  quality_monthly_salary_pyg: number;    // Salario mensual por persona calidad Gs.
  quality_polypaper_percent: number;     // % asignado a polipapel (0-100)
  quality_labor_charges_included?: boolean;
  // Packing labor
  packer_monthly_salary_pyg: number;     // Salario mensual empacador Gs. (default 3.100.000)
  // Packaging materials
  packaging_materials_cost_per_thousand_usd: number; // Costo materiales por 1.000 u USD
  packaging_boxes_cost_usd?: number;
  packaging_bags_cost_usd?: number;
  packaging_other_cost_usd?: number;
  packaging_units_per_presentation?: number;
  updated_at?: string;
  updated_by?: string;
}

export type PackingSessionStatus = 'RUNNING' | 'STOPPED' | 'APPROVED' | 'CORRECTED' | 'VOIDED';

export interface PackingSessionSegment {
  id: string;
  session_id: string;
  segment_order: number;
  headcount: number;
  started_at: string;                   // Server-side ISO timestamp
  ended_at?: string;                    // Server-side ISO timestamp
  stopped_at?: string;                  // Server-side ISO timestamp
  duration_minutes?: number;
  duration_seconds?: number;
  person_hours: number;
  reason?: string;
}

export interface PackingSession {
  id: string;
  organization_id: string;
  session_code?: string;
  line_name?: string;                   // e.g. 'Polipapel'
  line_id?: string;                     // legacy alias
  sku?: string;
  production_order?: string;
  operator_user_id?: string;
  status: PackingSessionStatus;
  started_at: string;                   // Server-side ISO timestamp
  stopped_at?: string;                  // Server-side ISO timestamp
  total_duration_minutes?: number;
  total_duration_seconds?: number;
  total_person_hours: number;
  notes?: string;
  supervisor_name?: string;
  approved_by?: string;
  approved_at?: string;
  correction_notes?: string;
  segments: PackingSessionSegment[];
  created_at: string;
  updated_at: string;
}

export interface PlantProductionPeriod {
  id?: string;
  organization_id?: string;
  period: string;                        // e.g. '2026-10'
  sku: string;
  good_units_produced: number;           // Unidades buenas producidas en el período
  operating_hours?: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// ==========================================
// INDUSTRIAL PERSONNEL & SALARY BANDS TYPES
// ==========================================

export type IndustrialSector = 'FORMADO' | 'CALIDAD' | 'EMPAQUE';
export type MachineGeneration = 'GEN1' | 'GEN2';

export interface PlantSalaryBandRate {
  id: string;
  organization_id?: string;
  band_id: string;
  monthly_salary_pyg: number;
  valid_from: string; // YYYY-MM-DD
  valid_to?: string | null; // YYYY-MM-DD
  notes?: string;
  created_at?: string;
  created_by?: string;
}

export interface PlantSalaryBand {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'INACTIVE';
  monthly_salary_pyg: number; // Current active rate
  current_rate?: PlantSalaryBandRate;
  rates?: PlantSalaryBandRate[];
  created_at?: string;
  updated_at?: string;
}

export interface PlantPersonnelAssignment {
  id: string;
  organization_id: string;
  personnel_id: string;
  salary_band_id: string;
  sector: IndustrialSector;
  machine_generation?: MachineGeneration | null;
  line_id?: string;
  allocation_percent: number; // 0 < percent <= 100
  valid_from: string; // YYYY-MM-DD
  valid_to?: string | null; // YYYY-MM-DD
  // Populated helpers
  band_name?: string;
  monthly_salary_pyg?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PlantPersonnel {
  id: string;
  organization_id: string;
  employee_code: string;
  display_name: string;
  status: 'ACTIVE' | 'INACTIVE';
  hire_date: string; // YYYY-MM-DD
  termination_date?: string | null; // YYYY-MM-DD
  primary_sector?: IndustrialSector;
  current_band_id?: string;
  current_band_name?: string;
  current_salary_pyg?: number;
  assignments?: PlantPersonnelAssignment[];
  created_at?: string;
  updated_at?: string;
}

export interface SectorPersonnelItem {
  personnel_id: string;
  employee_code: string;
  display_name: string;
  band_id: string;
  band_name: string;
  monthly_salary_pyg: number;
  allocation_percent: number;
  effective_monthly_salary_pyg: number;
  hourly_rate_pyg: number;
  generation_allocations?: Partial<Record<MachineGeneration, number>>;
}

export interface PlantPersonnelSalaryAssignment {
  id: string;
  organization_id: string;
  personnel_id: string;
  salary_band_id: string;
  valid_from: string;
  valid_to?: string | null;
  band_name?: string;
  monthly_salary_pyg?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SectorPersonnelSummary {
  sector: IndustrialSector;
  assigned_count: number;
  monthly_salary_base_pyg: number;
  monthly_salary_with_charges_pyg: number;
  hourly_rate_avg_pyg: number;
  personnel: SectorPersonnelItem[];
  is_configured: boolean;
}

export interface PackingLaborAllocation {
  id: string;
  organization_id: string;
  session_id: string;
  session_segment_id?: string;
  salary_band_id: string;
  salary_band_name?: string;
  headcount: number;
  hourly_rate_snapshot_pyg: number;
  calculated_cost_pyg: number;
  notes?: string;
  approved_by?: string;
  approved_at?: string;
}

export interface IndustrialProcessCalculationDetail {
  period?: string;
  sku?: string;
  calculation_date: string;
  fx_rate: number;
  fx_source: string;
  status: 'COMPLETE' | 'SIN_BASE_PRORRATEO' | 'CONFIGURACION_INCOMPLETA';
  missing_fields?: string[];
  good_units_basis: number;
  forming: {
    energy_kwh_gen1: number;
    energy_kwh_gen2: number;
    total_energy_kwh: number;
    electricity_cost_pyg: number;
    operator_hourly_cost_pyg: number;
    mod_forming_cost_pyg: number;
    total_forming_pyg: number;
    total_forming_usd: number;
    gen1_operators_count?: number;
    gen1_operators_salary_pyg?: number;
    gen2_operators_count?: number;
    gen2_operators_salary_pyg?: number;
    is_personnel_configured?: boolean;
  };
  quality: {
    inspectors_count: number;
    monthly_salary_pyg: number;
    polypaper_percent: number;
    assigned_monthly_pyg: number;
    assigned_usd: number;
    is_personnel_configured?: boolean;
  };
  packing_labor: {
    approved_person_hours: number;
    packer_hourly_cost_pyg: number;
    packing_labor_pyg: number;
    packing_labor_usd: number;
    sessions_count: number;
    is_personnel_configured?: boolean;
    is_estimated?: boolean;
    has_discrepancy?: boolean;
    discrepancy_message?: string;
    allocations_count?: number;
  };
  packaging_materials: {
    cost_per_thousand_usd: number;
  };
  personnel_summary?: Record<IndustrialSector, SectorPersonnelSummary>;
  // Summary outputs
  total_period_units?: number;
  forming_hourly_cost_pyg?: number;
  allocated_forming_pyg?: number;
  allocated_forming_usd?: number;
  allocated_quality_pyg?: number;
  allocated_quality_usd?: number;
  allocated_operational_pyg?: number;
  allocated_operational_usd?: number;
  schema_warning?: string;
  operational_total_usd_per_thousand: number;
  operational_total_pyg_per_thousand: number;
  packaging_total_usd_per_thousand: number;
  packaging_total_pyg_per_thousand: number;
  true_unit_operational_usd: number;
  true_unit_packaging_usd: number;
}

export interface IndustrialProcessSnapshot {
  id: string;
  organization_id: string;
  sku: string;
  period: string;
  parameters_snapshot?: PlantGeneralParameters;
  calculation_detail?: IndustrialProcessCalculationDetail;
  detail_json?: IndustrialProcessCalculationDetail | any;
  calculated_at?: string;
  created_by?: string;
  created_at?: string;
}

// ==========================================
// NIU COPILOT TYPES
// ==========================================

export interface CopilotScreenContext {
  route: string;
  module: string;
  sku?: string;
  market?: MarketCode | string;
  volume?: number;
  unitCostUSD?: number;
  benchmarkUSD?: number;
  gapPercent?: number;
  breakdownSnapshot?: Partial<IndustrialCostBreakdown>;
  processSnapshot?: Record<string, any>;
  rfqSnapshot?: Record<string, any>;
  visibilitySnapshot?: Record<string, any>;
  customParams?: Record<string, any>;
}

export interface CopilotAction {
  id: string;
  thread_id?: string;
  message_id?: string;
  action_type:
    | 'SIMULATE_WASTE'
    | 'CHANGE_VOLUME'
    | 'SWITCH_MARKET'
    | 'NAVIGATE'
    | 'CREATE_SCENARIO'
    | 'CALCULATE_CAPEX'
    | 'APPLY_PRICE_TARGET';
  label: string;
  payload: Record<string, any>;
  status: 'PROPOSED' | 'CONFIRMED' | 'EXECUTED' | 'DISMISSED';
  created_at?: string;
}

export interface CopilotMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  context_snapshot?: CopilotScreenContext;
  tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
  model?: string;
  created_at: string;
  proposed_actions?: CopilotAction[];
}

export interface CopilotThread {
  id: string;
  user_id: string;
  organization_id: string;
  route: string;
  module: string;
  title: string;
  created_at: string;
  updated_at: string;
}

// ==========================================
// INDUSTRIAL COMPETITIVENESS & NESTING TYPES
// ==========================================

export interface YieldNestingConfig {
  sheet_width_mm: number;
  sheet_height_mm: number;
  piece_width_mm: number;
  piece_height_mm: number;
  orientation: 'AUTO' | 'PORTRAIT' | 'LANDSCAPE';
  spacing_mm: number;
  printing_margin_mm: number;
  registration_margin_mm: number;
  pieces_per_sheet: number;
  paper_cif_ton_usd: number;
  gsm: number;
  coating_gsm: number;
}

export interface YieldNestingResult {
  total_area_m2: number;
  usable_area_m2: number;
  piece_area_m2: number;
  pieces_per_sheet: number;
  yield_percent: number;
  geometric_scrap_percent: number;
  area_consumed_per_piece_m2: number;
  paper_cost_per_piece_usd: number;
  sheets_per_ton: number;
  total_paper_ton_usd: number;
}

// ==========================================
// INDUSTRIAL SCENARIOS & CAPEX TYPES
// ==========================================

export type IndustrialScenarioId =
  | 'SCENARIO_A_OUTSOURCED_NARROW'
  | 'SCENARIO_B_OUTSOURCED_WIDE'
  | 'SCENARIO_C_PARTIAL_INTEGRATION'
  | 'SCENARIO_D_FULL_INTEGRATION';

export interface IndustrialCapexConfig {
  machine_name: string;
  capex_investment_usd: number;
  lifespan_years: number;
  annual_maintenance_usd: number;
  operator_labor_hourly_usd: number;
  energy_kwh_cost_usd: number;
  power_kw: number;
  speed_units_per_hour: number;
  plates_clises_cost_per_job_usd: number;
  inks_cost_per_thousand_usd: number;
  setup_waste_sheets: number;
  annual_working_hours: number;
}

export interface IndustrialScenarioComparison {
  id: IndustrialScenarioId;
  title: string;
  technology_description: string;
  format_label: string;
  printing_model: 'OUTSOURCED' | 'INTERNAL';
  die_cutting_model: 'OUTSOURCED' | 'INTERNAL';
  unit_cost_usd: number;
  unit_saving_vs_current_usd: number;
  cost_gap_vs_benchmark_percent: number;
  margin_at_benchmark_percent: number;
  capex_investment_usd: number;
  annual_saving_at_volume_usd: number;
  break_even_volume_annual: number;
  payback_years: number;
  roi_percent: number;
  feasibility_status: 'CURRENT' | 'IMMEDIATE' | 'CAPEX_VIABLE' | 'LONG_TERM';
  recommendation: string;
}

// ==========================================
// 10. FX & EXCHANGE RATE ENGINE TYPES
// ==========================================

export type FxCostingRateMode = 'BNF_SELL' | 'BNF_BUY' | 'MANUAL' | 'CUSTOM_MARGIN';
export type FxStatus = 'CURRENT' | 'STALE' | 'MANUAL' | 'UNAVAILABLE_SOURCE_USING_LAST_VALID';

export interface FxQuote {
  base: string;
  quote: string;
  buy: number;
  sell: number;
  effectiveAt: string;
  fetchedAt: string;
  source: string;
}

export interface FxRate {
  id: string;
  base_currency: string;
  quote_currency: string;
  buy_rate: number;
  sell_rate: number;
  source: string;
  effective_at: string;
  fetched_at: string;
  is_active: boolean;
  raw_reference?: string;
  created_at: string;
}

export interface FxSettings {
  organization_id: string;
  costing_rate_mode: FxCostingRateMode;
  manual_rate?: number;
  custom_margin_percent?: number;
  refresh_interval_minutes: number;
  last_checked_at: string;
  status: FxStatus;
  updated_at: string;
}

// ==========================================
// 11. EXPORT COST & LOGISTICS TYPES
// ==========================================

export type ContainerType = '20FT' | '40FT' | '40HC' | 'CUSTOM';
export type IncotermType = 'EXW' | 'FOB' | 'CIF' | 'LANDED';

export interface ProductPackagingSpec {
  sku: string;
  units_per_box: number;
  box_length_cm: number;
  box_width_cm: number;
  box_height_cm: number;
  box_weight_kg: number;
  box_volume_m3: number;
}

export interface ContainerSpec {
  type: ContainerType;
  name: string;
  usable_m3: number;
  max_payload_kg: number;
  default_freight_usd: number;
}

export interface FclLogisticsInput {
  container_type: ContainerType;
  packaging: ProductPackagingSpec;
  container_freight_cost_usd: number;
  origin_charges_usd?: number;
  destination_charges_usd?: number;
  documentation_usd?: number;
  customs_usd?: number;
  insurance_usd?: number;
  other_export_costs_usd?: number;
  usable_m3?: number;
  max_weight_kg?: number;
  actual_boxes_per_container?: number;
}

export interface FclLogisticsResult {
  container_type: ContainerType;
  box_volume_m3: number;
  boxes_by_volume: number;
  boxes_by_weight: number;
  usable_boxes: number;
  is_manual_override: boolean;
  units_per_container: number;
  volume_utilization_percent: number;
  weight_utilization_percent: number;
  freight_cost_per_box_usd: number;
  freight_cost_per_unit_usd: number;
  origin_cost_per_unit_usd: number;
  documentation_cost_per_unit_usd: number;
  insurance_cost_per_unit_usd: number;
  customs_cost_per_unit_usd: number;
  other_cost_per_unit_usd: number;
  total_export_cost_per_unit_usd: number;
  total_container_cost_usd: number;
}

export interface LclLogisticsInput {
  packaging: ProductPackagingSpec;
  number_of_boxes?: number;
  number_of_units?: number;
  freight_cost_per_m3_usd: number;
  minimum_charge_usd?: number;
  origin_charges_usd?: number;
  destination_charges_usd?: number;
  documentation_usd?: number;
  customs_usd?: number;
  insurance_usd?: number;
  other_export_costs_usd?: number;
}

export interface LclLogisticsResult {
  number_of_boxes: number;
  total_units: number;
  box_volume_m3: number;
  total_m3: number;
  freight_rate_per_m3_usd: number;
  minimum_charge_applied: boolean;
  freight_subtotal_usd: number;
  freight_cost_per_box_usd: number;
  freight_cost_per_unit_usd: number;
  other_charges_subtotal_usd: number;
  total_lcl_cost_usd: number;
  total_cost_per_box_usd: number;
  total_cost_per_unit_usd: number;
}

export interface LogisticsBreakEvenPoint {
  volume_units: number;
  boxes: number;
  total_m3: number;
  lcl_cost_usd: number;
  lcl_unit_cost_usd: number;
  fcl_20ft_cost_usd: number;
  fcl_20ft_unit_cost_usd: number;
  fcl_40hc_cost_usd: number;
  fcl_40hc_unit_cost_usd: number;
  best_method: 'LCL' | '20FT' | '40HC';
}

export interface LogisticsBreakEvenResult {
  break_even_units_20ft: number;
  break_even_boxes_20ft: number;
  break_even_units_40hc: number;
  break_even_boxes_40hc: number;
  summary_message: string;
  volume_breakdown: LogisticsBreakEvenPoint[];
}

export interface LandedCostBreakdown {
  sku: string;
  factory_cost_usd: number;
  export_packaging_usd: number;
  origin_logistics_usd: number;
  documentation_usd: number;
  freight_usd: number;
  insurance_usd: number;
  destination_charges_usd: number;
  duties_taxes_usd: number;
  // Unit summaries USD
  exw_unit_usd: number;
  fob_unit_usd: number;
  cif_unit_usd: number;
  landed_unit_usd: number;
  // Unit summaries PYG
  fx_rate_used: number;
  exw_unit_pyg: number;
  fob_unit_pyg: number;
  cif_unit_pyg: number;
  landed_unit_pyg: number;
}

// ==========================================
// 12. QUOTE-TO-COST MATCHER TYPES
// ==========================================

export interface ExternalQuoteInput {
  supplier_name: string;
  country: MarketCode | string;
  quote_date?: string;
  product_description: string;
  product_name?: string;
  size_oz?: number;
  size_ml?: number;
  material?: string;
  paper?: string;
  quantity?: number;
  quoted_unit_price: number;
  currency: string;
  incoterm?: string;
  lead_time_days?: number;
  source_type: 'EMAIL' | 'PDF' | 'XLSX' | 'CSV' | 'MANUAL_TEXT' | 'RFQ_REPLY';
  raw_text?: string;
}

export interface QuoteMatchResult {
  id: string;
  external_quote: ExternalQuoteInput;
  matched_sku: string;
  matched_sku_name: string;
  sku_similarity_score: number; // 0 to 1
  size_match: boolean;
  material_match: boolean;
  external_unit_price_usd: number;
  niupack_factory_unit_cost_usd: number;
  niupack_landed_unit_cost_usd: number;
  fx_rate_used: number;
  niupack_factory_unit_cost_pyg: number;
  price_gap_usd: number;
  price_gap_percent: number;
  margin_at_external_price_percent: number;
  competitive_status: 'COMPETITIVE' | 'PARITY' | 'DISADVANTAGE' | 'CRITICAL';
  comparable_warning?: string;
  created_at: string;
}

