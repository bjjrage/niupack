import { describe, expect, it } from 'vitest';
import { ExportCostAdjustmentEngine } from '@/lib/engines/export-cost-adjustment-engine';
import { createMagicToken, safeTokenHashEquals } from '@/lib/logistics/security';
import { FreightosProvider } from '@/lib/logistics/freightos-provider';
import type { ExportCostInput, LogisticsRate } from '@/lib/logistics/domain';

const rate: LogisticsRate = {
  id: crypto.randomUUID(), organization_id: crypto.randomUUID(),
  origin: { country: 'PY' }, destination: { country: 'BR' }, mode: 'ROAD',
  amount: 1200, currency: 'USD', source: 'PROVIDER_RFQ', status: 'SELECTED', components: {},
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

const input: ExportCostInput = {
  sku: 'TEST', quantity: 1000, units_per_box: 100, boxes_per_pallet: 5,
  total_m3: 4, total_weight_kg: 600, export_specific_costs: 100,
  logistics_rate: rate, fx_source: 'BNF', fx_rate: 7000, fx_timestamp: new Date().toISOString(),
  manufacturing_components: [
    { id: 'paper', label: 'Papel', amount: 1000, tax_treatment: 'NON_RECOVERABLE' },
    { id: 'vat', label: 'IVA', amount: 100, tax_treatment: 'RECOVERABLE' },
    { id: 'partial', label: 'Crédito parcial', amount: 40, tax_treatment: 'PARTIALLY_RECOVERABLE', recoverable_percent: 50 },
    { id: 'unknown', label: 'Sin clasificar', amount: 10, tax_treatment: 'UNCLASSIFIED' },
  ],
};

describe('ExportCostAdjustmentEngine', () => {
  it('separates cash cost, recoverable tax and economic export cost deterministically', () => {
    const result = ExportCostAdjustmentEngine.calculate(input);
    expect(result.cash_cost).toBe(1150);
    expect(result.recoverable_tax).toBe(120);
    expect(result.economic_export_cost).toBe(2330);
    expect(result.freight_per_unit).toBe(1.2);
    expect(result.freight_per_box).toBe(120);
    expect(result.freight_per_pallet).toBe(600);
    expect(result.unclassified_component_ids).toEqual(['unknown']);
  });

  it('does not infer foreign buyer taxes or discount unclassified costs', () => {
    const result = ExportCostAdjustmentEngine.calculate({ ...input, logistics_rate: undefined });
    expect(result.logistics_cost).toBe(0);
    expect(result.economic_export_cost).toBe(1130);
  });
});

describe('logistics provider and token safety', () => {
  it('returns no fabricated ocean estimate when the public provider has no route coverage', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      response: { estimatedFreightRates: { numQuotes: '0' } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const result = await new FreightosProvider(fetcher).estimate({
      origin: 'CNSHA', destination: 'USLGB', equipment: '40HC', quantity: 1, weight_kg: 1000,
    });
    expect(result.status).toBe('NO_RESULTS');
    expect(result.estimates).toEqual([]);
  });

  it('stores only a hash and rejects a different magic token', () => {
    const first = createMagicToken();
    const second = createMagicToken();
    expect(first.token).not.toBe(first.hash);
    expect(safeTokenHashEquals(first.hash, first.token)).toBe(true);
    expect(safeTokenHashEquals(first.hash, second.token)).toBe(false);
  });
});
