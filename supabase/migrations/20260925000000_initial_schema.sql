-- ====================================================================
-- NIU INTELLIGENCE OS - SUPABASE POSTGRESQL COMPLETE SCHEMA
-- Organization-scoped, UUID PKs, full RLS, audit logging
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Profiles / Users
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst', 'operator', 'executive')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Brands
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    legal_name TEXT NOT NULL,
    country_of_origin TEXT NOT NULL DEFAULT 'Paraguay',
    website_url TEXT NOT NULL DEFAULT 'https://niupack.com.py',
    description TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Markets
CREATE TABLE IF NOT EXISTS markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL CHECK (code IN ('BR', 'AR', 'BO', 'PY')),
    name TEXT NOT NULL,
    primary_city TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    timezone TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_control BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code)
);

-- 5. Products (Product Master)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('cups', 'lids', 'bowls', 'trays', 'thermoformed', 'custom')),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code)
);

-- 6. Product Attributes & SKUs
CREATE TABLE IF NOT EXISTS product_attributes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    size_oz NUMERIC,
    size_ml NUMERIC,
    height_mm NUMERIC,
    top_diameter_mm NUMERIC,
    bottom_diameter_mm NUMERIC,
    material TEXT NOT NULL,
    paper_weight_gsm NUMERIC,
    coating TEXT NOT NULL,
    wall_type TEXT NOT NULL CHECK (wall_type IN ('single', 'double', 'n/a')),
    max_colors INTEGER NOT NULL DEFAULT 4,
    pack_quantity INTEGER NOT NULL DEFAULT 50,
    carton_quantity INTEGER NOT NULL DEFAULT 1000,
    compatible_lids TEXT,
    moq INTEGER NOT NULL DEFAULT 10000,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, sku)
);

-- 7. Query Batteries
CREATE TABLE IF NOT EXISTS query_batteries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    frozen_at TIMESTAMPTZ,
    frozen_by UUID REFERENCES profiles(id),
    query_count INTEGER NOT NULL DEFAULT 0,
    market_codes TEXT[] NOT NULL DEFAULT ARRAY['BR', 'AR', 'BO'],
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'FROZEN', 'ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code, version)
);

-- 8. Queries
CREATE TABLE IF NOT EXISTS queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    battery_id UUID NOT NULL REFERENCES query_batteries(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('pt', 'es', 'en')),
    country_code TEXT NOT NULL CHECK (country_code IN ('BR', 'AR', 'BO', 'PY')),
    city_context TEXT NOT NULL,
    intent TEXT NOT NULL,
    category TEXT NOT NULL,
    product_id UUID REFERENCES products(id),
    sku TEXT,
    buyer_persona TEXT NOT NULL,
    commercial_priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (commercial_priority IN ('HIGH', 'MEDIUM', 'LOW')),
    generated_by TEXT NOT NULL DEFAULT 'AI' CHECK (generated_by IN ('AI', 'MANUAL')),
    is_fixed BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED', 'ACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Query Runs
CREATE TABLE IF NOT EXISTS query_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    battery_id UUID NOT NULL REFERENCES query_batteries(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    market_codes TEXT[] NOT NULL,
    model TEXT NOT NULL DEFAULT 'gpt-4o',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED')),
    total_queries INTEGER NOT NULL DEFAULT 0,
    executed_queries INTEGER NOT NULL DEFAULT 0,
    successful_queries INTEGER NOT NULL DEFAULT 0,
    failed_queries INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    actual_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    max_spend_limit_usd NUMERIC(10, 4) NOT NULL DEFAULT 50.0000,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Query Results
CREATE TABLE IF NOT EXISTS query_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES query_runs(id) ON DELETE CASCADE,
    query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL,
    model TEXT NOT NULL,
    raw_prompt TEXT NOT NULL,
    raw_response TEXT NOT NULL,
    sources_json JSONB DEFAULT '[]'::jsonb,
    search_queries_json JSONB DEFAULT '[]'::jsonb,
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Query Mentions (Analyzer Extraction)
CREATE TABLE IF NOT EXISTS query_mentions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    result_id UUID NOT NULL REFERENCES query_results(id) ON DELETE CASCADE,
    query_id UUID NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    niupack_mentioned BOOLEAN NOT NULL DEFAULT false,
    niupack_linked BOOLEAN NOT NULL DEFAULT false,
    niupack_as_source BOOLEAN NOT NULL DEFAULT false,
    mention_count INTEGER NOT NULL DEFAULT 0,
    position TEXT NOT NULL DEFAULT 'NONE' CHECK (position IN ('FIRST', 'EARLY', 'MIDDLE', 'LATE', 'NONE')),
    sentiment_accuracy TEXT NOT NULL DEFAULT 'NONE' CHECK (sentiment_accuracy IN ('CORRECT', 'PARTIAL', 'INCORRECT', 'NONE')),
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
    analysis_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Query Competitors
CREATE TABLE IF NOT EXISTS query_competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    result_id UUID NOT NULL REFERENCES query_results(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL,
    competitor_name TEXT NOT NULL,
    domain TEXT,
    mention_order INTEGER NOT NULL DEFAULT 1,
    context_snippet TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Query Sources
CREATE TABLE IF NOT EXISTS query_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    result_id UUID NOT NULL REFERENCES query_results(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL,
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    title TEXT,
    snippet TEXT,
    rank INTEGER NOT NULL DEFAULT 1,
    is_niupack BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Visibility Snapshots (Day 1 / 15 / 30)
CREATE TABLE IF NOT EXISTS visibility_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    battery_id UUID NOT NULL REFERENCES query_batteries(id) ON DELETE CASCADE,
    run_id UUID REFERENCES query_runs(id) ON DELETE SET NULL,
    snapshot_day TEXT NOT NULL CHECK (snapshot_day IN ('DAY_1', 'DAY_15', 'DAY_30', 'AD_HOC')),
    market_code TEXT NOT NULL,
    overall_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    mention_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    link_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    source_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    won_queries_count INTEGER NOT NULL DEFAULT 0,
    lost_queries_count INTEGER NOT NULL DEFAULT 0,
    total_queries INTEGER NOT NULL DEFAULT 0,
    competitor_share_json JSONB DEFAULT '{}'::jsonb,
    top_sources_json JSONB DEFAULT '[]'::jsonb,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Suppliers Master
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    country_code TEXT NOT NULL CHECK (country_code IN ('BR', 'AR', 'BO', 'PY', 'OTHER')),
    city TEXT,
    website TEXT,
    email TEXT,
    phone TEXT,
    contact_name TEXT,
    contact_page TEXT,
    status TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (status IN ('DISCOVERED', 'REVIEWED', 'APPROVED_FOR_CONTACT', 'CONTACTED', 'RESPONDED', 'INVALID')),
    discovery_source TEXT NOT NULL DEFAULT 'OPENAI_SEARCH',
    discovery_evidence TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Supplier Contacts
CREATE TABLE IF NOT EXISTS supplier_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT,
    email TEXT,
    phone TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. RFQs (Technical Specifications)
CREATE TABLE IF NOT EXISTS rfqs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEW_REQUIRED', 'APPROVED', 'SENT', 'REPLIED', 'PARSED', 'BENCHMARKED', 'CANCELLED')),
    delivery_destination TEXT NOT NULL,
    incoterm TEXT NOT NULL DEFAULT 'FOB' CHECK (incoterm IN ('EXW', 'FOB', 'CIF', 'CIP', 'DDP')),
    target_lead_time_days INTEGER DEFAULT 30,
    payment_terms TEXT DEFAULT '30 days net',
    validity_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. RFQ Items
CREATE TABLE IF NOT EXISTS rfq_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    alternative_quantities INTEGER[] DEFAULT ARRAY[100000, 300000, 500000],
    material TEXT NOT NULL,
    printing_spec TEXT NOT NULL DEFAULT '4 colors flexo',
    color_count INTEGER NOT NULL DEFAULT 4,
    packaging_spec TEXT,
    tooling_requirements TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. RFQ Supplier Dispatches
CREATE TABLE IF NOT EXISTS rfq_supplier_dispatches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'SENT', 'REPLIED', 'DECLINED')),
    email_thread_id TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rfq_id, supplier_id)
);

-- 20. Email Threads
CREATE TABLE IF NOT EXISTS email_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rfq_id UUID REFERENCES rfqs(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    gmail_thread_id TEXT NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    snippet TEXT,
    last_message_date TIMESTAMPTZ,
    unread BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. Email Messages
CREATE TABLE IF NOT EXISTS email_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
    gmail_message_id TEXT NOT NULL UNIQUE,
    direction TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_text TEXT,
    body_html TEXT,
    attachments_json JSONB DEFAULT '[]'::jsonb,
    received_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. Supplier Quotes
CREATE TABLE IF NOT EXISTS supplier_quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rfq_id UUID REFERENCES rfqs(id) ON DELETE SET NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    email_message_id UUID REFERENCES email_messages(id) ON DELETE SET NULL,
    quote_reference TEXT,
    raw_quote_text TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    incoterm TEXT NOT NULL DEFAULT 'FOB',
    freight_included BOOLEAN NOT NULL DEFAULT false,
    printing_included BOOLEAN NOT NULL DEFAULT true,
    tooling_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_terms TEXT,
    lead_time_days INTEGER,
    validity_date DATE,
    status TEXT NOT NULL DEFAULT 'EXTRACTED' CHECK (status IN ('EXTRACTED', 'REVIEWED', 'ACCEPTED', 'REJECTED')),
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.95,
    operator_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 23. Quote Items
CREATE TABLE IF NOT EXISTS quote_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID NOT NULL REFERENCES supplier_quotes(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 4) NOT NULL,
    normalized_unit_price_usd NUMERIC(10, 4) NOT NULL,
    moq INTEGER,
    lead_time_days INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. Market Price Observations
CREATE TABLE IF NOT EXISTS market_price_observations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL CHECK (country_code IN ('BR', 'AR', 'BO', 'PY')),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    sku TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    moq INTEGER,
    original_price NUMERIC(12, 4) NOT NULL,
    original_currency TEXT NOT NULL,
    exchange_rate_to_usd NUMERIC(10, 6) NOT NULL DEFAULT 1.000000,
    normalized_price_usd NUMERIC(12, 4) NOT NULL,
    normalized_unit_price_usd NUMERIC(10, 4) NOT NULL,
    observation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source_type TEXT NOT NULL CHECK (source_type IN ('FORMAL_QUOTE', 'DIRECT_EMAIL', 'SUPPLIER_CATALOG', 'B2B_MARKETPLACE', 'RETAIL')),
    source_url TEXT,
    source_reference TEXT,
    incoterm TEXT DEFAULT 'FOB',
    taxes_included BOOLEAN NOT NULL DEFAULT false,
    freight_included BOOLEAN NOT NULL DEFAULT false,
    printing_included BOOLEAN NOT NULL DEFAULT true,
    tooling_cost_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_terms TEXT,
    lead_time_days INTEGER,
    validity_date DATE,
    confidence_level NUMERIC(4, 2) NOT NULL DEFAULT 0.85,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 25. Cost Sheet Versions
CREATE TABLE IF NOT EXISTS cost_sheet_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    batch_size INTEGER NOT NULL DEFAULT 300000,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
    true_unit_cost_usd NUMERIC(10, 5) NOT NULL DEFAULT 0.00000,
    minimum_sustainable_price_usd NUMERIC(10, 5) NOT NULL DEFAULT 0.00000,
    break_even_units INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, sku, version)
);

-- 26. Cost Components (22+ Industrial Categories)
CREATE TABLE IF NOT EXISTS cost_components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cost_sheet_id UUID NOT NULL REFERENCES cost_sheet_versions(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN (
        'materia_prima', 'papel', 'coating', 'tintas', 'impresion', 'formado',
        'mano_de_obra', 'maquina', 'energia', 'merma', 'empaque', 'almacenamiento',
        'flete_inbound', 'flete_outbound', 'aduana', 'impuestos', 'financiero',
        'comercial', 'overhead', 'setup', 'herramental', 'otros'
    )),
    name TEXT NOT NULL,
    component_type TEXT NOT NULL CHECK (component_type IN ('FIXED', 'VARIABLE')),
    basis TEXT NOT NULL CHECK (basis IN ('PER_UNIT', 'PER_BATCH')),
    rate_usd NUMERIC(12, 5) NOT NULL,
    quantity NUMERIC(12, 4) NOT NULL DEFAULT 1.0000,
    unit_of_measure TEXT NOT NULL DEFAULT 'unit',
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 27. Process Definitions
CREATE TABLE IF NOT EXISTS process_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 28. Process Steps
CREATE TABLE IF NOT EXISTS process_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    process_id UUID NOT NULL REFERENCES process_definitions(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    name TEXT NOT NULL,
    machine_name TEXT NOT NULL,
    operators_count INTEGER NOT NULL DEFAULT 1,
    cycle_time_seconds NUMERIC(8, 2) NOT NULL DEFAULT 1.00,
    setup_time_minutes INTEGER NOT NULL DEFAULT 30,
    capacity_units_per_hour INTEGER NOT NULL DEFAULT 4000,
    energy_kwh_per_hour NUMERIC(8, 2) NOT NULL DEFAULT 15.00,
    hourly_cost_usd NUMERIC(10, 2) NOT NULL DEFAULT 45.00,
    scrap_rate_percent NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    yield_percent NUMERIC(5, 2) NOT NULL DEFAULT 95.00,
    is_bottleneck BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 29. Cost Scenarios
CREATE TABLE IF NOT EXISTS cost_scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cost_sheet_id UUID NOT NULL REFERENCES cost_sheet_versions(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    base_unit_cost_usd NUMERIC(10, 5) NOT NULL,
    simulated_unit_cost_usd NUMERIC(10, 5) NOT NULL,
    base_margin_percent NUMERIC(5, 2) NOT NULL,
    simulated_margin_percent NUMERIC(5, 2) NOT NULL,
    target_price_usd NUMERIC(10, 5) NOT NULL,
    price_gap_usd NUMERIC(10, 5) NOT NULL,
    price_gap_percent NUMERIC(6, 2) NOT NULL,
    annual_impact_usd NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 30. Scenario Inputs
CREATE TABLE IF NOT EXISTS scenario_inputs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL REFERENCES cost_scenarios(id) ON DELETE CASCADE,
    batch_size INTEGER NOT NULL DEFAULT 300000,
    raw_material_delta_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    scrap_delta_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    efficiency_delta_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    margin_target_percent NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
    freight_delta_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    exchange_rate_delta_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 31. Scenario Results
CREATE TABLE IF NOT EXISTS scenario_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scenario_id UUID NOT NULL REFERENCES cost_scenarios(id) ON DELETE CASCADE,
    cost_sheet_id UUID NOT NULL REFERENCES cost_sheet_versions(id) ON DELETE CASCADE,
    total_unit_cost NUMERIC(10, 5) NOT NULL,
    paper_cost_unit NUMERIC(10, 5) NOT NULL,
    process_cost_unit NUMERIC(10, 5) NOT NULL,
    freight_unit NUMERIC(10, 5) NOT NULL,
    scrap_cost_unit NUMERIC(10, 5) NOT NULL,
    overhead_unit NUMERIC(10, 5) NOT NULL,
    recommended_price NUMERIC(10, 5) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 32. Strategy Snapshots (Country x SKU Matrix)
CREATE TABLE IF NOT EXISTS strategy_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL CHECK (country_code IN ('BR', 'AR', 'BO', 'PY')),
    sku TEXT NOT NULL,
    visibility_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    market_benchmark_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    benchmark_confidence NUMERIC(4, 2) NOT NULL DEFAULT 0.00,
    niupack_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    current_sell_price_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    target_price_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    price_gap_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    price_gap_percent NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    margin_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    critical_drivers_json JSONB DEFAULT '[]'::jsonb,
    recommended_scenario_json JSONB DEFAULT '{}'::jsonb,
    strategic_recommendation TEXT,
    status TEXT NOT NULL DEFAULT 'PARITY' CHECK (status IN ('COMPETITIVE', 'PARITY', 'DISADVANTAGE', 'CRITICAL')),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 33. Recommendations
CREATE TABLE IF NOT EXISTS recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL CHECK (country_code IN ('BR', 'AR', 'BO', 'PY')),
    sku TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('PRICING', 'EFFICIENCY', 'VISIBILITY', 'RFQ', 'LOGISTICS')),
    title TEXT NOT NULL,
    rationale TEXT NOT NULL,
    expected_impact TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'ACCEPTED', 'REJECTED', 'IMPLEMENTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 34. Actions (Action Center)
CREATE TABLE IF NOT EXISTS actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN (
        'visibility_check', 'query_battery_update', 'supplier_research',
        'rfq_followup', 'cost_data_missing', 'efficiency_review',
        'pricing_review', 'market_gap_review'
    )),
    title TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    evidence TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    owner TEXT NOT NULL DEFAULT 'Comercial NIUPACK',
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED')),
    market_code TEXT,
    sku TEXT,
    related_object_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 35. Persistent Job Runs
CREATE TABLE IF NOT EXISTS job_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN (
        'generate_query_battery', 'execute_visibility_run', 'analyze_visibility_result',
        'discover_suppliers', 'sync_mailbox', 'parse_supplier_reply',
        'normalize_quote', 'recalculate_market_benchmark', 'recalculate_cost_sheet',
        'run_scenario', 'build_strategy_snapshot'
    )),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED')),
    progress_percent INTEGER NOT NULL DEFAULT 0,
    retries INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE,
    payload_json JSONB DEFAULT '{}'::jsonb,
    result_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 36. Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'battery_freeze', 'cost_edit', 'rfq_approval',
        'email_sent', 'strategy_changes', 'budget_exceeded'
    )),
    target_entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 37. System Settings & Cost Controls
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    max_queries_per_run INTEGER NOT NULL DEFAULT 2000,
    max_concurrency INTEGER NOT NULL DEFAULT 5,
    max_spend_per_run_usd NUMERIC(10, 2) NOT NULL DEFAULT 25.00,
    max_monthly_spend_usd NUMERIC(10, 2) NOT NULL DEFAULT 250.00,
    current_month_spend_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    openai_model_visibility TEXT NOT NULL DEFAULT 'gpt-4o',
    openai_model_analysis TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    gmail_connected BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_queries_battery ON queries(battery_id);
CREATE INDEX IF NOT EXISTS idx_query_results_run ON query_results(run_id);
CREATE INDEX IF NOT EXISTS idx_query_mentions_query ON query_mentions(query_id);
CREATE INDEX IF NOT EXISTS idx_market_prices_sku_country ON market_price_observations(sku, country_code);
CREATE INDEX IF NOT EXISTS idx_cost_components_sheet ON cost_components(cost_sheet_id);
CREATE INDEX IF NOT EXISTS idx_strategy_snapshots_sku ON strategy_snapshots(sku, country_code);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status, priority);
CREATE INDEX IF NOT EXISTS idx_job_runs_status ON job_runs(status);

-- Row Level Security (RLS) policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_batteries ENABLE ROW LEVEL SECURITY;
ALTER TABLE queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE visibility_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_supplier_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_sheet_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
