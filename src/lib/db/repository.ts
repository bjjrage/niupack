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
  PackingSessionSegment,
  PackingSessionStatus,
  IndustrialProcessSnapshot,
  IndustrialCostBreakdown,
  IndustrialSector,
  MachineGeneration,
  PlantSalaryBand,
  PlantSalaryBandRate,
  PlantPersonnel,
  PlantPersonnelAssignment,
  PlantPersonnelSalaryAssignment,
  SectorPersonnelSummary,
  SectorPersonnelItem,
  PackingLaborAllocation,
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
  INITIAL_SALARY_BANDS,
  INITIAL_SALARY_BAND_RATES,
  INITIAL_PLANT_PERSONNEL,
  INITIAL_PERSONNEL_ASSIGNMENTS,
  INITIAL_PACKING_LABOR_ALLOCATIONS,
} from './seed-data';
import { supabase, supabaseAdmin, isSupabaseConfigured, isSupabaseAdminConfigured } from './supabase';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';

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

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftIsoDate(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
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
  productionPeriods: PlantProductionPeriod[] = [...INITIAL_PRODUCTION_PERIODS];
  packingSessions: PackingSession[] = [...INITIAL_PACKING_SESSIONS];
  industrialSnapshots: IndustrialProcessSnapshot[] = [];
  salaryBands: PlantSalaryBand[] = [...INITIAL_SALARY_BANDS];
  salaryBandRates: PlantSalaryBandRate[] = [...INITIAL_SALARY_BAND_RATES];
  plantPersonnel: PlantPersonnel[] = [...INITIAL_PLANT_PERSONNEL];
  personnelAssignments: PlantPersonnelAssignment[] = [...INITIAL_PERSONNEL_ASSIGNMENTS];
  personnelSalaryAssignments: PlantPersonnelSalaryAssignment[] = INITIAL_PLANT_PERSONNEL
    .filter((person) => Boolean(person.current_band_id))
    .map((person) => ({
      id: `salary-${person.id}`,
      organization_id: person.organization_id,
      personnel_id: person.id,
      salary_band_id: person.current_band_id!,
      valid_from: '2026-01-01',
      valid_to: null,
    }));
  packingLaborAllocations: PackingLaborAllocation[] = [...INITIAL_PACKING_LABOR_ALLOCATIONS];
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
  async getCostSheets(organizationId?: string, sku?: string): Promise<CostSheetVersion[]> {
    let sheets = [...store.costSheets];
    if (sku) sheets = sheets.filter((s) => s.sku === sku);
    return sheets;
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
  async getActiveCostSheet(first: string, second?: string): Promise<CostSheetVersion | undefined> {
    const looksLikeSku = store.skus.some((s) => s.sku === first);
    const sku = looksLikeSku ? first : (second || first);
    const orgId = looksLikeSku ? second : first;
    return this.getActiveCostSheetForSKU(sku, orgId);
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
  async publishOfficialCostSheet(
    params: {
      sku: string;
      batchSize: number;
      breakdown: IndustrialCostBreakdown;
      fxRate?: number;
      actorId?: string;
    },
    organizationId: string
  ): Promise<CostSheetVersion> {
    const { sku, batchSize, breakdown, fxRate, actorId } = params;
    if (!breakdown.configured) {
      throw new Error('CANNOT_PUBLISH_INCOMPLETE: No se puede publicar la hoja oficial: faltan parámetros requeridos.');
    }

    const skus = await this.getSKUs(organizationId);
    const skuRecord = skus.find((candidate) => candidate.sku === sku);
    if (!skuRecord) throw new Error(`SKU ${sku} is not present in the product master`);

    const existingActive = await this.getActiveCostSheetForSKU(sku, organizationId);
    const nextVersion = existingActive ? (Number(existingActive.version) || 1) + 1 : 1;
    const newSheetId = crypto.randomUUID();
    const components = IndustrialCostEngine.toV1CostComponents(breakdown, newSheetId);
    const now = new Date().toISOString();

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      // 1. Insert new sheet with temporary status 'DRAFT' to ensure components insert before any activation
      const newSheetRecord = {
        id: newSheetId,
        organization_id: organizationId,
        product_id: skuRecord.product_id,
        sku,
        version: nextVersion,
        name: `Hoja de costo V1 · ${sku} (v${nextVersion})`,
        batch_size: batchSize,
        effective_date: now.split('T')[0],
        status: 'DRAFT' as const,
        true_unit_cost_usd: breakdown.true_unit_cost_usd,
        true_unit_cost_pyg: fxRate ? Math.round(breakdown.true_unit_cost_usd * fxRate) : undefined,
        fx_rate_used: fxRate,
        minimum_sustainable_price_usd: breakdown.true_unit_cost_usd,
        break_even_units: 0,
        notes: `Cost Intelligence V1: versión oficial v${nextVersion}. Seis rubros configurables por SKU.`,
        updated_at: now,
      };

      const { data: savedSheet, error: sheetError } = await supabaseAdmin
        .from('cost_sheet_versions')
        .insert(newSheetRecord)
        .select('*')
        .single();
      if (sheetError) throw new Error(`cost_sheet_versions insert: ${sheetError.message}`);

      try {
        // 2. Insert components for the new sheet
        for (const comp of components) {
          const { error: compError } = await supabaseAdmin.from('cost_components').insert({
            id: comp.id,
            cost_sheet_id: newSheetId,
            category: comp.category,
            name: comp.name,
            component_type: comp.component_type,
            basis: comp.basis,
            rate_usd: comp.rate_usd,
            quantity: comp.quantity,
            unit_of_measure: comp.unit_of_measure,
            effective_date: comp.effective_date,
            notes: comp.notes,
            updated_at: now,
          });
          if (compError) throw new Error(`cost_components insert: ${compError.message}`);
        }

        // 3. Archive previous active version (if any)
        if (existingActive) {
          const { error: archiveError } = await supabaseAdmin
            .from('cost_sheet_versions')
            .update({ status: 'ARCHIVED', updated_at: now })
            .eq('id', existingActive.id)
            .eq('organization_id', organizationId);
          if (archiveError) throw new Error(`cost_sheet_versions archive: ${archiveError.message}`);
        }

        // 4. Activate the new version
        const { error: activateError } = await supabaseAdmin
          .from('cost_sheet_versions')
          .update({ status: 'ACTIVE', updated_at: now })
          .eq('id', newSheetId)
          .eq('organization_id', organizationId);
        if (activateError) throw new Error(`cost_sheet_versions activate: ${activateError.message}`);
      } catch (innerError) {
        // Rollback: delete the incomplete pending sheet to prevent orphaned corrupted state
        await supabaseAdmin.from('cost_components').delete().eq('cost_sheet_id', newSheetId);
        await supabaseAdmin.from('cost_sheet_versions').delete().eq('id', newSheetId);
        throw innerError;
      }

      await this.logAuditEvent({
        event_type: 'cost_edit',
        target_entity: 'cost_sheet_versions',
        entity_id: newSheetId,
        metadata: { sku, version: nextVersion, true_cost: breakdown.true_unit_cost_usd, action: 'PUBLISH_OFFICIAL' },
      });

      return {
        ...savedSheet,
        status: 'ACTIVE',
        components,
      } as CostSheetVersion;
    }

    // In-memory store transaction
    if (existingActive) {
      existingActive.status = 'ARCHIVED';
    }

    const officialSheet: CostSheetVersion = {
      id: newSheetId,
      organization_id: organizationId,
      product_id: skuRecord.product_id,
      sku,
      version: nextVersion,
      name: `Hoja de costo V1 · ${sku} (v${nextVersion})`,
      batch_size: batchSize,
      effective_date: now.split('T')[0],
      status: 'ACTIVE',
      true_unit_cost_usd: breakdown.true_unit_cost_usd,
      true_unit_cost_pyg: fxRate ? Math.round(breakdown.true_unit_cost_usd * fxRate) : undefined,
      fx_rate_used: fxRate,
      minimum_sustainable_price_usd: breakdown.true_unit_cost_usd,
      break_even_units: 0,
      components,
      notes: `Cost Intelligence V1: versión oficial v${nextVersion}. Seis rubros configurables por SKU.`,
      };
    store.costSheets.push(officialSheet);

    await this.logAuditEvent({
      event_type: 'cost_edit',
      target_entity: 'cost_sheet_versions',
      entity_id: newSheetId,
      metadata: { sku, version: nextVersion, true_cost: breakdown.true_unit_cost_usd, action: 'PUBLISH_OFFICIAL' },
    });

    return officialSheet;
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
    return store.packingSessions.find((s) => s.id === id && (!organizationId || s.organization_id === organizationId));
  },

  async createPackingSession(
    data: {
      line_name: string;
      sku?: string;
      production_order?: string;
      initial_headcount?: number;
      headcount?: number;
      reason?: string;
      operator_user_id?: string;
      organization_id?: string;
    },
    organizationId?: string
  ): Promise<PackingSession> {
    return this.startPackingSession(
      {
        ...data,
        initial_headcount: data.initial_headcount ?? data.headcount ?? 1,
      },
      organizationId || data.organization_id
    );
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

  async addPackingSessionSegment(
    sessionId: string,
    data: { headcount: number; reason?: string },
    organizationId?: string
  ): Promise<PackingSession> {
    return this.changePackingHeadcount(sessionId, data.headcount, data.reason, organizationId);
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

  // ==============================================================
  // INDUSTRIAL PROCESSES — SALARY BANDS & PERSONNEL MASTER
  // ==============================================================

  // 1. Bandas Salariales (Plant Salary Bands)
  async getSalaryBands(organizationId?: string, onDate?: string, activeOnly = true): Promise<PlantSalaryBand[]> {
    const today = onDate || new Date().toISOString().split('T')[0];
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data: bandsData, error: bandsError } = await supabaseAdmin
          .from('plant_salary_bands')
          .select('*')
          .eq('organization_id', organizationId)
          .order('name');
        if (bandsError) {
          if (isSchemaMissingError(bandsError)) {
            console.warn('[Salary Bands] Tabla plant_salary_bands pendiente en Supabase. Usando store en memoria.');
          } else {
            throw new Error(`getSalaryBands: ${bandsError.message}`);
          }
        } else if (bandsData) {
          // Fetch current rates
          const { data: ratesData, error: ratesError } = await supabaseAdmin
            .from('plant_salary_band_rates')
            .select('*')
            .eq('organization_id', organizationId)
            .lte('valid_from', today)
            .order('valid_from', { ascending: false });
          if (ratesError) throw ratesError;

          const mapped = bandsData.map((band: any) => {
            const bandRates = (ratesData || []).filter((r: any) => r.band_id === band.id);
            const activeRate = bandRates.find((r: any) => !r.valid_to || r.valid_to >= today);
            return {
              id: band.id,
              organization_id: band.organization_id,
              name: band.name,
              description: band.description || undefined,
              status: band.status,
              monthly_salary_pyg: activeRate ? Number(activeRate.monthly_salary_pyg) : 0,
              current_rate: activeRate ? {
                id: activeRate.id,
                organization_id: activeRate.organization_id,
                band_id: activeRate.band_id,
                monthly_salary_pyg: Number(activeRate.monthly_salary_pyg),
                valid_from: activeRate.valid_from,
                valid_to: activeRate.valid_to || null,
                notes: activeRate.notes || undefined,
                created_at: activeRate.created_at,
              } : undefined,
              created_at: band.created_at,
              updated_at: band.updated_at,
            };
          });
          return activeOnly ? mapped.filter((b: any) => b.status === 'ACTIVE') : mapped;
        }
      } catch (err: any) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }

    // In-memory fallback
    const orgId = organizationId || store.organizations[0].id;
    return store.salaryBands
      .filter((b) => (!organizationId || b.organization_id === orgId) && (!activeOnly || b.status === 'ACTIVE'))
      .map((band) => {
        const rates = store.salaryBandRates
          .filter((r) => r.band_id === band.id && r.valid_from <= today)
          .sort((a, b) => b.valid_from.localeCompare(a.valid_from));
        const activeRate = rates.find((r) => !r.valid_to || r.valid_to >= today);
        return {
          ...band,
          monthly_salary_pyg: activeRate ? Number(activeRate.monthly_salary_pyg) : band.monthly_salary_pyg,
          current_rate: activeRate,
        };
      });
  },

  async getSalaryBand(id: string, organizationId?: string, activeOnly = true): Promise<PlantSalaryBand | undefined> {
    const bands = await this.getSalaryBands(organizationId, undefined, activeOnly);
    return bands.find((b) => b.id === id);
  },

  async createSalaryBand(
    band: Omit<PlantSalaryBand, 'id' | 'monthly_salary_pyg'>,
    initialSalaryPyg: number,
    validFrom?: string,
    organizationId?: string,
    actorId?: string
  ): Promise<PlantSalaryBand> {
    const orgId = organizationId || band.organization_id || store.organizations[0].id;
    const now = new Date().toISOString();
    const today = validFrom || now.split('T')[0];
    if (!isIsoDate(today)) throw new Error('INVALID_VALID_FROM');
    const safeSalary = Math.max(Number(initialSalaryPyg) || 0, 0);

    if ((!organizationId || !isSupabaseAdminConfigured) && store.salaryBands.some((candidate) =>
      candidate.organization_id === orgId && candidate.name.trim().toLowerCase() === band.name.trim().toLowerCase()
    )) throw new Error('BAND_NAME_ALREADY_EXISTS');

    const bandId = crypto.randomUUID();
    const rateId = crypto.randomUUID();

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data: bandData, error: bandErr } = await supabaseAdmin
          .from('plant_salary_bands')
          .insert({
            id: bandId,
            organization_id: orgId,
            name: band.name.trim(),
            description: band.description || null,
            status: band.status || 'ACTIVE',
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();
        if (bandErr) throw new Error(`createSalaryBand: ${bandErr.message}`);

        const { error: rateErr } = await supabaseAdmin
          .from('plant_salary_band_rates')
          .insert({
            id: rateId,
            organization_id: orgId,
            band_id: bandId,
            monthly_salary_pyg: safeSalary,
            valid_from: today,
            valid_to: null,
            notes: 'Tarifa inicial de creación de banda',
            created_at: now,
            created_by: actorId || null,
          });
        if (rateErr) {
          await supabaseAdmin.from('plant_salary_bands').delete().eq('id', bandId).eq('organization_id', orgId);
          throw rateErr;
        }

        return {
          id: bandId,
          organization_id: orgId,
          name: band.name.trim(),
          description: band.description,
          status: band.status || 'ACTIVE',
          monthly_salary_pyg: safeSalary,
          current_rate: {
            id: rateId,
            organization_id: orgId,
            band_id: bandId,
            monthly_salary_pyg: safeSalary,
            valid_from: today,
            valid_to: null,
            created_at: now,
          },
          created_at: now,
          updated_at: now,
        };
      } catch (err: any) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }

    const newBand: PlantSalaryBand = {
      id: bandId,
      organization_id: orgId,
      name: band.name.trim(),
      description: band.description,
      status: band.status || 'ACTIVE',
      monthly_salary_pyg: safeSalary,
      current_rate: {
        id: rateId,
        organization_id: orgId,
        band_id: bandId,
        monthly_salary_pyg: safeSalary,
        valid_from: today,
        valid_to: null,
        created_at: now,
      },
      created_at: now,
      updated_at: now,
    };
    store.salaryBands.push(newBand);
    store.salaryBandRates.push(newBand.current_rate!);
    return newBand;
  },

  async updateSalaryBand(
    id: string,
      updates: Pick<Partial<PlantSalaryBand>, 'name' | 'description' | 'status'>,
    newSalaryPyg?: number,
    validFrom?: string,
    organizationId?: string,
    actorId?: string
  ): Promise<PlantSalaryBand> {
    const orgId = organizationId || store.organizations[0].id;
    const now = new Date().toISOString();
    const today = validFrom || now.split('T')[0];
    if (newSalaryPyg !== undefined && !isIsoDate(today)) throw new Error('INVALID_VALID_FROM');
    const existingBand = await this.getSalaryBand(id, organizationId, false);
    if (!existingBand) throw new Error('SALARY_BAND_NOT_FOUND');
    if (newSalaryPyg !== undefined && (!Number.isFinite(Number(newSalaryPyg)) || Number(newSalaryPyg) < 0)) {
      throw new Error('INVALID_SALARY');
    }
    if (updates.name !== undefined && (!updates.name.trim() || ((!organizationId || !isSupabaseAdminConfigured) && store.salaryBands.some((candidate) =>
      candidate.organization_id === orgId && candidate.id !== id && candidate.name.trim().toLowerCase() === updates.name!.trim().toLowerCase()
    )))) throw new Error('BAND_NAME_ALREADY_EXISTS');

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const updateFields: any = { updated_at: now };
        if (updates.name !== undefined) updateFields.name = updates.name.trim();
        if (updates.description !== undefined) updateFields.description = updates.description;
        if (updates.status !== undefined) updateFields.status = updates.status;

        const { data: updatedBand, error: updateErr } = await supabaseAdmin
          .from('plant_salary_bands')
          .update(updateFields)
          .eq('id', id)
          .eq('organization_id', orgId)
          .select()
          .single();
        if (updateErr) throw new Error(`updateSalaryBand: ${updateErr.message}`);

        if (newSalaryPyg !== undefined && Number(newSalaryPyg) >= 0) {
          const safeSalary = Number(newSalaryPyg);
          const { data: rates, error: ratesError } = await supabaseAdmin
            .from('plant_salary_band_rates')
            .select('id, valid_from, valid_to')
            .eq('band_id', id)
            .eq('organization_id', orgId)
            .order('valid_from');
          if (ratesError) throw ratesError;

          const sameStart = (rates || []).find((rate: any) => rate.valid_from === today);
          if (sameStart) {
            const { error } = await supabaseAdmin
              .from('plant_salary_band_rates')
              .update({ monthly_salary_pyg: safeSalary })
              .eq('id', sameStart.id)
              .eq('organization_id', orgId);
            if (error) throw error;
          } else {
            const priorRates = (rates || []).filter(
              (rate: any) => rate.valid_from < today && (!rate.valid_to || rate.valid_to >= today)
            );
            for (const rate of priorRates) {
              const { error } = await supabaseAdmin
                .from('plant_salary_band_rates')
                .update({ valid_to: shiftIsoDate(today, -1) })
                .eq('id', rate.id)
                .eq('organization_id', orgId);
              if (error) throw error;
            }
            const nextRate = (rates || []).find((rate: any) => rate.valid_from > today);
            const { error } = await supabaseAdmin
              .from('plant_salary_band_rates')
              .insert({
                id: crypto.randomUUID(),
                organization_id: orgId,
                band_id: id,
                monthly_salary_pyg: safeSalary,
                valid_from: today,
                valid_to: nextRate ? shiftIsoDate(nextRate.valid_from, -1) : null,
                notes: 'Actualización de tarifa salarial con vigencia',
                created_at: now,
                created_by: actorId || null,
              });
            if (error) throw error;
          }
        }
      } catch (err: any) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }

    // In-memory update
    const bandIdx = store.salaryBands.findIndex((b) => b.id === id);
    if (bandIdx >= 0) {
      store.salaryBands[bandIdx] = {
        ...store.salaryBands[bandIdx],
        ...updates,
        updated_at: now,
      };

      if (newSalaryPyg !== undefined && Number(newSalaryPyg) >= 0) {
        const safeSalary = Number(newSalaryPyg);
        const sameStart = store.salaryBandRates.find((rate) => rate.band_id === id && rate.valid_from === today);
        let newRate: PlantSalaryBandRate;
        if (sameStart) {
          sameStart.monthly_salary_pyg = safeSalary;
          newRate = sameStart;
        } else {
          store.salaryBandRates.forEach((rate) => {
            if (rate.band_id === id && rate.valid_from < today && (!rate.valid_to || rate.valid_to >= today)) {
              rate.valid_to = shiftIsoDate(today, -1);
            }
          });
          const nextRate = store.salaryBandRates
            .filter((rate) => rate.band_id === id && rate.valid_from > today)
            .sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0];
          newRate = {
            id: crypto.randomUUID(),
            organization_id: orgId,
            band_id: id,
            monthly_salary_pyg: safeSalary,
            valid_from: today,
            valid_to: nextRate ? shiftIsoDate(nextRate.valid_from, -1) : null,
            created_at: now,
            created_by: actorId,
          };
          store.salaryBandRates.push(newRate);
        }
        store.salaryBands[bandIdx].monthly_salary_pyg = safeSalary;
        store.salaryBands[bandIdx].current_rate = newRate;
      }
    }

    return (await this.getSalaryBand(id, organizationId, false)) || store.salaryBands[bandIdx];
  },

  async deleteOrDeactivateSalaryBand(
    id: string,
    organizationId?: string
  ): Promise<{ success: boolean; deactivated?: boolean }> {
    const orgId = organizationId || store.organizations[0].id;
    const band = await this.getSalaryBand(id, organizationId, false);
    if (!band) throw new Error('SALARY_BAND_NOT_FOUND');

    // Check persisted and in-memory references before deciding whether a band can be removed.
    const [assignments, allocations] = await Promise.all([
      this.getPersonnelAssignments(orgId, undefined, false),
      this.getPackingLaborAllocations(undefined, orgId),
    ]);
    const hasAssignments = assignments.some((a) => a.salary_band_id === id);
    const hasAllocations = allocations.some((a) => a.salary_band_id === id);

    if (hasAssignments || hasAllocations) {
      // Safe guard: deactivate instead of hard delete to preserve historical integrity
      await this.updateSalaryBand(id, { status: 'INACTIVE' }, undefined, undefined, organizationId);
      return { success: true, deactivated: true };
    }

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { error } = await supabaseAdmin.from('plant_salary_bands').delete().eq('id', id).eq('organization_id', orgId);
        if (error) throw error;
      } catch (err: any) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }

    store.salaryBands = store.salaryBands.filter((b) => b.id !== id);
    store.salaryBandRates = store.salaryBandRates.filter((r) => r.band_id !== id);
    return { success: true, deactivated: false };
  },

  async getSalaryBandRates(bandId: string, organizationId?: string): Promise<PlantSalaryBandRate[]> {
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('plant_salary_band_rates')
          .select('*')
          .eq('band_id', bandId)
          .eq('organization_id', organizationId)
          .order('valid_from', { ascending: false });
        if (error) {
          if (!isSchemaMissingError(error)) throw error;
        } else if (data) {
          return data.map((r: any) => ({
            id: r.id,
            organization_id: r.organization_id,
            band_id: r.band_id,
            monthly_salary_pyg: Number(r.monthly_salary_pyg),
            valid_from: r.valid_from,
            valid_to: r.valid_to || null,
            notes: r.notes || undefined,
            created_at: r.created_at,
            created_by: r.created_by,
          }));
        }
      } catch (err) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }
    return store.salaryBandRates
      .filter((r) => r.band_id === bandId && (!organizationId || r.organization_id === organizationId))
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  },

  // Salary history belongs to a person. Process assignments only describe operational allocation.
  async getPersonnelSalaryAssignments(
    organizationId?: string,
    activeOnly = true,
    onDate?: string
  ): Promise<PlantPersonnelSalaryAssignment[]> {
    const orgId = organizationId || store.organizations[0].id;
    const targetDate = onDate || new Date().toISOString().split('T')[0];
    let rows: PlantPersonnelSalaryAssignment[] = [];
    let loadedFromDatabase = false;

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('plant_personnel_salary_assignments')
          .select('*')
          .eq('organization_id', organizationId);
        if (error) {
          if (!isSchemaMissingError(error)) throw error;
        } else if (data) {
          loadedFromDatabase = true;
          rows = data.map((row: any) => ({
            id: row.id,
            organization_id: row.organization_id,
            personnel_id: row.personnel_id,
            salary_band_id: row.salary_band_id,
            valid_from: row.valid_from,
            valid_to: row.valid_to || null,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }));
        }
      } catch (error) {
        if (!isSchemaMissingError(error)) throw error;
      }
    }

    if (!loadedFromDatabase) {
      rows = store.personnelSalaryAssignments.filter((row) => row.organization_id === orgId);
      if (!rows.length) {
        // Compatibility path for databases/local snapshots before the salary-history migration.
        const legacyAssignments = await this.getPersonnelAssignments(orgId, undefined, false, targetDate);
        const byPersonAndStart = new Map<string, PlantPersonnelSalaryAssignment>();
        for (const assignment of legacyAssignments) {
          const key = `${assignment.personnel_id}:${assignment.valid_from}`;
          byPersonAndStart.set(key, {
            id: `legacy-${assignment.id}`,
            organization_id: assignment.organization_id,
            personnel_id: assignment.personnel_id,
            salary_band_id: assignment.salary_band_id,
            valid_from: assignment.valid_from,
            valid_to: assignment.valid_to,
          });
        }
        rows = [...byPersonAndStart.values()];
      }
    }

    const bands = await this.getSalaryBands(orgId, targetDate, false);
    return rows
      .filter((row) => !activeOnly || (row.valid_from <= targetDate && (!row.valid_to || row.valid_to >= targetDate)))
      .map((row) => {
        const band = bands.find((candidate) => candidate.id === row.salary_band_id);
        return {
          ...row,
          band_name: band?.name || 'Banda',
          monthly_salary_pyg: band?.monthly_salary_pyg || 0,
        };
      });
  },

  async savePersonnelSalaryAssignment(
    assignment: Omit<PlantPersonnelSalaryAssignment, 'id'>,
    organizationId?: string
  ): Promise<PlantPersonnelSalaryAssignment> {
    const orgId = organizationId || assignment.organization_id || store.organizations[0].id;
    const targetDate = assignment.valid_from;
    if (!isIsoDate(targetDate) || (assignment.valid_to && (!isIsoDate(assignment.valid_to) || assignment.valid_to < targetDate))) {
      throw new Error('INVALID_SALARY_ASSIGNMENT_DATES');
    }
    const member = await this.getPersonnelMember(assignment.personnel_id, orgId);
    if (!member) throw new Error('PERSONNEL_NOT_FOUND');
    if (member.hire_date > targetDate || (member.termination_date && member.termination_date < targetDate)) {
      throw new Error('PERSONNEL_NOT_ACTIVE_ON_DATE');
    }
    if (member.status !== 'ACTIVE') throw new Error('PERSONNEL_INACTIVE');
    const band = await this.getSalaryBand(assignment.salary_band_id, orgId, false);
    if (!band) throw new Error('SALARY_BAND_NOT_FOUND');

    const history = await this.getPersonnelSalaryAssignments(orgId, false, targetDate);
    const personRows = history.filter((row) => row.personnel_id === assignment.personnel_id);
    const sameStart = personRows.find((row) => row.valid_from === targetDate);
    const previousRows = personRows.filter((row) => row.valid_from < targetDate && (!row.valid_to || row.valid_to >= targetDate));
    const nextRow = personRows.filter((row) => row.valid_from > targetDate).sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0];
    const requestedEnd = assignment.valid_to || null;
    const nextStartEnd = nextRow ? shiftIsoDate(nextRow.valid_from, -1) : null;
    const effectiveEnd = requestedEnd && nextStartEnd
      ? (requestedEnd < nextStartEnd ? requestedEnd : nextStartEnd)
      : requestedEnd || nextStartEnd;
    const now = new Date().toISOString();
    const id = sameStart?.id.startsWith('legacy-') ? crypto.randomUUID() : sameStart?.id || crypto.randomUUID();
    const item: PlantPersonnelSalaryAssignment = {
      ...assignment,
      id,
      organization_id: orgId,
      valid_to: effectiveEnd,
      band_name: band.name,
      monthly_salary_pyg: band.monthly_salary_pyg,
      updated_at: now,
    };

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        for (const previous of previousRows.filter((row) => !row.id.startsWith('legacy-'))) {
          const { error } = await supabaseAdmin.from('plant_personnel_salary_assignments')
            .update({ valid_to: shiftIsoDate(targetDate, -1), updated_at: now })
            .eq('id', previous.id).eq('organization_id', orgId);
          if (error) throw error;
        }
        const values = {
          personnel_id: item.personnel_id,
          salary_band_id: item.salary_band_id,
          valid_from: item.valid_from,
          valid_to: item.valid_to,
          updated_at: now,
        };
        const result = sameStart && !sameStart.id.startsWith('legacy-')
          ? await supabaseAdmin.from('plant_personnel_salary_assignments').update(values).eq('id', id).eq('organization_id', orgId)
          : await supabaseAdmin.from('plant_personnel_salary_assignments').insert({ id, organization_id: orgId, ...values, created_at: now });
        if (result.error) throw result.error;
      } catch (error) {
        if (!isSchemaMissingError(error)) throw error;
        throw new Error('PERSONNEL_SALARY_MIGRATION_REQUIRED');
      }
    }

    for (const previous of previousRows) {
      if (previous.id.startsWith('legacy-')) continue;
      const row = store.personnelSalaryAssignments.find((candidate) => candidate.id === previous.id);
      if (row) row.valid_to = shiftIsoDate(targetDate, -1);
    }
    const existingIndex = store.personnelSalaryAssignments.findIndex((row) => row.id === id);
    if (existingIndex >= 0) store.personnelSalaryAssignments[existingIndex] = item;
    else store.personnelSalaryAssignments.push(item);
    return item;
  },

  // 2. Maestro de Personal de Planta (Plant Personnel)
  async getPersonnel(organizationId?: string, sector?: IndustrialSector, onDate?: string): Promise<PlantPersonnel[]> {
    const orgId = organizationId || store.organizations[0].id;
    const today = onDate || new Date().toISOString().split('T')[0];
    const allAssignments = await this.getPersonnelAssignments(orgId, undefined, true, today);
    const allSalaryAssignments = await this.getPersonnelSalaryAssignments(orgId, true, today);

    let members: PlantPersonnel[] = [];
    let loadedFromDatabase = false;
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin.from('plant_personnel').select('*')
          .eq('organization_id', organizationId).order('employee_code');
        if (error) {
          if (!isSchemaMissingError(error)) throw error;
        } else if (data) {
          loadedFromDatabase = true;
          members = data.map((person: any) => ({
            id: person.id,
            organization_id: person.organization_id,
            employee_code: person.employee_code,
            display_name: person.display_name,
            status: person.status,
            hire_date: person.hire_date,
            termination_date: person.termination_date || null,
            created_at: person.created_at,
            updated_at: person.updated_at,
          }));
        }
      } catch (error) {
        if (!isSchemaMissingError(error)) throw error;
      }
    }
    if (!loadedFromDatabase) members = store.plantPersonnel.filter((person) => person.organization_id === orgId);

    const populated = members.map((member) => {
      const employed = member.hire_date <= today && (!member.termination_date || member.termination_date >= today) &&
        (member.status === 'ACTIVE' || Boolean(member.termination_date && member.termination_date >= today));
      const memberAssignments = employed ? allAssignments.filter((row) => row.personnel_id === member.id) : [];
      const salary = employed ? allSalaryAssignments.find((row) => row.personnel_id === member.id) : undefined;
      const band = salary ? { id: salary.salary_band_id, name: salary.band_name, monthly_salary_pyg: salary.monthly_salary_pyg } : undefined;
      return {
        ...member,
        primary_sector: memberAssignments[0]?.sector || member.primary_sector,
        current_band_id: band?.id,
        current_band_name: band?.name,
        current_salary_pyg: Number(band?.monthly_salary_pyg) || 0,
        assignments: memberAssignments,
      };
    });
    return sector ? populated.filter((member) => member.assignments?.some((row) => row.sector === sector)) : populated;
  },

  async getPersonnelMember(id: string, organizationId?: string): Promise<PlantPersonnel | undefined> {
    const all = await this.getPersonnel(organizationId);
    return all.find((p) => p.id === id);
  },

  async createPersonnel(
    member: Omit<PlantPersonnel, 'id'>,
    initialBandId?: string,
    initialSector?: IndustrialSector,
    organizationId?: string
  ): Promise<PlantPersonnel> {
    const orgId = organizationId || member.organization_id || store.organizations[0].id;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const newMember: PlantPersonnel = {
      id,
      organization_id: orgId,
      employee_code: member.employee_code.trim(),
      display_name: member.display_name.trim(),
      status: member.status || 'ACTIVE',
      hire_date: member.hire_date || now.split('T')[0],
      termination_date: member.termination_date || null,
      primary_sector: initialSector || member.primary_sector,
      current_band_id: initialBandId,
      created_at: now,
      updated_at: now,
    };
    if (!newMember.employee_code || !newMember.display_name || !isIsoDate(newMember.hire_date)) {
      throw new Error('INVALID_PERSONNEL');
    }
    if (newMember.status !== 'ACTIVE' && newMember.status !== 'INACTIVE') throw new Error('INVALID_PERSONNEL_STATUS');
    if (newMember.termination_date && (!isIsoDate(newMember.termination_date) || newMember.termination_date < newMember.hire_date)) {
      throw new Error('INVALID_TERMINATION_DATE');
    }

    if ((!organizationId || !isSupabaseAdminConfigured) && store.plantPersonnel.some((p) =>
      p.organization_id === orgId && p.employee_code.toLowerCase() === newMember.employee_code.toLowerCase()
    )) throw new Error('EMPLOYEE_CODE_ALREADY_EXISTS');

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { error } = await supabaseAdmin.from('plant_personnel').insert({
          id,
          organization_id: orgId,
          employee_code: newMember.employee_code,
          display_name: newMember.display_name,
          status: newMember.status,
          hire_date: newMember.hire_date,
          termination_date: newMember.termination_date,
          created_at: now,
          updated_at: now,
        });
        if (error) {
          if (error.code === '23505') throw new Error('EMPLOYEE_CODE_ALREADY_EXISTS');
          throw error;
        }
      } catch (err: any) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }

    store.plantPersonnel.push(newMember);

    // Salary is a person attribute. The optional process assignment is saved separately.
    if (initialBandId) {
      await this.savePersonnelSalaryAssignment({
        organization_id: orgId,
        personnel_id: id,
        salary_band_id: initialBandId,
        valid_from: newMember.hire_date,
        valid_to: null,
      }, orgId);
    }
    if (initialBandId && initialSector) {
      await this.savePersonnelAssignment(
        {
          organization_id: orgId,
          personnel_id: id,
          salary_band_id: initialBandId,
          sector: initialSector,
          machine_generation: initialSector === 'FORMADO' ? 'GEN1' : null,
          allocation_percent: 100,
          valid_from: newMember.hire_date,
          valid_to: null,
        },
        orgId
      );
    }

    return (await this.getPersonnelMember(id, organizationId)) || newMember;
  },

  async updatePersonnel(
    id: string,
    updates: Pick<Partial<PlantPersonnel>, 'employee_code' | 'display_name' | 'status' | 'hire_date' | 'termination_date'>,
    organizationId?: string
  ): Promise<PlantPersonnel> {
    const orgId = organizationId || store.organizations[0].id;
    const now = new Date().toISOString();
    const existingMember = await this.getPersonnelMember(id, organizationId);
    if (!existingMember) throw new Error('PERSONNEL_NOT_FOUND');
    if (updates.hire_date !== undefined && !isIsoDate(updates.hire_date)) throw new Error('INVALID_HIRE_DATE');
    const effectiveHireDate = updates.hire_date || existingMember.hire_date;
    const effectiveTerminationDate = updates.termination_date !== undefined ? updates.termination_date : existingMember.termination_date;
    if (effectiveTerminationDate && (!isIsoDate(effectiveTerminationDate) || effectiveTerminationDate < effectiveHireDate)) {
      throw new Error('INVALID_TERMINATION_DATE');
    }
    if (updates.employee_code !== undefined) {
      const members = await this.getPersonnel(organizationId);
      if (members.some((member) => member.id !== id && member.employee_code.toLowerCase() === updates.employee_code!.trim().toLowerCase())) {
        throw new Error('EMPLOYEE_CODE_ALREADY_EXISTS');
      }
    }

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const updateFields: any = { updated_at: now };
        if (updates.employee_code !== undefined) updateFields.employee_code = updates.employee_code.trim();
        if (updates.display_name !== undefined) updateFields.display_name = updates.display_name.trim();
        if (updates.status !== undefined) updateFields.status = updates.status;
        if (updates.hire_date !== undefined) updateFields.hire_date = updates.hire_date;
        if (updates.termination_date !== undefined) updateFields.termination_date = updates.termination_date;

        const { data, error } = await supabaseAdmin
          .from('plant_personnel')
          .update(updateFields)
          .eq('id', id)
          .eq('organization_id', orgId)
          .select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('PERSONNEL_NOT_FOUND');
      } catch (err: any) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }

    const idx = store.plantPersonnel.findIndex((p) => p.id === id && p.organization_id === orgId);
    if (idx >= 0) {
      store.plantPersonnel[idx] = {
        ...store.plantPersonnel[idx],
        ...updates,
        updated_at: now,
      };
    }

    const updated = await this.getPersonnelMember(id, organizationId);
    if (!updated && idx < 0) throw new Error('PERSONNEL_NOT_FOUND');
    return updated || store.plantPersonnel[idx];
  },

  async deleteOrDeactivatePersonnel(
    id: string,
    organizationId?: string
  ): Promise<{ success: boolean; deactivated?: boolean }> {
    await this.updatePersonnel(id, { status: 'INACTIVE', termination_date: new Date().toISOString().split('T')[0] }, organizationId);
    return { success: true, deactivated: true };
  },

  // 3. Asignaciones de Personal (Personnel Assignments)
  async getPersonnelAssignments(
    organizationId?: string,
    sector?: IndustrialSector,
    activeOnly = true,
    onDate?: string
  ): Promise<PlantPersonnelAssignment[]> {
    const orgId = organizationId || store.organizations[0].id;
    const targetDate = onDate || new Date().toISOString().split('T')[0];

    const allBands = await this.getSalaryBands(orgId, targetDate, false);

    let rawAssignments: PlantPersonnelAssignment[] = [];
    let loadedFromDatabase = false;
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const query = supabaseAdmin
          .from('plant_personnel_assignments')
          .select('*')
          .eq('organization_id', organizationId);
        let scopedQuery = query;
        if (activeOnly) {
          scopedQuery = scopedQuery.lte('valid_from', targetDate);
        }
        const { data, error } = await scopedQuery;
        if (error) {
          if (!isSchemaMissingError(error)) throw error;
        } else if (data) {
          loadedFromDatabase = true;
          rawAssignments = data.map((a: any) => ({
            id: a.id,
            organization_id: a.organization_id,
            personnel_id: a.personnel_id,
            salary_band_id: a.salary_band_id,
            sector: (a.sector === 'FORMADO_GEN1' || a.sector === 'FORMADO_GEN2' ? 'FORMADO' : a.sector) as IndustrialSector,
            machine_generation: (a.machine_generation || (a.sector === 'FORMADO_GEN1' ? 'GEN1' : a.sector === 'FORMADO_GEN2' ? 'GEN2' : null)) as MachineGeneration | null,
            line_id: a.line_id || undefined,
            allocation_percent: Number(a.allocation_percent),
            valid_from: a.valid_from,
            valid_to: a.valid_to || null,
            created_at: a.created_at,
            updated_at: a.updated_at,
          }));
        }
      } catch (err) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }

    if (!loadedFromDatabase) {
      rawAssignments = store.personnelAssignments.filter((a) => !organizationId || a.organization_id === orgId);
    }

    const filtered = rawAssignments.filter((a) => {
      if (sector && a.sector !== sector) return false;
      if (activeOnly) {
        if (a.valid_from > targetDate) return false;
        if (a.valid_to && a.valid_to < targetDate) return false;
      }
      return true;
    });

    return filtered.map((a) => {
      const band = allBands.find((b) => b.id === a.salary_band_id);
      return {
        ...a,
        band_name: band?.name || 'Banda',
        monthly_salary_pyg: band?.monthly_salary_pyg || 0,
      };
    });
  },

  async savePersonnelAssignment(
    assignment: Omit<PlantPersonnelAssignment, 'id'>,
    organizationId?: string
  ): Promise<PlantPersonnelAssignment> {
    const orgId = organizationId || assignment.organization_id || store.organizations[0].id;
    const now = new Date().toISOString();
    const targetDate = assignment.valid_from || now.split('T')[0];
    const allocationPercent = Number(assignment.allocation_percent);
    const sectors: IndustrialSector[] = ['FORMADO', 'CALIDAD', 'EMPAQUE'];
    if (!sectors.includes(assignment.sector)) throw new Error('INVALID_SECTOR');
    if (assignment.sector === 'FORMADO' && !assignment.machine_generation) throw new Error('MACHINE_GENERATION_REQUIRED');
    if (assignment.machine_generation && (assignment.sector !== 'FORMADO' || !['GEN1', 'GEN2'].includes(assignment.machine_generation))) {
      throw new Error('INVALID_MACHINE_GENERATION');
    }
    if (!isIsoDate(targetDate) || (assignment.valid_to && (!isIsoDate(assignment.valid_to) || assignment.valid_to < targetDate))) {
      throw new Error('INVALID_ASSIGNMENT_DATES');
    }
    if (!Number.isFinite(allocationPercent) || allocationPercent <= 0 || allocationPercent > 100) {
      throw new Error('INVALID_ALLOCATION_PERCENT');
    }

    const member = await this.getPersonnelMember(assignment.personnel_id, orgId);
    if (!member) throw new Error('PERSONNEL_NOT_FOUND');
    if (member.status !== 'ACTIVE') throw new Error('PERSONNEL_INACTIVE');
    if (member.hire_date > targetDate || (member.termination_date && member.termination_date < targetDate)) {
      throw new Error('PERSONNEL_NOT_ACTIVE_ON_DATE');
    }
    const salaryAssignment = (await this.getPersonnelSalaryAssignments(orgId, true, targetDate))
      .find((row) => row.personnel_id === assignment.personnel_id);
    if (!salaryAssignment) throw new Error('PERSONNEL_SALARY_BAND_REQUIRED');
    const band = await this.getSalaryBand(salaryAssignment.salary_band_id, orgId);
    if (!band) throw new Error('SALARY_BAND_NOT_FOUND');

    const history = await this.getPersonnelAssignments(orgId, undefined, false, targetDate);
    const sameOperationalSlot = history.filter((row) => row.personnel_id === assignment.personnel_id && row.sector === assignment.sector &&
      (row.machine_generation || null) === (assignment.machine_generation || null));
    const sameStart = sameOperationalSlot.find((row) => row.valid_from === targetDate);
    const previousRows = sameOperationalSlot.filter((row) => row.valid_from < targetDate && (!row.valid_to || row.valid_to >= targetDate));
    const nextRow = sameOperationalSlot
      .filter((a) => a.valid_from > targetDate)
      .sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0];
    const requestedEnd = assignment.valid_to || null;
    const nextStartEnd = nextRow ? shiftIsoDate(nextRow.valid_from, -1) : null;
    const effectiveEnd = requestedEnd && nextStartEnd
      ? (requestedEnd < nextStartEnd ? requestedEnd : nextStartEnd)
      : requestedEnd || nextStartEnd;

    const existingActive = await this.getPersonnelAssignments(orgId, undefined, true, targetDate);
    const otherAllocationsSum = existingActive
      .filter((a) => a.personnel_id === assignment.personnel_id && a.id !== sameStart?.id)
      .reduce((sum, a) => sum + a.allocation_percent, 0);
    if (otherAllocationsSum + allocationPercent > 100) throw new Error('ASSIGNMENT_ALLOCATION_EXCEEDED');

    const id = sameStart?.id || crypto.randomUUID();
    const item: PlantPersonnelAssignment = {
      id,
      organization_id: orgId,
      personnel_id: assignment.personnel_id,
      salary_band_id: salaryAssignment.salary_band_id,
      sector: assignment.sector,
      machine_generation: assignment.machine_generation || null,
      line_id: assignment.line_id,
      allocation_percent: allocationPercent,
      valid_from: targetDate,
      valid_to: effectiveEnd,
      created_at: now,
      updated_at: now,
    };

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        for (const previous of previousRows) {
          const { error } = await supabaseAdmin
            .from('plant_personnel_assignments')
            .update({ valid_to: shiftIsoDate(targetDate, -1), updated_at: now })
            .eq('id', previous.id)
            .eq('organization_id', orgId);
          if (error) throw error;
        }
        const values = {
          personnel_id: item.personnel_id,
          salary_band_id: item.salary_band_id,
          sector: item.sector,
          machine_generation: item.machine_generation || null,
          line_id: item.line_id || null,
          allocation_percent: item.allocation_percent,
          valid_from: item.valid_from,
          valid_to: item.valid_to,
          updated_at: now,
        };
        const result = sameStart
          ? await supabaseAdmin.from('plant_personnel_assignments').update(values).eq('id', id).eq('organization_id', orgId)
          : await supabaseAdmin.from('plant_personnel_assignments').insert({
              id,
              organization_id: orgId,
              ...values,
              created_at: now,
            });
        if (result.error) throw result.error;
      } catch (err: any) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }

    for (const previous of previousRows) {
      const stored = store.personnelAssignments.find((a) => a.id === previous.id);
      if (stored) stored.valid_to = shiftIsoDate(targetDate, -1);
    }
    if (sameStart) {
      const index = store.personnelAssignments.findIndex((a) => a.id === id);
      if (index >= 0) store.personnelAssignments[index] = { ...store.personnelAssignments[index], ...item };
      else store.personnelAssignments.push(item);
    } else {
      store.personnelAssignments.push(item);
    }

    return item;
  },

  async deletePersonnelAssignment(id: string, organizationId?: string): Promise<void> {
    const orgId = organizationId || store.organizations[0].id;
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        const { error } = await supabaseAdmin
          .from('plant_personnel_assignments')
          .delete()
          .eq('id', id)
          .eq('organization_id', orgId);
        if (error) throw error;
      } catch (err: any) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }
    store.personnelAssignments = store.personnelAssignments.filter((a) => !(a.id === id && a.organization_id === orgId));
  },

  // 4. Resumen Sectorial de Personal (Sector Personnel Summary)
  async getSectorPersonnelSummary(
    organizationId?: string,
    onDate?: string,
    monthlySalaryHours = 200,
    laborChargesPercent = 16.5
  ): Promise<Record<IndustrialSector, SectorPersonnelSummary>> {
    const orgId = organizationId || store.organizations[0].id;
    const targetDate = onDate || new Date().toISOString().split('T')[0];

    const sectors: IndustrialSector[] = ['FORMADO', 'CALIDAD', 'EMPAQUE'];
    const assignments = await this.getPersonnelAssignments(orgId, undefined, true, targetDate);
    const personnelMembers = await this.getPersonnel(orgId, undefined, targetDate);
    const laborMultiplier = 1 + (Number(laborChargesPercent) || 0) / 100;
    const safeHours = monthlySalaryHours > 0 ? monthlySalaryHours : 200;

    const result: Partial<Record<IndustrialSector, SectorPersonnelSummary>> = {};

    for (const sector of sectors) {
      const sectorAssignments = assignments.filter((assignment) => assignment.sector === sector);
      const items: SectorPersonnelItem[] = [];

      let totalBasePyg = 0;
      let totalHourlyRatePyg = 0;

      const personnelIds = [...new Set(sectorAssignments.map((assignment) => assignment.personnel_id))];
      for (const personnelId of personnelIds) {
        const member = personnelMembers.find((candidate) => candidate.id === personnelId);
        if (!member || member.hire_date > targetDate || (member.termination_date && member.termination_date < targetDate)) continue;
        if (member.status !== 'ACTIVE' && (!member.termination_date || member.termination_date <= targetDate)) continue;
        const memberAssignments = sectorAssignments.filter((assignment) => assignment.personnel_id === personnelId);
        const allocationPercent = memberAssignments.reduce((sum, assignment) => sum + Number(assignment.allocation_percent || 0), 0);
        const monthlySalary = Number(member.current_salary_pyg) || 0;
        const allocationFactor = Math.min(allocationPercent, 100) / 100;
        const effectiveSalaryPyg = monthlySalary * allocationFactor;
        const hourlyRatePyg = safeHours > 0 ? (effectiveSalaryPyg * laborMultiplier) / safeHours : 0;
        const generationAllocations = sector === 'FORMADO'
          ? {
              GEN1: memberAssignments.filter((assignment) => assignment.machine_generation === 'GEN1')
                .reduce((sum, assignment) => sum + Number(assignment.allocation_percent || 0), 0),
              GEN2: memberAssignments.filter((assignment) => assignment.machine_generation === 'GEN2')
                .reduce((sum, assignment) => sum + Number(assignment.allocation_percent || 0), 0),
            }
          : undefined;

        totalBasePyg += effectiveSalaryPyg;
        totalHourlyRatePyg += hourlyRatePyg;

        items.push({
          personnel_id: member.id,
          employee_code: member.employee_code,
          display_name: member.display_name,
          band_id: member.current_band_id || '',
          band_name: member.current_band_name || 'Sin banda',
          monthly_salary_pyg: monthlySalary,
          allocation_percent: allocationPercent,
          effective_monthly_salary_pyg: effectiveSalaryPyg,
          hourly_rate_pyg: hourlyRatePyg,
          generation_allocations: generationAllocations,
        });
      }

      const assignedCount = items.length;
      const hourlyAvgPyg = assignedCount > 0 ? totalHourlyRatePyg / assignedCount : 0;
      const totalWithChargesPyg = totalBasePyg * laborMultiplier;

      result[sector] = {
        sector,
        assigned_count: assignedCount,
        monthly_salary_base_pyg: totalBasePyg,
        monthly_salary_with_charges_pyg: totalWithChargesPyg,
        hourly_rate_avg_pyg: hourlyAvgPyg,
        personnel: items,
        is_configured: assignedCount > 0 && items.every((item) => item.monthly_salary_pyg > 0),
      };
    }

    return result as Record<IndustrialSector, SectorPersonnelSummary>;
  },

  // 5. Imputaciones Salariales de Empaque (Packing Labor Allocations)
  async getPackingLaborAllocations(
    sessionIdOrIds?: string | string[],
    organizationId?: string
  ): Promise<PackingLaborAllocation[]> {
    const orgId = organizationId || store.organizations[0].id;
    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      try {
        let query = supabaseAdmin
          .from('packing_labor_allocations')
          .select('*')
          .eq('organization_id', orgId);
        if (typeof sessionIdOrIds === 'string') {
          query = query.eq('session_id', sessionIdOrIds);
        } else if (Array.isArray(sessionIdOrIds) && sessionIdOrIds.length > 0) {
          query = query.in('session_id', sessionIdOrIds);
        }
        const { data, error } = await query;
        if (error) {
          if (!isSchemaMissingError(error)) throw error;
        } else if (data) {
          const bands = await this.getSalaryBands(orgId, undefined, false);
          return data.map((a: any) => {
            const band = bands.find((b) => b.id === a.salary_band_id);
            return {
              id: a.id,
              organization_id: a.organization_id,
              session_id: a.session_id,
              session_segment_id: a.session_segment_id || undefined,
              salary_band_id: a.salary_band_id,
              salary_band_name: band?.name || 'Banda',
              headcount: Number(a.headcount),
              hourly_rate_snapshot_pyg: Number(a.hourly_rate_snapshot_pyg),
              calculated_cost_pyg: Number(a.calculated_cost_pyg),
              notes: a.notes || undefined,
              approved_by: a.approved_by || undefined,
              approved_at: a.approved_at,
            };
          });
        }
      } catch (err) {
        if (!isSchemaMissingError(err)) throw err;
      }
    }

    let allocs = store.packingLaborAllocations.filter((a) => !organizationId || a.organization_id === orgId);
    if (typeof sessionIdOrIds === 'string') {
      allocs = allocs.filter((a) => a.session_id === sessionIdOrIds);
    } else if (Array.isArray(sessionIdOrIds) && sessionIdOrIds.length > 0) {
      allocs = allocs.filter((a) => sessionIdOrIds.includes(a.session_id));
    }
    return allocs;
  },

  async approvePackingSessionWithLaborAllocations(
    sessionId: string,
    allocations: Array<{
      segment_id?: string;
      salary_band_id: string;
      headcount: number;
      duration_hours?: number;
    }>,
    supervisorId?: string,
    organizationId?: string
  ): Promise<PackingSession> {
    const orgId = organizationId || store.organizations[0].id;
    const now = new Date().toISOString();
    let session = await this.getPackingSession(sessionId, orgId);
    if (!session) throw new Error(`Sesión ${sessionId} no encontrada.`);
    if (session.status === 'APPROVED') throw new Error('La sesión ya está aprobada.');
    if (session.status === 'VOIDED') throw new Error('La sesión está anulada.');

    const existingAllocations = await this.getPackingLaborAllocations(sessionId, orgId);
    if (existingAllocations.length > 0) throw new Error('La sesión ya tiene imputaciones salariales.');

    const bands = await this.getSalaryBands(orgId, session.started_at.split('T')[0], false);
    const params = await this.getPlantParameters(orgId);
    const safeHours = Number(params.monthly_salary_hours) || 200;
    const laborMultiplier = 1 + (Number(params.labor_charges_percent) || 0) / 100;

    // Validate all rows before saving so an invalid band cannot leave a partially allocated session.
    const normalized = allocations.map((alloc) => {
      const headcount = Number(alloc.headcount);
      const durationHours = alloc.duration_hours === undefined ? undefined : Number(alloc.duration_hours);
      if (!Number.isInteger(headcount) || headcount <= 0) throw new Error('La cantidad de personas debe ser un entero mayor a 0.');
      if (durationHours !== undefined && (!Number.isFinite(durationHours) || durationHours <= 0)) {
        throw new Error('La duración asignada debe ser mayor a 0.');
      }
      const segment = alloc.segment_id ? session!.segments?.find((entry) => entry.id === alloc.segment_id) : undefined;
      if (alloc.segment_id && !segment) throw new Error('El segmento indicado no pertenece a la sesión.');
      if (segment && headcount > segment.headcount) throw new Error('La dotación asignada supera el segmento de la sesión.');
      const band = bands.find((candidate) => candidate.id === alloc.salary_band_id);
      if (!band || !band.current_rate) throw new Error('La banda salarial indicada no tiene tarifa vigente para la sesión.');
      return { ...alloc, headcount, duration_hours: durationHours, segment, band };
    });

    if (session.segments?.length && normalized.some((alloc) => alloc.segment)) {
      for (const segment of session.segments) {
        const assignedHeads = normalized
          .filter((alloc) => alloc.segment_id === segment.id)
          .reduce((sum, alloc) => sum + alloc.headcount, 0);
        if (assignedHeads !== segment.headcount) {
          throw new Error(`La dotación asignada del segmento ${segment.segment_order} debe sumar ${segment.headcount} personas.`);
        }
      }
    }

    // Preserve the existing approval behavior: a running session is stopped before its final hours are costed.
    if (session.status === 'RUNNING') {
      session = await this.stopPackingSession(sessionId, orgId);
    }

    // Create allocation snapshots
    const createdAllocations: PackingLaborAllocation[] = [];
    for (const alloc of normalized) {
      const bandSalary = alloc.band.monthly_salary_pyg;
      const hourlyRate = safeHours > 0 ? (bandSalary * laborMultiplier) / safeHours : 0;
      const hours = Number(alloc.duration_hours) > 0
        ? Number(alloc.duration_hours)
        : alloc.segment
          ? (Number(alloc.segment.person_hours) / alloc.segment.headcount)
          : (session.total_person_hours && alloc.headcount > 0 ? session.total_person_hours / alloc.headcount : 0);
      if (hours <= 0) throw new Error('No se pudo determinar la duración de la imputación.');
      const calculatedCost = alloc.headcount * hours * hourlyRate;

      const record: PackingLaborAllocation = {
        id: crypto.randomUUID(),
        organization_id: orgId,
        session_id: sessionId,
        session_segment_id: alloc.segment_id,
        salary_band_id: alloc.salary_band_id,
        salary_band_name: alloc.band.name,
        headcount: alloc.headcount,
        hourly_rate_snapshot_pyg: hourlyRate,
        calculated_cost_pyg: calculatedCost,
        approved_by: supervisorId,
        approved_at: now,
      };

      createdAllocations.push(record);
    }

    if (organizationId && isSupabaseAdminConfigured && supabaseAdmin) {
      const { error } = await supabaseAdmin.from('packing_labor_allocations').insert(createdAllocations.map((record) => ({
        id: record.id,
        organization_id: orgId,
        session_id: record.session_id,
        session_segment_id: record.session_segment_id || null,
        salary_band_id: record.salary_band_id,
        headcount: record.headcount,
        hourly_rate_snapshot_pyg: record.hourly_rate_snapshot_pyg,
        calculated_cost_pyg: record.calculated_cost_pyg,
        approved_by: supervisorId || null,
        approved_at: now,
      })));
      if (error && !isSchemaMissingError(error)) throw error;
      if (error && isSchemaMissingError(error)) {
        store.packingLaborAllocations.push(...createdAllocations);
      }
    } else {
      store.packingLaborAllocations.push(...createdAllocations);
    }

    // Approve the session
    const approvedSession = await this.approvePackingSession(sessionId, supervisorId, orgId);
    return approvedSession;
  },
};
