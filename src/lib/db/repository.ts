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

function isSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = String((error as { message?: string }).message || '').toLowerCase();
  const code = String((error as { code?: string }).code || '');
  return (
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('relation') ||
    msg.includes('does not exist') ||
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
  async archiveCostSheet(id: string, organizationId?: string): Promise<void> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const { error } = await supabaseAdmin
        .from('cost_sheet_versions')
        .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', organizationId);
      if (error) throw new Error(`cost_sheet_versions archive: ${error.message}`);
      return;
    }
    const target = store.costSheets.find((c) => c.id === id);
    if (target) {
      target.status = 'ARCHIVED';
    }
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
      if (error) {
        throw new Error(`cost_v1_configurations: ${error.message}`);
      }
      if (data) {
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
    // Keep in-memory store synchronized as fallback/cache
    const memIndex = store.industrialCostInputs.findIndex((i) => i.sku === configuration.sku);
    if (memIndex >= 0) {
      store.industrialCostInputs[memIndex] = configuration.input;
    } else {
      store.industrialCostInputs.push(configuration.input);
    }

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
      if (error) {
        throw new Error(`cost_v1_configurations: ${error.message}`);
      }
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
};
