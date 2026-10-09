import {
  Organization,
  Brand,
  Market,
  Product,
  ProductAttribute,
  QueryBattery,
  QueryItem,
  QueryRun,
  QueryResult,
  QueryMentionAnalysis,
  VisibilitySnapshot,
  Supplier,
  RFQ,
  SupplierQuote,
  MarketPriceObservation,
  CostSheetVersion,
  ProcessDefinition,
  CostScenario,
  ActionItem,
  JobRun,
  AuditEvent,
  SystemSettings,
  MarketCode,
  IndustrialProductCostInput,
  CopilotThread,
  CopilotMessage,
  CopilotAction,
  FxRate,
  FxSettings,
  ProductPackagingSpec,
  QuoteMatchResult,
  CostV1Configuration,
  PlantGeneralParameters,
  PlantProductionPeriod,
  PackingSession,
  PackingSessionStatus,
  PackingSessionSegment,
  IndustrialProcessSnapshot,
} from '@/types';
import {
  INITIAL_ORG,
  INITIAL_BRAND,
  INITIAL_MARKETS,
  INITIAL_PRODUCTS,
  INITIAL_SKUS,
  INITIAL_BATTERY,
  INITIAL_QUERIES,
  INITIAL_PROCESS_DEF,
  INITIAL_COST_SHEET,
  INITIAL_SUPPLIERS,
  INITIAL_PRICE_OBSERVATIONS,
  INITIAL_ACTIONS,
  INITIAL_SETTINGS,
  INITIAL_AUDIT_EVENTS,
  INITIAL_INDUSTRIAL_COST_INPUTS,
  INITIAL_FX_RATES,
  INITIAL_FX_SETTINGS,
  INITIAL_PACKAGING_SPECS,
  INITIAL_PLANT_PARAMETERS,
  INITIAL_PRODUCTION_PERIODS,
  INITIAL_PACKING_SESSIONS,
} from './seed-data';
import { supabase, supabaseAdmin, isSupabaseConfigured, isSupabaseAdminConfigured } from './supabase';

function normalizeDomain(input?: string | null): string {
  if (!input) return '';
  let cleaned = input.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  cleaned = cleaned.replace(/^www\./i, '');
  cleaned = cleaned.split('/')[0];
  cleaned = cleaned.split('?')[0];
  cleaned = cleaned.split(':')[0];
  return cleaned;
}

function isSchemaMissingError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === '42P01' || // PostgreSQL: undefined_table
    code === 'PGRST205' || // PostgREST: table not in schema cache
    code === 'PGRST204' ||
    code === 'PGRST200' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('not find the table') ||
    msg.includes('could not find the table')
  );
}

const allowCostFixtures = process.env.NODE_ENV !== 'production' || process.env.NIU_ENABLE_COST_SEED_FIXTURES === 'true';

// Persistent in-process store for zero-friction local dev, tests, and CI
class Store {
  organizations: Organization[] = [{ ...INITIAL_ORG }];
  brands: Brand[] = [{ ...INITIAL_BRAND }];
  markets: Market[] = [...INITIAL_MARKETS];
  products: Product[] = [...INITIAL_PRODUCTS];
  skus: ProductAttribute[] = [...INITIAL_SKUS];
  batteries: QueryBattery[] = [{ ...INITIAL_BATTERY }];
  queries: QueryItem[] = [...INITIAL_QUERIES];
  queryRuns: QueryRun[] = [];
  queryResults: QueryResult[] = [];
  mentions: QueryMentionAnalysis[] = [];
  snapshots: VisibilitySnapshot[] = [];
  suppliers: Supplier[] = [...INITIAL_SUPPLIERS];
  rfqs: RFQ[] = [];
  quotes: SupplierQuote[] = [];
  marketPrices: MarketPriceObservation[] = [...INITIAL_PRICE_OBSERVATIONS];
  // Cost fixtures are useful for local development/tests, never a production fallback.
  costSheets: CostSheetVersion[] = allowCostFixtures ? [{ ...INITIAL_COST_SHEET }] : [];
  industrialCostInputs: IndustrialProductCostInput[] = allowCostFixtures ? [...INITIAL_INDUSTRIAL_COST_INPUTS] : [];
  processes: ProcessDefinition[] = [{ ...INITIAL_PROCESS_DEF }];
  scenarios: CostScenario[] = [];
  actions: ActionItem[] = [...INITIAL_ACTIONS];
  jobs: JobRun[] = [];
  auditEvents: AuditEvent[] = [...INITIAL_AUDIT_EVENTS];
  settings: SystemSettings = { ...INITIAL_SETTINGS };
  copilotThreads: CopilotThread[] = [];
  copilotMessages: CopilotMessage[] = [];
  copilotActions: CopilotAction[] = [];
  fxRates: FxRate[] = [...INITIAL_FX_RATES];
  fxSettings: FxSettings = { ...INITIAL_FX_SETTINGS };
  packagingSpecs: ProductPackagingSpec[] = [...INITIAL_PACKAGING_SPECS];
  quoteMatches: QuoteMatchResult[] = [];
  plantParameters: PlantGeneralParameters = { ...INITIAL_PLANT_PARAMETERS };
  packingSessions: PackingSession[] = [...INITIAL_PACKING_SESSIONS];
  productionPeriods: PlantProductionPeriod[] = [...INITIAL_PRODUCTION_PERIODS];
  industrialSnapshots: IndustrialProcessSnapshot[] = [];
}

// Global singleton across server restarts during dev
declare global {
  var __niu_store: Store | undefined;
}

const store: Store = global.__niu_store || new Store();
if (process.env.NODE_ENV !== 'production') {
  global.__niu_store = store;
}

export const repository = {
  // Organizations & System
  async getOrganization(): Promise<Organization> {
    return store.organizations[0];
  },
  async getSettings(): Promise<SystemSettings> {
    return { ...store.settings };
  },
  async updateSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
    store.settings = { ...store.settings, ...updates };
    return { ...store.settings };
  },

  // Brands & Markets
  async getBrand(): Promise<Brand> {
    return store.brands[0];
  },
  async getMarkets(): Promise<Market[]> {
    return [...store.markets];
  },

  // Products & SKUs
  async getProducts(organizationId?: string): Promise<Product[]> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');
      if (error) throw new Error(`products: ${error.message}`);
      return (data ?? []) as Product[];
    }
    return [...store.products];
  },
  async getProductByCode(code: string): Promise<Product | undefined> {
    return store.products.find((p) => p.code === code);
  },
  async getSKUs(organizationId?: string): Promise<ProductAttribute[]> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const products = await this.getProducts(organizationId);
      if (products.length === 0) return [];
      const { data, error } = await supabaseAdmin
        .from('product_attributes')
        .select('*')
        .in('product_id', products.map((product) => product.id))
        .order('sku');
      if (error) throw new Error(`product_attributes: ${error.message}`);
      return (data ?? []) as ProductAttribute[];
    }
    return [...store.skus];
  },
  async getSKU(skuCode: string): Promise<ProductAttribute | undefined> {
    return store.skus.find((s) => s.sku === skuCode);
  },
  async addProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<Product> {
    const newProduct: Product = {
      ...product,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.products.push(newProduct);
    return newProduct;
  },
  async addSKU(sku: Omit<ProductAttribute, 'id'>, organizationId?: string): Promise<ProductAttribute> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('product_attributes')
        .insert(sku)
        .select()
        .single();
      if (error) throw new Error(`product_attributes: ${error.message}`);
      return data as ProductAttribute;
    }
    const newSku: ProductAttribute = {
      ...sku,
      id: crypto.randomUUID(),
    };
    store.skus.push(newSku);
    return newSku;
  },

  // Query Batteries
  async getBatteries(): Promise<QueryBattery[]> {
    return [...store.batteries];
  },
  async getBattery(id: string): Promise<QueryBattery | undefined> {
    return store.batteries.find((b) => b.id === id);
  },
  async createBattery(battery: Omit<QueryBattery, 'id' | 'created_at' | 'updated_at'>): Promise<QueryBattery> {
    const newBattery: QueryBattery = {
      ...battery,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.batteries.push(newBattery);
    return newBattery;
  },
  async duplicateBattery(id: string, newName?: string): Promise<QueryBattery> {
    const source = store.batteries.find((b) => b.id === id);
    if (!source) throw new Error(`Battery with id ${id} not found`);

    const sourceQueries = store.queries.filter((q) => q.battery_id === id);
    const newVersion = source.version + 1;
    const newBatteryId = crypto.randomUUID();

    const newBattery: QueryBattery = {
      ...source,
      id: newBatteryId,
      name: newName || `${source.name} (Copia V${newVersion})`,
      code: `${source.code}_V${newVersion}_COPY`,
      version: newVersion,
      is_frozen: false,
      frozen_at: undefined,
      frozen_by: undefined,
      battery_type: 'DYNAMIC_DISCOVERY',
      status: 'DRAFT',
      query_count: sourceQueries.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.batteries.push(newBattery);

    // Duplicate all queries under the new battery ID
    const duplicatedQueries: QueryItem[] = sourceQueries.map((q) => ({
      ...q,
      id: crypto.randomUUID(),
      battery_id: newBatteryId,
      is_fixed: false,
      version: newVersion,
      status: 'PROPOSED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    store.queries.push(...duplicatedQueries);

    return newBattery;
  },
  async freezeBattery(id: string, frozenBy: string = 'analyst'): Promise<QueryBattery> {
    const battery = store.batteries.find((b) => b.id === id);
    if (!battery) throw new Error(`Battery with id ${id} not found`);
    if (battery.is_frozen) return battery;

    battery.is_frozen = true;
    battery.status = 'FROZEN';
    battery.battery_type = 'FROZEN_MEASUREMENT';
    battery.frozen_at = new Date().toISOString();
    battery.frozen_by = frozenBy;
    battery.updated_at = new Date().toISOString();

    // Mark queries as fixed
    store.queries
      .filter((q) => q.battery_id === id)
      .forEach((q) => {
        q.is_fixed = true;
        q.status = 'ACTIVE';
      });

    await this.logAuditEvent({
      event_type: 'battery_freeze',
      target_entity: 'query_batteries',
      entity_id: id,
      metadata: { code: battery.code, version: battery.version, query_count: battery.query_count },
    });

    return { ...battery };
  },

  // Queries
  async getQueries(batteryId?: string): Promise<QueryItem[]> {
    if (batteryId) {
      return store.queries.filter((q) => q.battery_id === batteryId);
    }
    return [...store.queries];
  },
  async addQueries(queries: Array<Omit<QueryItem, 'id' | 'created_at' | 'updated_at'>>): Promise<QueryItem[]> {
    const created: QueryItem[] = queries.map((q) => ({
      ...q,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    store.queries.push(...created);

    // Update battery query count
    if (created.length > 0 && created[0].battery_id) {
      const battery = store.batteries.find((b) => b.id === created[0].battery_id);
      if (battery) {
        battery.query_count = store.queries.filter((q) => q.battery_id === battery.id).length;
      }
    }
    return created;
  },
  async updateQuery(id: string, updates: Partial<QueryItem>): Promise<QueryItem> {
    const index = store.queries.findIndex((q) => q.id === id);
    if (index === -1) throw new Error(`Query ${id} not found`);
    const query = store.queries[index];
    const battery = store.batteries.find((b) => b.id === query.battery_id);
    if (battery && battery.is_frozen) {
      throw new Error('No se pueden modificar consultas de una batería congelada (inmutable)');
    }
    store.queries[index] = { ...query, ...updates, updated_at: new Date().toISOString() };
    return store.queries[index];
  },
  async deleteQuery(id: string): Promise<void> {
    const query = store.queries.find((q) => q.id === id);
    if (query) {
      const battery = store.batteries.find((b) => b.id === query.battery_id);
      if (battery && battery.is_frozen) {
        throw new Error('No se pueden eliminar consultas de una batería congelada (inmutable)');
      }
    }
    store.queries = store.queries.filter((q) => q.id !== id);
  },

  // Query Runs & Results
  async getRuns(): Promise<QueryRun[]> {
    return [...store.queryRuns];
  },
  async getRunsByBattery(batteryId: string): Promise<QueryRun[]> {
    return store.queryRuns.filter((r) => r.battery_id === batteryId);
  },
  async getRun(id: string): Promise<QueryRun | undefined> {
    return store.queryRuns.find((r) => r.id === id);
  },
  async createRun(run: Omit<QueryRun, 'id' | 'created_at'>): Promise<QueryRun> {
    const newRun: QueryRun = {
      ...run,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    store.queryRuns.push(newRun);
    return newRun;
  },
  async updateRun(id: string, updates: Partial<QueryRun>): Promise<QueryRun> {
    const index = store.queryRuns.findIndex((r) => r.id === id);
    if (index === -1) throw new Error(`Run ${id} not found`);
    store.queryRuns[index] = { ...store.queryRuns[index], ...updates };
    return store.queryRuns[index];
  },
  async addQueryResult(result: Omit<QueryResult, 'id' | 'created_at'>): Promise<QueryResult> {
    const newResult: QueryResult = {
      ...result,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    store.queryResults.push(newResult);
    return newResult;
  },
  async getRunResults(runId: string): Promise<QueryResult[]> {
    return store.queryResults.filter((r) => r.run_id === runId);
  },
  async addMentionAnalysis(analysis: Omit<QueryMentionAnalysis, 'id'>): Promise<QueryMentionAnalysis> {
    const newAnalysis: QueryMentionAnalysis = {
      ...analysis,
      id: crypto.randomUUID(),
    };
    store.mentions.push(newAnalysis);
    return newAnalysis;
  },
  async getMentions(): Promise<QueryMentionAnalysis[]> {
    return [...store.mentions];
  },
  async getMentionsByRun(runId: string): Promise<QueryMentionAnalysis[]> {
    const runResultIds = new Set(
      store.queryResults.filter((r) => r.run_id === runId).map((r) => r.id)
    );
    return store.mentions.filter(
      (m) => (m.run_id && m.run_id === runId) || (m.result_id && runResultIds.has(m.result_id))
    );
  },

  // Brand Domain Helper
  async getConfiguredDomain(): Promise<string | null> {
    const brand = store.brands[0];
    if (!brand || !brand.website_url) return null;
    const normalized = normalizeDomain(brand.website_url);
    return normalized.length > 0 ? normalized : null;
  },

  // Visibility Snapshots
  async getSnapshots(): Promise<VisibilitySnapshot[]> {
    return [...store.snapshots];
  },
  async getSnapshotsByBattery(batteryId: string): Promise<VisibilitySnapshot[]> {
    return store.snapshots.filter((s) => s.battery_id === batteryId);
  },
  async addSnapshot(snapshot: Omit<VisibilitySnapshot, 'id'>): Promise<VisibilitySnapshot> {
    const newSnapshot: VisibilitySnapshot = {
      ...snapshot,
      id: crypto.randomUUID(),
    };
    store.snapshots.push(newSnapshot);
    return newSnapshot;
  },

  // Suppliers & Contacts
  async getSuppliers(): Promise<Supplier[]> {
    return [...store.suppliers];
  },
  async addSupplier(supplier: Omit<Supplier, 'id'>): Promise<Supplier> {
    const newSupplier: Supplier = {
      ...supplier,
      id: crypto.randomUUID(),
    };
    store.suppliers.push(newSupplier);
    return newSupplier;
  },
  async updateSupplier(id: string, updates: Partial<Supplier>): Promise<Supplier> {
    const index = store.suppliers.findIndex((s) => s.id === id);
    if (index === -1) throw new Error(`Supplier ${id} not found`);
    store.suppliers[index] = { ...store.suppliers[index], ...updates };
    return store.suppliers[index];
  },

  // RFQs & Quotes
  async getRFQs(): Promise<RFQ[]> {
    return [...store.rfqs];
  },
  async getRFQ(id: string): Promise<RFQ | undefined> {
    return store.rfqs.find((r) => r.id === id);
  },
  async createRFQ(rfq: Omit<RFQ, 'id' | 'created_at' | 'updated_at'>): Promise<RFQ> {
    const newRFQ: RFQ = {
      ...rfq,
      status: rfq.status || 'DRAFT',
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.rfqs.push(newRFQ);
    return newRFQ;
  },
  async updateRFQ(id: string, updates: Partial<RFQ>): Promise<RFQ> {
    const index = store.rfqs.findIndex((r) => r.id === id);
    if (index === -1) throw new Error(`RFQ ${id} not found`);
    store.rfqs[index] = { ...store.rfqs[index], ...updates, updated_at: new Date().toISOString() };
    return store.rfqs[index];
  },
  async getQuotes(): Promise<SupplierQuote[]> {
    return [...store.quotes];
  },
  async addQuote(quote: Omit<SupplierQuote, 'id' | 'created_at'>): Promise<SupplierQuote> {
    const newQuote: SupplierQuote = {
      ...quote,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    store.quotes.push(newQuote);
    return newQuote;
  },
  async createQuote(quote: Omit<SupplierQuote, 'id' | 'created_at'>): Promise<SupplierQuote> {
    return this.addQuote(quote);
  },
  async updateQuote(id: string, updates: Partial<SupplierQuote>): Promise<SupplierQuote> {
    const index = store.quotes.findIndex((q) => q.id === id);
    if (index === -1) throw new Error(`Quote ${id} not found`);
    store.quotes[index] = { ...store.quotes[index], ...updates };
    return store.quotes[index];
  },

  // Market Price Observations
  async getMarketPrices(organizationId?: string): Promise<MarketPriceObservation[]> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('market_price_observations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('observation_date', { ascending: false });
      if (error) throw new Error(`market_price_observations: ${error.message}`);
      return (data ?? []) as MarketPriceObservation[];
    }
    return [...store.marketPrices];
  },
  async addMarketPrice(price: Omit<MarketPriceObservation, 'id'>): Promise<MarketPriceObservation> {
    const newPrice: MarketPriceObservation = {
      ...price,
      id: crypto.randomUUID(),
    };
    store.marketPrices.push(newPrice);
    return newPrice;
  },

  // Cost Sheets & Process
  async getCostSheets(): Promise<CostSheetVersion[]> {
    return [...store.costSheets];
  },
  async getCostSheet(id: string): Promise<CostSheetVersion | undefined> {
    return store.costSheets.find((c) => c.id === id);
  },
  async getActiveCostSheetForSKU(sku: string, organizationId?: string): Promise<CostSheetVersion | undefined> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const { data: dbSheet, error: sheetError } = await supabaseAdmin
        .from('cost_sheet_versions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('sku', sku)
        .eq('status', 'ACTIVE')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sheetError) throw new Error(`cost_sheet_versions: ${sheetError.message}`);
      if (!dbSheet) return undefined;
      const { data: dbComponents, error: componentError } = await supabaseAdmin
        .from('cost_components')
        .select('*')
        .eq('cost_sheet_id', dbSheet.id)
        .order('created_at');
      if (componentError) throw new Error(`cost_components: ${componentError.message}`);
      return {
        ...dbSheet,
        components: (dbComponents ?? []) as CostSheetVersion['components'],
      } as CostSheetVersion;
    }
    return store.costSheets.find((c) => c.sku === sku && c.status === 'ACTIVE');
  },
  async saveCostSheet(sheet: CostSheetVersion, organizationId?: string): Promise<CostSheetVersion> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const skus = await this.getSKUs(organizationId);
      const skuRecord = skus.find((candidate) => candidate.sku === sheet.sku);
      if (!skuRecord) throw new Error(`SKU ${sheet.sku} is not present in the product master`);

      const { data: existing, error: existingError } = await supabaseAdmin
        .from('cost_sheet_versions')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('sku', sheet.sku)
        .eq('version', sheet.version)
        .maybeSingle();
      if (existingError) throw new Error(`cost_sheet_versions: ${existingError.message}`);

      const record = {
        ...(existing?.id ? { id: existing.id } : {}),
        organization_id: organizationId,
        product_id: sheet.product_id || skuRecord.product_id,
        sku: sheet.sku,
        version: sheet.version,
        name: sheet.name,
        batch_size: sheet.batch_size,
        effective_date: sheet.effective_date,
        status: sheet.status,
        true_unit_cost_usd: sheet.true_unit_cost_usd,
        minimum_sustainable_price_usd: sheet.minimum_sustainable_price_usd,
        break_even_units: sheet.break_even_units,
        notes: sheet.notes,
        updated_at: new Date().toISOString(),
      };
      const { data: saved, error: saveError } = await supabaseAdmin
        .from('cost_sheet_versions')
        .upsert(record)
        .select('*')
        .single();
      if (saveError) throw new Error(`cost_sheet_versions: ${saveError.message}`);

      const { error: deleteComponentsError } = await supabaseAdmin
        .from('cost_components')
        .delete()
        .eq('cost_sheet_id', saved.id);
      if (deleteComponentsError) throw new Error(`cost_components: ${deleteComponentsError.message}`);

      for (const component of sheet.components ?? []) {
        const { error: componentError } = await supabaseAdmin
          .from('cost_components')
          .insert({
            id: component.id,
            cost_sheet_id: saved.id,
            category: component.category,
            name: component.name,
            component_type: component.component_type,
            basis: component.basis,
            rate_usd: component.rate_usd,
            quantity: component.quantity,
            unit_of_measure: component.unit_of_measure,
            effective_date: component.effective_date,
            notes: component.notes,
            updated_at: new Date().toISOString(),
          });
        if (componentError) throw new Error(`cost_components: ${componentError.message}`);
      }
      return { ...saved, components: sheet.components } as CostSheetVersion;
    }
    const index = store.costSheets.findIndex((c) => c.id === sheet.id);
    if (index >= 0) {
      store.costSheets[index] = sheet;
    } else {
      store.costSheets.push(sheet);
    }
    await this.logAuditEvent({
      event_type: 'cost_edit',
      target_entity: 'cost_sheet_versions',
      entity_id: sheet.id,
      metadata: { sku: sheet.sku, version: sheet.version, true_cost: sheet.true_unit_cost_usd },
    });
    return sheet;
  },
  async getIndustrialCostInputs(): Promise<IndustrialProductCostInput[]> {
    return [...store.industrialCostInputs];
  },
  async getCostV1Configuration(sku: string, organizationId?: string): Promise<CostV1Configuration | undefined> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('cost_v1_configurations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('sku', sku)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw new Error(`cost_v1_configurations: ${error.message}`);
      if (!data) return undefined;
      return {
        id: data.id,
        organization_id: data.organization_id,
        product_id: data.product_id,
        sku: data.sku,
        input: data.input_json as IndustrialProductCostInput,
        version: Number(data.version),
        is_active: Boolean(data.is_active),
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    }

    const input = store.industrialCostInputs.find((candidate) => candidate.sku === sku);
    return input
      ? { sku, input, version: 1, is_active: true }
      : undefined;
  },
  async getIndustrialCostInput(sku: string, organizationId?: string): Promise<IndustrialProductCostInput | undefined> {
    const configuration = await this.getCostV1Configuration(sku, organizationId);
    return configuration?.input;
  },
  async saveCostV1Configuration(
    configuration: CostV1Configuration,
    organizationId?: string,
    actorId?: string
  ): Promise<CostV1Configuration> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const skuRecord = (await this.getSKUs(organizationId)).find((candidate) => candidate.sku === configuration.sku);
      if (!skuRecord?.product_id) throw new Error(`SKU ${configuration.sku} is not present in the product master`);

      const record = {
        organization_id: organizationId,
        product_id: configuration.product_id || skuRecord.product_id,
        sku: configuration.sku,
        input_json: configuration.input,
        version: configuration.version || 1,
        is_active: true,
        created_by: actorId,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin
        .from('cost_v1_configurations')
        .upsert(record, { onConflict: 'organization_id,sku' })
        .select('*')
        .single();
      if (error) throw new Error(`cost_v1_configurations: ${error.message}`);
      const { error: auditError } = await supabaseAdmin.from('audit_events').insert({
        organization_id: organizationId,
        actor_id: actorId,
        event_type: 'cost_edit',
        target_entity: 'cost_v1_configurations',
        entity_id: data.id,
        metadata_json: { sku: configuration.sku, version: configuration.version || 1 },
      });
      if (auditError) throw new Error(`audit_events: ${auditError.message}`);
      return {
        id: data.id,
        organization_id: data.organization_id,
        product_id: data.product_id,
        sku: data.sku,
        input: data.input_json as IndustrialProductCostInput,
        version: Number(data.version),
        is_active: Boolean(data.is_active),
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    }

    await this.saveIndustrialCostInput(configuration.input);
    return configuration;
  },
  async getIndustrialCostInputForOrganization(sku: string, organizationId: string): Promise<IndustrialProductCostInput | undefined> {
    return this.getIndustrialCostInput(sku, organizationId);
  },
  async saveIndustrialCostInput(input: IndustrialProductCostInput, organizationId?: string, actorId?: string): Promise<IndustrialProductCostInput> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      await this.saveCostV1Configuration({
        sku: input.sku,
        input,
        version: 1,
        is_active: true,
      }, organizationId, actorId);
      return input;
    }
    const index = store.industrialCostInputs.findIndex((i) => i.sku === input.sku);
    if (index >= 0) {
      store.industrialCostInputs[index] = input;
    } else {
      store.industrialCostInputs.push(input);
    }
    await this.logAuditEvent({
      event_type: 'cost_edit',
      target_entity: 'industrial_cost_input',
      entity_id: input.sku,
      metadata: { sku: input.sku, batch_size: input.batch_size },
    });
    return input;
  },
  async getProcessDefinition(sku: string): Promise<ProcessDefinition | undefined> {
    return store.processes.find((p) => p.sku === sku && p.is_active);
  },
  async saveProcessDefinition(proc: ProcessDefinition): Promise<ProcessDefinition> {
    const index = store.processes.findIndex((p) => p.id === proc.id);
    if (index >= 0) {
      store.processes[index] = proc;
    } else {
      store.processes.push(proc);
    }
    return proc;
  },

  // Scenarios
  async getScenarios(): Promise<CostScenario[]> {
    return [...store.scenarios];
  },
  async addScenario(scenario: Omit<CostScenario, 'id'>): Promise<CostScenario> {
    const newScenario: CostScenario = {
      ...scenario,
      id: crypto.randomUUID(),
    };
    store.scenarios.push(newScenario);
    return newScenario;
  },

  // Action Center
  async getActions(): Promise<ActionItem[]> {
    return [...store.actions];
  },
  async addAction(action: Omit<ActionItem, 'id' | 'created_at'>): Promise<ActionItem> {
    const newAction: ActionItem = {
      ...action,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    store.actions.push(newAction);
    return newAction;
  },
  async updateAction(id: string, updates: Partial<ActionItem>): Promise<ActionItem> {
    const index = store.actions.findIndex((a) => a.id === id);
    if (index === -1) throw new Error(`Action ${id} not found`);
    store.actions[index] = { ...store.actions[index], ...updates };
    return store.actions[index];
  },

  // Persistent Jobs
  async getJobs(): Promise<JobRun[]> {
    return [...store.jobs];
  },
  async getJob(id: string): Promise<JobRun | undefined> {
    return store.jobs.find((j) => j.id === id);
  },
  async getJobByIdempotencyKey(key: string): Promise<JobRun | undefined> {
    return store.jobs.find((j) => j.idempotency_key === key);
  },
  async createJob(job: Omit<JobRun, 'id' | 'created_at'>): Promise<JobRun> {
    const newJob: JobRun = {
      ...job,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    store.jobs.push(newJob);
    return newJob;
  },
  async updateJob(id: string, updates: Partial<JobRun>): Promise<JobRun> {
    const index = store.jobs.findIndex((j) => j.id === id);
    if (index === -1) throw new Error(`Job ${id} not found`);
    store.jobs[index] = { ...store.jobs[index], ...updates };
    return store.jobs[index];
  },

  // Audit Events
  async logAuditEvent(event: Omit<AuditEvent, 'id' | 'organization_id' | 'created_at'>): Promise<AuditEvent> {
    const newEvent: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      organization_id: store.organizations[0].id,
      created_at: new Date().toISOString(),
    };
    store.auditEvents.push(newEvent);
    return newEvent;
  },
  async getAuditEvents(): Promise<AuditEvent[]> {
    return [...store.auditEvents].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  // Copilot Threads, Messages & Actions
  async getCopilotThreads(userId?: string): Promise<CopilotThread[]> {
    if (userId) {
      return store.copilotThreads.filter((t) => t.user_id === userId);
    }
    return [...store.copilotThreads].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },

  async createCopilotThread(thread: Omit<CopilotThread, 'id' | 'created_at' | 'updated_at'>): Promise<CopilotThread> {
    const now = new Date().toISOString();
    const newThread: CopilotThread = {
      ...thread,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    };
    store.copilotThreads.push(newThread);
    return newThread;
  },

  async getCopilotMessages(threadId: string): Promise<CopilotMessage[]> {
    return store.copilotMessages
      .filter((m) => m.thread_id === threadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  async addCopilotMessage(msg: Omit<CopilotMessage, 'id' | 'created_at'>): Promise<CopilotMessage> {
    const newMsg: CopilotMessage = {
      ...msg,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    store.copilotMessages.push(newMsg);

    // Update parent thread timestamp
    const threadIndex = store.copilotThreads.findIndex((t) => t.id === msg.thread_id);
    if (threadIndex !== -1) {
      store.copilotThreads[threadIndex].updated_at = newMsg.created_at;
    }
    return newMsg;
  },

  async getCopilotActions(threadId?: string): Promise<CopilotAction[]> {
    if (threadId) {
      return store.copilotActions.filter((a) => a.thread_id === threadId);
    }
    return [...store.copilotActions];
  },

  async addCopilotAction(action: Omit<CopilotAction, 'id' | 'created_at'>): Promise<CopilotAction> {
    const newAction: CopilotAction = {
      ...action,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    store.copilotActions.push(newAction);
    return newAction;
  },

  async updateCopilotActionStatus(
    actionId: string,
    status: CopilotAction['status']
  ): Promise<CopilotAction | null> {
    const idx = store.copilotActions.findIndex((a) => a.id === actionId);
    if (idx === -1) return null;
    store.copilotActions[idx].status = status;
    return store.copilotActions[idx];
  },

  // FX & Exchange Rates
  async getFxSettings(): Promise<FxSettings> {
    return { ...store.fxSettings };
  },

  async updateFxSettings(updates: Partial<FxSettings>): Promise<FxSettings> {
    store.fxSettings = {
      ...store.fxSettings,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    return { ...store.fxSettings };
  },

  async getLatestFxRate(base: string = 'USD', quote: string = 'PYG'): Promise<FxRate> {
    const matching = store.fxRates
      .filter((r) => r.base_currency === base && r.quote_currency === quote && r.is_active)
      .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
    if (matching.length > 0) return { ...matching[0] };
    return { ...INITIAL_FX_RATES[0] };
  },

  async addFxRate(rate: Omit<FxRate, 'id' | 'created_at'>): Promise<FxRate> {
    const newRate: FxRate = {
      ...rate,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    store.fxRates.unshift(newRate);
    return newRate;
  },

  async getFxRateHistory(limit: number = 30): Promise<FxRate[]> {
    return store.fxRates.slice(0, limit);
  },

  // Packaging Specs
  async getPackagingSpecs(): Promise<ProductPackagingSpec[]> {
    return [...store.packagingSpecs];
  },

  async getPackagingSpec(sku: string): Promise<ProductPackagingSpec | undefined> {
    const spec = store.packagingSpecs.find((s) => s.sku === sku);
    if (spec) return { ...spec };
    // Fallback default
    return {
      sku,
      units_per_box: 1000,
      box_length_cm: 50,
      box_width_cm: 40,
      box_height_cm: 45,
      box_weight_kg: 9.5,
      box_volume_m3: 0.09,
    };
  },

  async updatePackagingSpec(spec: ProductPackagingSpec): Promise<ProductPackagingSpec> {
    const idx = store.packagingSpecs.findIndex((s) => s.sku === spec.sku);
    if (idx !== -1) {
      store.packagingSpecs[idx] = { ...spec };
    } else {
      store.packagingSpecs.push({ ...spec });
    }
    return spec;
  },

  // Quote-to-Cost Matches
  async getQuoteMatches(): Promise<QuoteMatchResult[]> {
    return [...store.quoteMatches];
  },

  async saveQuoteMatch(match: Omit<QuoteMatchResult, 'id' | 'created_at'>): Promise<QuoteMatchResult> {
    const newMatch: QuoteMatchResult = {
      ...match,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    store.quoteMatches.unshift(newMatch);
    return newMatch;
  },

  // Industrial Processes V2 — Plant Parameters
  async getPlantParameters(organizationId?: string): Promise<PlantGeneralParameters> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('plant_process_parameters')
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla plant_process_parameters no encontrada en Supabase (migración 20261008000001_industrial_processes_v2.sql pendiente). Usando store en memoria.');
            return { ...store.plantParameters };
          }
          throw new Error(`plant_process_parameters: ${error.message}`);
        }

        if (data) {
          return {
            id: data.id,
            organization_id: data.organization_id,
            electricity_rate_pyg_kwh: Number(data.electricity_rate_pyg_kwh),
            monthly_salary_hours: Number(data.monthly_salary_hours),
            labor_charges_percent: Number(data.labor_charges_percent),
            operator_monthly_salary_pyg: Number(data.operator_monthly_salary_pyg),
            packer_monthly_salary_pyg: Number(data.packer_monthly_salary_pyg),
            gen1_machines_count: Number(data.gen1_machines_count),
            gen1_power_kw: Number(data.gen1_power_kw),
            gen1_operators_count: Number(data.gen1_operators_count),
            gen1_operating_hours: Number(data.gen1_operating_hours),
            gen2_machines_count: Number(data.gen2_machines_count),
            gen2_power_kw: Number(data.gen2_power_kw),
            gen2_operators_count: Number(data.gen2_operators_count),
            gen2_operating_hours: Number(data.gen2_operating_hours),
            quality_inspectors_count: Number(data.quality_inspectors_count),
            quality_monthly_salary_pyg: Number(data.quality_monthly_salary_pyg),
            quality_polypaper_percent: Number(data.quality_polypaper_percent),
            quality_labor_charges_included: Boolean(data.quality_labor_charges_included),
            packaging_materials_cost_per_thousand_usd: Number(data.packaging_materials_cost_per_thousand_usd),
            updated_at: data.updated_at,
            updated_by: data.updated_by,
          };
        }

        // Insert default if not present
        const defaultRecord = {
          ...INITIAL_PLANT_PARAMETERS,
          id: crypto.randomUUID(),
          organization_id: organizationId,
          updated_at: new Date().toISOString(),
        };
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from('plant_process_parameters')
          .insert(defaultRecord)
          .select('*')
          .single();

        if (insertError) {
          if (isSchemaMissingError(insertError)) {
            console.warn('[Industrial Processes V2] Tabla plant_process_parameters pendiente en Supabase. Usando store en memoria.');
            return { ...store.plantParameters };
          }
          throw new Error(`plant_process_parameters insert: ${insertError.message}`);
        }
        return inserted as PlantGeneralParameters;
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema en plant_process_parameters. Usando store en memoria.', err.message);
          return { ...store.plantParameters };
        }
        throw err;
      }
    }
    return { ...store.plantParameters };
  },

  async updatePlantParameters(
    params: Partial<PlantGeneralParameters>,
    organizationId?: string,
    actorId?: string
  ): Promise<PlantGeneralParameters> {
    const orgId = organizationId || store.organizations[0].id;
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const record = {
          ...params,
          organization_id: orgId,
          updated_at: new Date().toISOString(),
          updated_by: actorId,
        };
        const { data, error } = await supabaseAdmin
          .from('plant_process_parameters')
          .upsert(record, { onConflict: 'organization_id' })
          .select('*')
          .single();

        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla plant_process_parameters no encontrada en Supabase. Guardando en memoria local.');
            store.plantParameters = { ...store.plantParameters, ...params, updated_at: new Date().toISOString() };
            return { ...store.plantParameters };
          }
          throw new Error(`plant_process_parameters update: ${error.message}`);
        }
        return data as PlantGeneralParameters;
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema al actualizar parámetros. Guardando en memoria local.', err.message);
          store.plantParameters = { ...store.plantParameters, ...params, updated_at: new Date().toISOString() };
          return { ...store.plantParameters };
        }
        throw err;
      }
    }
    store.plantParameters = {
      ...store.plantParameters,
      ...params,
      updated_at: new Date().toISOString(),
    };
    return { ...store.plantParameters };
  },

  // Industrial Processes V2 — Packing Stopwatch Sessions
  async getPackingSessions(
    filters?: { status?: PackingSessionStatus; line_name?: string; period?: string; sku?: string },
    organizationId?: string
  ): Promise<PackingSession[]> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        let query = supabaseAdmin
          .from('packing_sessions')
          .select('*, packing_session_segments(*)')
          .eq('organization_id', organizationId);
        if (filters?.status) query = query.eq('status', filters.status);
        if (filters?.line_name) query = query.eq('line_name', filters.line_name);
        if (filters?.sku) query = query.eq('sku', filters.sku);
        query = query.order('started_at', { ascending: false });

        const { data, error } = await query;
        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla packing_sessions pendiente en Supabase. Usando store en memoria.');
          } else {
            throw new Error(`packing_sessions: ${error.message}`);
          }
        } else if (data) {
          return (data || []).map((row: any) => ({
            ...row,
            total_person_hours: Number(row.total_person_hours),
            total_duration_minutes: Number(row.total_duration_minutes),
            segments: (row.packing_session_segments || []).sort(
              (a: any, b: any) => a.segment_order - b.segment_order
            ),
          }));
        }
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema en packing_sessions. Usando store en memoria.', err.message);
        } else {
          throw err;
        }
      }
    }

    let sessions = [...store.packingSessions];
    if (filters?.status) sessions = sessions.filter((s) => s.status === filters.status);
    if (filters?.line_name) sessions = sessions.filter((s) => s.line_name === filters.line_name);
    if (filters?.sku) sessions = sessions.filter((s) => s.sku === filters.sku);
    if (filters?.period) {
      sessions = sessions.filter((s) => s.started_at.startsWith(filters.period!));
    }
    return sessions.sort((a, b) => b.started_at.localeCompare(a.started_at));
  },

  async getPackingSession(id: string, organizationId?: string): Promise<PackingSession | undefined> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('packing_sessions')
          .select('*, packing_session_segments(*)')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla packing_sessions pendiente. Usando store en memoria.');
          } else {
            throw new Error(`packing_sessions: ${error.message}`);
          }
        } else if (data) {
          return {
            ...data,
            total_person_hours: Number(data.total_person_hours),
            total_duration_minutes: Number(data.total_duration_minutes),
            segments: (data.packing_session_segments || []).sort(
              (a: any, b: any) => a.segment_order - b.segment_order
            ),
          };
        }
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema al leer sesión. Usando memoria.', err.message);
        } else {
          throw err;
        }
      }
    }
    return store.packingSessions.find((s) => s.id === id);
  },

  async startPackingSession(
    data: {
      line_name: string;
      sku?: string;
      production_order?: string;
      initial_headcount: number;
      reason?: string;
      operator_user_id?: string;
    },
    organizationId?: string
  ): Promise<PackingSession> {
    const orgId = organizationId || store.organizations[0].id;
    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const segmentId = crypto.randomUUID();
    const codeSuffix = Date.now().toString().slice(-6);
    const session_code = `SES-${codeSuffix}`;
    const headcount = Math.max(1, Math.round(data.initial_headcount || 1));

    const initialSegment: PackingSessionSegment = {
      id: segmentId,
      session_id: sessionId,
      segment_order: 1,
      headcount,
      started_at: now,
      duration_minutes: 0,
      person_hours: 0,
      reason: data.reason || 'Inicio de sesión',
    };

    const newSession: PackingSession = {
      id: sessionId,
      organization_id: orgId,
      session_code,
      line_name: data.line_name,
      sku: data.sku,
      production_order: data.production_order,
      operator_user_id: data.operator_user_id,
      started_at: now,
      status: 'RUNNING',
      total_person_hours: 0,
      total_duration_minutes: 0,
      segments: [initialSegment],
      created_at: now,
      updated_at: now,
    };

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data: created, error } = await supabaseAdmin
          .from('packing_sessions')
          .insert({
            id: newSession.id,
            organization_id: newSession.organization_id,
            session_code: newSession.session_code,
            line_name: newSession.line_name,
            sku: newSession.sku,
            production_order: newSession.production_order,
            operator_user_id: newSession.operator_user_id,
            started_at: newSession.started_at,
            status: newSession.status,
            total_person_hours: 0,
            total_duration_minutes: 0,
            created_at: now,
            updated_at: now,
          })
          .select('*')
          .single();

        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla packing_sessions pendiente en Supabase. Guardando en memoria local.');
          } else {
            throw new Error(`create packing session: ${error.message}`);
          }
        } else {
          const { error: segError } = await supabaseAdmin
            .from('packing_session_segments')
            .insert({
              id: initialSegment.id,
              session_id: sessionId,
              segment_order: 1,
              headcount,
              started_at: now,
              reason: initialSegment.reason,
            });
          if (segError && !isSchemaMissingError(segError)) {
            throw new Error(`create initial segment: ${segError.message}`);
          }
          if (created) {
            return { ...created, segments: [initialSegment] } as PackingSession;
          }
        }
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema al iniciar sesión. Guardando en memoria.', err.message);
        } else {
          throw err;
        }
      }
    }

    store.packingSessions.unshift(newSession);
    return newSession;
  },

  async changePackingHeadcount(
    sessionId: string,
    newHeadcount: number,
    reason?: string,
    organizationId?: string
  ): Promise<PackingSession> {
    const session = await this.getPackingSession(sessionId, organizationId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status !== 'RUNNING') throw new Error(`Cannot change headcount on session with status ${session.status}`);

    const now = new Date().toISOString();
    const segments = session.segments || [];
    const openSegment = segments.find((s) => !s.ended_at);

    if (openSegment) {
      openSegment.ended_at = now;
      const durationMs = Math.max(0, new Date(now).getTime() - new Date(openSegment.started_at).getTime());
      openSegment.duration_minutes = Number((durationMs / 60000).toFixed(2));
      openSegment.person_hours = Number(((openSegment.duration_minutes / 60) * openSegment.headcount).toFixed(3));
    }

    const nextOrder = segments.length + 1;
    const headcount = Math.max(1, Math.round(newHeadcount));
    const newSegment: PackingSessionSegment = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      segment_order: nextOrder,
      headcount,
      started_at: now,
      duration_minutes: 0,
      person_hours: 0,
      reason: reason || `Cambio de dotación a ${headcount} operarios`,
    };
    segments.push(newSegment);

    const totalMinutes = segments.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const totalPersonHours = segments.reduce((sum, s) => sum + (s.person_hours || 0), 0);

    session.segments = segments;
    session.total_duration_minutes = Number(totalMinutes.toFixed(2));
    session.total_person_hours = Number(totalPersonHours.toFixed(3));
    session.updated_at = now;

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        if (openSegment) {
          await supabaseAdmin
            .from('packing_session_segments')
            .update({
              ended_at: openSegment.ended_at,
              duration_minutes: openSegment.duration_minutes,
              person_hours: openSegment.person_hours,
            })
            .eq('id', openSegment.id);
        }
        await supabaseAdmin
          .from('packing_session_segments')
          .insert({
            id: newSegment.id,
            session_id: sessionId,
            segment_order: nextOrder,
            headcount,
            started_at: now,
            reason: newSegment.reason,
          });

        await supabaseAdmin
          .from('packing_sessions')
          .update({
            total_duration_minutes: session.total_duration_minutes,
            total_person_hours: session.total_person_hours,
            updated_at: now,
          })
          .eq('id', sessionId);
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Supabase schema pendiente al actualizar segmentos. Guardando en memoria.');
        } else {
          throw err;
        }
      }
    }

    return session;
  },

  async stopPackingSession(sessionId: string, organizationId?: string): Promise<PackingSession> {
    const session = await this.getPackingSession(sessionId, organizationId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status !== 'RUNNING') return session;

    const now = new Date().toISOString();
    const segments = session.segments || [];
    const openSegment = segments.find((s) => !s.ended_at);

    if (openSegment) {
      openSegment.ended_at = now;
      const durationMs = Math.max(0, new Date(now).getTime() - new Date(openSegment.started_at).getTime());
      openSegment.duration_minutes = Number((durationMs / 60000).toFixed(2));
      openSegment.person_hours = Number(((openSegment.duration_minutes / 60) * openSegment.headcount).toFixed(3));
    }

    const totalMinutes = segments.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const totalPersonHours = segments.reduce((sum, s) => sum + (s.person_hours || 0), 0);

    session.status = 'STOPPED';
    session.stopped_at = now;
    session.total_duration_minutes = Number(totalMinutes.toFixed(2));
    session.total_person_hours = Number(totalPersonHours.toFixed(3));
    session.updated_at = now;

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        if (openSegment) {
          await supabaseAdmin
            .from('packing_session_segments')
            .update({
              ended_at: openSegment.ended_at,
              duration_minutes: openSegment.duration_minutes,
              person_hours: openSegment.person_hours,
            })
            .eq('id', openSegment.id);
        }
        await supabaseAdmin
          .from('packing_sessions')
          .update({
            status: 'STOPPED',
            stopped_at: now,
            total_duration_minutes: session.total_duration_minutes,
            total_person_hours: session.total_person_hours,
            updated_at: now,
          })
          .eq('id', sessionId);
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Supabase schema pendiente al detener sesión. Guardando en memoria.');
        } else {
          throw err;
        }
      }
    }

    return session;
  },

  async approvePackingSession(sessionId: string, approverId?: string, organizationId?: string): Promise<PackingSession> {
    let session = await this.getPackingSession(sessionId, organizationId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    if (session.status === 'RUNNING') {
      session = await this.stopPackingSession(sessionId, organizationId);
    }

    const now = new Date().toISOString();
    session.status = 'APPROVED';
    session.approved_at = now;
    session.approved_by = approverId;
    session.updated_at = now;

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        await supabaseAdmin
          .from('packing_sessions')
          .update({
            status: 'APPROVED',
            approved_at: now,
            approved_by: approverId,
            updated_at: now,
          })
          .eq('id', sessionId);
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Supabase schema pendiente al aprobar sesión. Guardando en memoria.');
        } else {
          throw err;
        }
      }
    }

    return session;
  },

  async correctPackingSession(
    sessionId: string,
    updates: { total_person_hours?: number; notes?: string },
    organizationId?: string
  ): Promise<PackingSession> {
    const session = await this.getPackingSession(sessionId, organizationId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const now = new Date().toISOString();
    session.status = 'CORRECTED';
    if (updates.total_person_hours !== undefined) {
      session.total_person_hours = Number(updates.total_person_hours);
    }
    if (updates.notes) {
      session.notes = session.notes ? `${session.notes} | Corrección: ${updates.notes}` : updates.notes;
    }
    session.updated_at = now;

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        await supabaseAdmin
          .from('packing_sessions')
          .update({
            status: 'CORRECTED',
            total_person_hours: session.total_person_hours,
            notes: session.notes,
            updated_at: now,
          })
          .eq('id', sessionId);
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Supabase schema pendiente al corregir sesión.');
        } else {
          throw err;
        }
      }
    }

    return session;
  },

  async voidPackingSession(sessionId: string, reason?: string, organizationId?: string): Promise<PackingSession> {
    const session = await this.getPackingSession(sessionId, organizationId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const now = new Date().toISOString();
    session.status = 'VOIDED';
    if (reason) {
      session.notes = session.notes ? `${session.notes} | Anulada: ${reason}` : `Anulada: ${reason}`;
    }
    session.updated_at = now;

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        await supabaseAdmin
          .from('packing_sessions')
          .update({
            status: 'VOIDED',
            notes: session.notes,
            updated_at: now,
          })
          .eq('id', sessionId);
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Supabase schema pendiente al anular sesión.');
        } else {
          throw err;
        }
      }
    }

    return session;
  },

  // Industrial Processes V2 — Production Periods
  async getProductionPeriods(organizationId?: string): Promise<PlantProductionPeriod[]> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('plant_production_periods')
          .select('*')
          .eq('organization_id', organizationId)
          .order('period', { ascending: false });
        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla plant_production_periods pendiente en Supabase.');
          } else {
            throw new Error(`plant_production_periods: ${error.message}`);
          }
        } else if (data) {
          return (data || []).map((row: any) => ({
            ...row,
            good_units_produced: Number(row.good_units_produced),
          }));
        }
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema al leer períodos.');
        } else {
          throw err;
        }
      }
    }
    return [...store.productionPeriods];
  },

  async getProductionPeriod(sku: string, period: string, organizationId?: string): Promise<PlantProductionPeriod | undefined> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('plant_production_periods')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('sku', sku)
          .eq('period', period)
          .maybeSingle();
        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla plant_production_periods pendiente en Supabase.');
          } else {
            throw new Error(`plant_production_periods: ${error.message}`);
          }
        } else if (data) {
          return {
            ...data,
            good_units_produced: Number(data.good_units_produced),
          };
        }
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema al leer período.');
        } else {
          throw err;
        }
      }
    }
    return store.productionPeriods.find((p) => p.sku === sku && p.period === period);
  },

  async saveProductionPeriod(
    periodData: Partial<PlantProductionPeriod> & { sku: string; period: string },
    organizationId?: string
  ): Promise<PlantProductionPeriod> {
    const orgId = organizationId || store.organizations[0].id;
    const now = new Date().toISOString();

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const record = {
          organization_id: orgId,
          sku: periodData.sku,
          period: periodData.period,
          good_units_produced: periodData.good_units_produced ?? 0,
          updated_at: now,
        };
        const { data, error } = await supabaseAdmin
          .from('plant_production_periods')
          .upsert(record, { onConflict: 'organization_id,period,sku' })
          .select('*')
          .single();
        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla plant_production_periods pendiente en Supabase. Guardando en memoria local.');
          } else {
            throw new Error(`save production period: ${error.message}`);
          }
        } else if (data) {
          return {
            ...data,
            good_units_produced: Number(data.good_units_produced),
          };
        }
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema al guardar período. Guardando en memoria.');
        } else {
          throw err;
        }
      }
    }

    const idx = store.productionPeriods.findIndex(
      (p) => p.sku === periodData.sku && p.period === periodData.period
    );
    const updated: PlantProductionPeriod = {
      id: idx >= 0 ? store.productionPeriods[idx].id : crypto.randomUUID(),
      organization_id: orgId,
      sku: periodData.sku,
      period: periodData.period,
      good_units_produced: periodData.good_units_produced ?? 0,
      created_at: idx >= 0 ? store.productionPeriods[idx].created_at : now,
      updated_at: now,
    };
    if (idx >= 0) {
      store.productionPeriods[idx] = updated;
    } else {
      store.productionPeriods.push(updated);
    }
    return updated;
  },

  // Industrial Processes V2 — Process Snapshots
  async getIndustrialProcessSnapshot(sku: string, period: string, organizationId?: string): Promise<IndustrialProcessSnapshot | undefined> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('industrial_process_snapshots')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('sku', sku)
          .eq('period', period)
          .maybeSingle();
        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla industrial_process_snapshots pendiente en Supabase.');
          } else {
            throw new Error(`industrial_process_snapshots: ${error.message}`);
          }
        } else if (data) {
          return {
            ...data,
            calculation_detail: data.detail_json,
          } as IndustrialProcessSnapshot;
        }
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema al leer snapshot.');
        } else {
          throw err;
        }
      }
    }
    return store.industrialSnapshots.find((s) => s.sku === sku && s.period === period);
  },

  async saveIndustrialProcessSnapshot(
    snapshot: Omit<IndustrialProcessSnapshot, 'id'>,
    organizationId?: string
  ): Promise<IndustrialProcessSnapshot> {
    const orgId = organizationId || store.organizations[0].id;
    const now = new Date().toISOString();
    const detailJson = snapshot.detail_json || snapshot.calculation_detail || {};

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        // Table schema has EXACTLY: organization_id, sku, period, detail_json, calculated_at, created_by
        const record = {
          organization_id: orgId,
          sku: snapshot.sku,
          period: snapshot.period,
          detail_json: detailJson,
          calculated_at: now,
          created_by: snapshot.created_by || null,
        };
        const { data, error } = await supabaseAdmin
          .from('industrial_process_snapshots')
          .upsert(record, { onConflict: 'organization_id,period,sku' })
          .select('*')
          .single();
        if (error) {
          if (isSchemaMissingError(error)) {
            console.warn('[Industrial Processes V2] Tabla industrial_process_snapshots pendiente en Supabase. Guardando en memoria local.');
          } else {
            throw new Error(`save process snapshot: ${error.message}`);
          }
        } else if (data) {
          return {
            ...data,
            calculation_detail: data.detail_json,
          } as IndustrialProcessSnapshot;
        }
      } catch (err: any) {
        if (isSchemaMissingError(err)) {
          console.warn('[Industrial Processes V2] Error de esquema al guardar snapshot. Guardando en memoria local.', err.message);
        } else {
          throw err;
        }
      }
    }

    const idx = store.industrialSnapshots.findIndex(
      (s) => s.sku === snapshot.sku && s.period === snapshot.period
    );
    const item: IndustrialProcessSnapshot = {
      id: idx >= 0 ? store.industrialSnapshots[idx].id : crypto.randomUUID(),
      organization_id: orgId,
      sku: snapshot.sku,
      period: snapshot.period,
      detail_json: detailJson,
      calculation_detail: detailJson,
      parameters_snapshot: snapshot.parameters_snapshot,
      calculated_at: now,
      created_by: snapshot.created_by,
      created_at: idx >= 0 ? store.industrialSnapshots[idx].created_at : now,
    };
    if (idx >= 0) {
      store.industrialSnapshots[idx] = item;
    } else {
      store.industrialSnapshots.push(item);
    }
    return item;
  },
};

