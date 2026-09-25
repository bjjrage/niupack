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
  market_codes: MarketCode[];
  model: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
  total_queries: number;
  executed_queries: number;
  successful_queries: number;
  failed_queries: number;
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
  raw_prompt: string;
  raw_response: string;
  sources_json: Array<{ url: string; title: string; snippet?: string }>;
  search_queries_json: string[];
  tokens_input: number;
  tokens_output: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  error_message?: string;
  created_at: string;
}

export interface QueryMentionAnalysis {
  id: string;
  result_id: string;
  query_id: string;
  organization_id: string;
  niupack_mentioned: boolean;
  niupack_linked: boolean;
  niupack_as_source: boolean;
  mention_count: number;
  position: 'FIRST' | 'EARLY' | 'MIDDLE' | 'LATE' | 'NONE';
  sentiment_accuracy: 'CORRECT' | 'PARTIAL' | 'INCORRECT' | 'NONE';
  confidence_score: number;
  analysis_notes?: string;
  competitors: Array<{ name: string; domain?: string; order: number }>;
  sources: Array<{ url: string; domain: string; is_niupack: boolean }>;
}

export interface VisibilitySnapshot {
  id: string;
  organization_id: string;
  battery_id: string;
  run_id?: string;
  snapshot_day: 'DAY_1' | 'DAY_15' | 'DAY_30' | 'AD_HOC';
  market_code: MarketCode | 'TOTAL';
  overall_score: number;
  mention_rate: number;
  link_rate: number;
  source_rate: number;
  won_queries_count: number;
  lost_queries_count: number;
  total_queries: number;
  competitor_share_json: Record<string, number>;
  top_sources_json: Array<{ domain: string; count: number }>;
  captured_at: string;
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
  robots_txt_exists: boolean;
  oai_searchbot_allowed: boolean;
  sitemap_exists: boolean;
  canonical_url?: string;
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

export interface CostComponent {
  id: string;
  cost_sheet_id: string;
  category: CostCategory;
  name: string;
  component_type: 'FIXED' | 'VARIABLE';
  basis: 'PER_UNIT' | 'PER_BATCH';
  rate_usd: number;
  quantity: number;
  unit_of_measure: string;
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
  minimum_sustainable_price_usd: number;
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
    | 'budget_exceeded';
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
  cif_price_ton_usd: number;          // USD por tonelada CIF
  customs_dispatch_ton_usd: number;   // USD por tonelada despacho / aduana
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

export interface IndustrialProductCostInput {
  sku: string;
  paper_formula: IndustrialPaperFormula;
  bottom_paper_cost_ton_usd: number;        // Costo bobina fondo CIF + despacho (USD/ton)
  bottom_yield_units_per_ton: number;       // Rendimiento fondos por ton
  printing_cost_mode: 'PER_THOUSAND' | 'PER_UNIT' | 'TOTAL_BATCH';
  quoted_printing_rate_usd: number;         // Cotización de imprenta variable
  operational_cost_per_thousand_usd: number;// Mano de obra directa + energía + planta ($/1000u)
  machine_depreciation_per_thousand_usd: number; // Depreciación formadora ($/1000u)
  scrap_rate_percent: number;               // Merma %
  packaging_cost_per_thousand_usd: number;  // Empaque cajas y bolsas ($/1000u)
  batch_size: number;                       // Tamaño de lote a cotizar
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
  // Detail calculations
  total_paper_ton_cost_usd: number;
  price_per_sheet_usd?: number;
  price_per_linear_meter_usd?: number;
  // Share percentages
  share_paper_cone_percent: number;
  share_bottom_percent: number;
  share_printing_percent: number;
  share_operational_percent: number;
  share_depreciation_percent: number;
  share_scrap_percent: number;
  share_packaging_percent: number;
}

