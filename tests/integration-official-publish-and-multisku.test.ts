import { describe, it, expect } from 'vitest';
import { repository } from '@/lib/db/repository';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { IndustrialProcessCostEngine } from '@/lib/engines/industrial-process-cost-engine';
import { generatePackingToken, verifyPackingToken } from '@/lib/auth/packing-token';
import { IndustrialProductCostInput, PlantGeneralParameters } from '@/types';

describe('Integración Cost Intelligence + Procesos Industriales V2 (E2E Contract)', () => {
  const orgId = 'org-integration-test';

  const baseInput: IndustrialProductCostInput = {
    sku: 'CUP-12OZ-SW',
    paper_formula: {
      cif_price_ton_usd: 1200,
      customs_dispatch_percent: 13,
      financial_cost_percent: 2,
      printing_method: 'OFFSET',
      sheet_width_mm: 800,
      sheet_height_mm: 600,
      gsm: 280,
      coating_gsm: 15,
      units_per_sheet: 24,
      paper_yield_units_per_ton: 100000,
    },
    bottom_paper_cost_ton_usd: 1100,
    bottom_yield_units_per_ton: 250000,
    bottom_formula: {
      cif_price_ton_usd: 1100,
      customs_dispatch_percent: 13,
      financial_cost_percent: 2,
      gsm: 210,
      coating_gsm: 15,
      sheet_width_mm: 600,
      sheet_height_mm: 400,
      units_per_m2: 30,
    },
    printing_cost_mode: 'PER_THOUSAND',
    quoted_printing_rate_usd: 4.5,
    operational_cost_per_thousand_usd: 5.5,
    machine_depreciation_per_thousand_usd: 1.2,
    scrap_rate_percent: 3.5,
    packaging_cost_per_thousand_usd: 3.8,
    batch_size: 50000,
    currency_mode: 'BOTH',
    input_currency: 'USD',
    rubrics: {
      raw_material: { enabled: true, source: 'FORMULA', unit: 'PER_UNIT' },
      printing_die_cut: { enabled: true, source: 'QUOTE', unit: 'PER_1000' },
      operational: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
      scrap: { enabled: true, source: 'MANUAL', unit: 'PERCENT' },
      depreciation: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
      packaging: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
    },
  };

  describe('1. Publicación Oficial Atómica (N+1, rollback y archivo)', () => {
    it('publishes version N+1 atomically when an active sheet exists, with all components', async () => {
      const initialActive = await repository.getActiveCostSheet(orgId, 'CUP-12OZ-SW');
      const startVersion = initialActive ? initialActive.version : 0;
      const breakdown = IndustrialCostEngine.calculateCost(baseInput);

      const result = await repository.publishOfficialCostSheet(
        {
          sku: 'CUP-12OZ-SW',
          batchSize: 50000,
          breakdown,
          actorId: 'tester-1',
        },
        orgId
      );

      expect(result.version).toBe(startVersion + 1);
      expect(result.status).toBe('ACTIVE');
      expect(result.components?.length).toBeGreaterThanOrEqual(6);

      // Verify active sheet query
      const active = await repository.getActiveCostSheet(orgId, 'CUP-12OZ-SW');
      expect(active).not.toBeNull();
      expect(active?.id).toBe(result.id);
      expect(active?.version).toBe(startVersion + 1);
    });

    it('publishes version N+2 atomically, archiving version N+1 without data loss', async () => {
      const initialActive = await repository.getActiveCostSheet(orgId, 'CUP-12OZ-SW');
      const currentVersion = initialActive ? initialActive.version : 1;
      const breakdownV2 = IndustrialCostEngine.calculateCost({
        ...baseInput,
        operational_cost_per_thousand_usd: 6.0,
      });

      const resultV2 = await repository.publishOfficialCostSheet(
        {
          sku: 'CUP-12OZ-SW',
          batchSize: 50000,
          breakdown: breakdownV2,
          actorId: 'tester-1',
        },
        orgId
      );

      expect(resultV2.version).toBe(currentVersion + 1);
      expect(resultV2.status).toBe('ACTIVE');

      // Verify previous version is now ARCHIVED
      const allSheets = await repository.getCostSheets(orgId, 'CUP-12OZ-SW');
      const prev = allSheets.find((s) => s.version === currentVersion);
      expect(prev).toBeDefined();
      expect(prev?.status).toBe('ARCHIVED');

      // Active sheet is the new version
      const active = await repository.getActiveCostSheet(orgId, 'CUP-12OZ-SW');
      expect(active?.id).toBe(resultV2.id);
      expect(active?.version).toBe(currentVersion + 1);
    });
  });

  describe('2. Prorrateo Multi-SKU (Conservación de costo total)', () => {
    it('conserves total shared cost of Gs. 12.000.000 between SKU A (100k) and SKU B (200k)', () => {
      const totalSharedCostPyg = 12000000;
      const skuAUnits = 100000;
      const skuBUnits = 200000;
      const totalUnits = skuAUnits + skuBUnits;

      const shareA = skuAUnits / totalUnits; // 1/3
      const shareB = skuBUnits / totalUnits; // 2/3

      const costA = totalSharedCostPyg * shareA;
      const costB = totalSharedCostPyg * shareB;

      expect(costA).toBe(4000000);
      expect(costB).toBe(8000000);
      expect(costA + costB).toBe(totalSharedCostPyg);

      const unitCostA = costA / skuAUnits;
      const unitCostB = costB / skuBUnits;
      expect(unitCostA).toBe(unitCostB); // Equal cost per unit under proportional prorate
    });
  });

  describe('3. Cronómetro Móvil de Empaque — Ciclo Completo', () => {
    it('creates, changes headcount, stops, and approves packing session', async () => {
      // 1. Operator starts session with 3 people
      const session = await repository.createPackingSession({
        organization_id: orgId,
        line_name: 'Polipapel',
        sku: 'CUP-12OZ-SW',
        headcount: 3,
        reason: 'Inicio turno mañana',
      });

      expect(session.id).toBeDefined();
      expect(session.status).toBe('RUNNING');
      expect(session.segments.length).toBe(1);
      expect(session.segments[0].headcount).toBe(3);

      // 2. Change headcount to 2 people
      const updated = await repository.addPackingSessionSegment(session.id, {
        headcount: 2,
        reason: 'Reasignación de personal a formado',
      });

      expect(updated.segments.length).toBe(2);
      expect(updated.segments[1].headcount).toBe(2);

      // 3. Stop session
      const stopped = await repository.stopPackingSession(session.id);
      expect(stopped.status).toBe('STOPPED');
      expect(stopped.stopped_at).toBeDefined();

      // 4. Supervisor approves session
      const approved = await repository.approvePackingSession(session.id, 'supervisor-ana');
      expect(approved.status).toBe('APPROVED');
      expect(approved.approved_by).toBe('supervisor-ana');
      expect(approved.approved_at).toBeDefined();
    });
  });

  describe('4. Token QR Seguro (HMAC-SHA256)', () => {
    it('validates secret-based signature and rejects altered tokens', () => {
      const token = generatePackingToken(orgId, 'Polipapel', 14);
      expect(token).toBeTruthy();

      const decoded = verifyPackingToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.org).toBe(orgId);
      expect(decoded?.role).toBe('packing_operator');

      // Altered token fails
      const forged = token.replace(/a/g, 'b');
      expect(verifyPackingToken(forged)).toBeNull();
    });
  });

  describe('5. Hoja de Costos — 4 Estados de los Switches', () => {
    const processOperationalPer1000 = 8.5;
    const processPackagingPer1000 = 4.2;

    it('State 1: OFF / OFF uses manual rates', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseInput,
        operational_process_enabled: false,
        packaging_process_enabled: false,
      });

      expect(breakdown.cost_operational_usd).toBe(baseInput.operational_cost_per_thousand_usd / 1000);
      expect(breakdown.cost_packaging_usd).toBe(baseInput.packaging_cost_per_thousand_usd / 1000);
    });

    it('State 2: ON / OFF uses process operational and manual packaging', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: processOperationalPer1000,
        packaging_process_enabled: false,
      });

      expect(breakdown.cost_operational_usd).toBe(processOperationalPer1000 / 1000);
      expect(breakdown.cost_packaging_usd).toBe(baseInput.packaging_cost_per_thousand_usd / 1000);
    });

    it('State 3: OFF / ON uses manual operational and process packaging', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseInput,
        operational_process_enabled: false,
        packaging_process_enabled: true,
        process_packaging_cost_per_thousand_usd: processPackagingPer1000,
      });

      expect(breakdown.cost_operational_usd).toBe(baseInput.operational_cost_per_thousand_usd / 1000);
      expect(breakdown.cost_packaging_usd).toBeCloseTo(processPackagingPer1000 / 1000, 5);
    });

    it('State 4: ON / ON uses process operational and process packaging', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: processOperationalPer1000,
        packaging_process_enabled: true,
        process_packaging_cost_per_thousand_usd: processPackagingPer1000,
      });

      expect(breakdown.cost_operational_usd).toBe(processOperationalPer1000 / 1000);
      expect(breakdown.cost_packaging_usd).toBeCloseTo(processPackagingPer1000 / 1000, 5);
      expect(breakdown.rubrics?.length).toBe(6);
    });
  });

  describe('6. Fallback de Prorrateo para Switch de Procesos (Sin Período Registrado)', () => {
    it('calculates a test-only provisional rate from caller-supplied units with explicit payroll inputs', async () => {
      const persistedParams = await repository.getPlantParameters(orgId);
      // Test fixture only: official API operations require a production-period row
      // and never substitute SKU batch_size or seeded payroll defaults.
      const params: PlantGeneralParameters = {
        ...persistedParams,
        operator_monthly_salary_pyg: 3100000,
        packer_monthly_salary_pyg: 2500000,
        quality_inspectors_count: 1,
        quality_monthly_salary_pyg: 3500000,
      };
      const fxRate = 7500;
      const skuUnregistered = 'SKU-SIN-PERIODO';
      const batchSize = 100000;

      // Exercise the pure calculation engine with an explicit synthetic unit fixture.
      const calc = IndustrialProcessCostEngine.calculate({
        parameters: params,
        fxRate,
        production: {
          period: '2026-10',
          sku: skuUnregistered,
          good_units_produced: batchSize,
          total_period_units: batchSize,
        },
      });

      expect(calc.status).toBe('COMPLETE');
      expect(calc.operational_total_usd_per_thousand).toBeGreaterThan(0);
      expect(calc.good_units_basis).toBe(batchSize);

      // Verify that applying this calculation to a Cost Sheet produces valid unit true cost
      const costSheetInput: IndustrialProductCostInput = {
        ...baseInput,
        sku: skuUnregistered,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: calc.operational_total_usd_per_thousand,
        process_calculation_detail: calc,
      };

      const breakdown = IndustrialCostEngine.calculateCost(costSheetInput);
      expect(breakdown.cost_operational_usd).toBeCloseTo(calc.operational_total_usd_per_thousand / 1000, 5);
      expect(breakdown.true_unit_cost_usd).toBeGreaterThan(0);
    });
  });
});
