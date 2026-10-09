import { describe, it, expect, beforeEach } from 'vitest';
import { IndustrialProcessCostEngine } from '@/lib/engines/industrial-process-cost-engine';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { repository } from '@/lib/db/repository';
import { generatePackingToken, verifyPackingToken } from '@/lib/auth/packing-token';
import {
  IndustrialProductCostInput,
  PackingSession,
  PlantGeneralParameters,
  PlantProductionPeriod,
} from '@/types';

describe('Industrial Processes V2 — Parametrización Industrial & Cronómetro', () => {
  const baseParams: PlantGeneralParameters = {
    electricity_rate_pyg_kwh: 450,
    monthly_salary_hours: 200,
    labor_charges_percent: 16.5,
    operator_monthly_salary_pyg: 3500000,
    packer_monthly_salary_pyg: 3100000, // CONFIRMED Gs. 3.100.000
    gen1_machines_count: 4,
    gen1_power_kw: 4.5,
    gen1_operators_count: 2,
    gen1_operating_hours: 160,
    gen2_machines_count: 2,
    gen2_power_kw: 6.0,
    gen2_operators_count: 1,
    gen2_operating_hours: 160,
    quality_inspectors_count: 2, // CONFIRMED 2 personas
    quality_monthly_salary_pyg: 3200000,
    quality_polypaper_percent: 70,
    quality_labor_charges_included: true,
    packaging_materials_cost_per_thousand_usd: 3.5,
  };

  const fxRate = 6000; // 6.000 Gs. / USD

  const baseProduction: PlantProductionPeriod = {
    period: '2026-10',
    sku: 'CUP-12OZ-SW',
    good_units_produced: 300000,
  };

  const approvedSessions: PackingSession[] = [
    {
      id: 'ses-1',
      organization_id: 'org-test',
      session_code: 'SES-001',
      line_name: 'Polipapel',
      sku: 'CUP-12OZ-SW',
      status: 'APPROVED',
      started_at: '2026-10-01T08:00:00Z',
      stopped_at: '2026-10-01T16:00:00Z',
      total_duration_minutes: 480,
      total_person_hours: 16, // 8 hours * 2 people
      segments: [
        {
          id: 'seg-1',
          session_id: 'ses-1',
          segment_order: 1,
          headcount: 2,
          started_at: '2026-10-01T08:00:00Z',
          ended_at: '2026-10-01T16:00:00Z',
          duration_minutes: 480,
          person_hours: 16,
        },
      ],
      created_at: '2026-10-01T08:00:00Z',
      updated_at: '2026-10-01T16:30:00Z',
    },
  ];

  // ========================================================
  // ESCENARIO 1 — FORMADO DE VASOS
  // ========================================================
  describe('ESCENARIO 1 — Formado de Vasos', () => {
    it('calculates consumption of 96 kWh and electricity cost of Gs. 38.400 for 2 machines @ 6 kW for 8 hours @ Gs. 400/kWh', () => {
      const formingParams: Partial<PlantGeneralParameters> = {
        electricity_rate_pyg_kwh: 400,
        monthly_salary_hours: 200,
        labor_charges_percent: 0,
        operator_monthly_salary_pyg: 3500000,
        packer_monthly_salary_pyg: 3100000,
        gen1_machines_count: 0,
        gen1_power_kw: 0,
        gen1_operating_hours: 0,
        gen1_operators_count: 0,
        gen2_machines_count: 2,
        gen2_power_kw: 6.0,
        gen2_operating_hours: 8,
        gen2_operators_count: 0,
      };

      const calc = IndustrialProcessCostEngine.calculate({
        parameters: formingParams,
        fxRate: 7500,
        production: { good_units_produced: 10000 },
      });

      // 2 machines * 6 kW * 8 hours = 96 kWh
      expect(calc.forming.energy_kwh_gen2).toBe(96);
      expect(calc.forming.total_energy_kwh).toBe(96);
      // 96 kWh * 400 Gs./kWh = Gs. 38.400
      expect(calc.forming.electricity_cost_pyg).toBe(38400);
    });

    it('calculates forming electricity and direct machine operator costs deterministically', () => {
      const calc = IndustrialProcessCostEngine.calculate({
        parameters: baseParams,
        fxRate,
        production: baseProduction,
        packingSessions: [],
      });

      expect(calc.status).toBe('COMPLETE');

      // Gen 1 Energy: 4 machines * 4.5 kW * 160 h = 2880 kWh
      expect(calc.forming.energy_kwh_gen1).toBe(2880);
      // Gen 2 Energy: 2 machines * 6.0 kW * 160 h = 1920 kWh
      expect(calc.forming.energy_kwh_gen2).toBe(1920);
      // Total energy: 4800 kWh
      expect(calc.forming.total_energy_kwh).toBe(4800);
      // Electricity cost Gs: 4800 * 450 = 2.160.000 Gs.
      expect(calc.forming.electricity_cost_pyg).toBe(2160000);

      // Operator Hourly Cost: 3.500.000 * 1.165 / 200 = 20.387,5 Gs./h
      expect(calc.forming.operator_hourly_cost_pyg).toBe(20387.5);
      // Total operator hours: (2 ops * 160 h) + (1 op * 160 h) = 480 h
      // Total MOD Gs: 480 * 20387.5 = 9.786.000 Gs.
      expect(calc.forming.mod_forming_cost_pyg).toBe(9786000);

      // Total forming Pyg = 2.160.000 + 9.786.000 = 11.946.000 Gs.
      expect(calc.forming.total_forming_pyg).toBe(11946000);
      // Total forming Usd = 11.946.000 / 6000 = 1991.00 USD
      expect(calc.forming.total_forming_usd).toBe(1991.0);
    });
  });

  // ========================================================
  // ESCENARIO 2 — CONTROL DE CALIDAD
  // ========================================================
  describe('ESCENARIO 2 — Control de Calidad', () => {
    it('calculates Gs. 2.400.000 monthly allocated for 2 people @ Gs. 3.000.000 with 40% polypaper and no social charges', () => {
      const qualityParams: Partial<PlantGeneralParameters> = {
        quality_inspectors_count: 2,
        quality_monthly_salary_pyg: 3000000,
        quality_polypaper_percent: 40,
        quality_labor_charges_included: false,
        labor_charges_percent: 0,
      };

      const calc = IndustrialProcessCostEngine.calculate({
        parameters: qualityParams,
        fxRate: 7500,
        production: { good_units_produced: 10000 },
      });

      // 2 persons * 3.000.000 * 1.0 * 40% = Gs. 2.400.000
      expect(calc.quality.assigned_monthly_pyg).toBe(2400000);
      expect(calc.quality.assigned_usd).toBe(320); // 2.400.000 / 7500 = 320 USD
    });

    it('allocates quality control inspectors proportionally to polypaper with social charges', () => {
      const calc = IndustrialProcessCostEngine.calculate({
        parameters: baseParams,
        fxRate,
        production: baseProduction,
        packingSessions: [],
      });

      // 2 inspectors * 3.200.000 * 1.165 * 70% = 5.219.200 Gs.
      expect(calc.quality.assigned_monthly_pyg).toBe(5219200);
      // USD: 5.219.200 / 6000 = 869.8667 USD
      expect(calc.quality.assigned_usd).toBeCloseTo(869.8667, 3);
    });
  });

  // ========================================================
  // ESCENARIO 3 — CRONÓMETRO MÓVIL Y SEGMENTOS
  // ========================================================
  describe('ESCENARIO 3 — Cronómetro Móvil y Segmentos', () => {
    it('calculates person-hours dynamically across segments without retroactively applying new headcount', () => {
      // Example 3 from specification:
      // 08:00 to 10:00: 2 hours * 3 persons = 6 person-hours
      // 10:00 to 12:00: 2 hours * 5 persons = 10 person-hours
      // Total = 16 person-hours (not 20 person-hours)
      const multiSegmentSession: PackingSession = {
        id: 'ses-segments',
        organization_id: 'org-test',
        session_code: 'SES-003',
        line_name: 'Polipapel',
        sku: 'CUP-12OZ-SW',
        status: 'APPROVED',
        started_at: '2026-10-01T08:00:00Z',
        stopped_at: '2026-10-01T12:00:00Z',
        total_duration_minutes: 240,
        total_person_hours: 16,
        segments: [
          {
            id: 'seg-1',
            session_id: 'ses-segments',
            segment_order: 1,
            headcount: 3,
            started_at: '2026-10-01T08:00:00Z',
            ended_at: '2026-10-01T10:00:00Z',
            duration_minutes: 120,
            person_hours: 6, // 2 h * 3 people
          },
          {
            id: 'seg-2',
            session_id: 'ses-segments',
            segment_order: 2,
            headcount: 5,
            started_at: '2026-10-01T10:00:00Z',
            ended_at: '2026-10-01T12:00:00Z',
            duration_minutes: 120,
            person_hours: 10, // 2 h * 5 people
          },
        ],
        created_at: '2026-10-01T08:00:00Z',
        updated_at: '2026-10-01T12:00:00Z',
      };

      const calc = IndustrialProcessCostEngine.calculate({
        parameters: baseParams,
        fxRate,
        production: baseProduction,
        packingSessions: [multiSegmentSession],
      });

      expect(calc.packing_labor.approved_person_hours).toBe(16);
      expect(calc.packing_labor.sessions_count).toBe(1);
    });
  });

  // ========================================================
  // ESCENARIO 4 — APROBACIÓN Y PERMISOS
  // ========================================================
  describe('ESCENARIO 4 — Aprobación y Permisos', () => {
    it('includes ONLY approved packing sessions into packing labor cost; unapproved sessions do not impact', () => {
      const mixedSessions: PackingSession[] = [
        ...approvedSessions,
        {
          id: 'ses-unapproved-1',
          organization_id: 'org-test',
          session_code: 'SES-002',
          line_name: 'Polipapel',
          sku: 'CUP-12OZ-SW',
          status: 'RUNNING',
          started_at: '2026-10-02T08:00:00Z',
          total_person_hours: 10,
          segments: [],
          created_at: '2026-10-02T08:00:00Z',
          updated_at: '2026-10-02T08:00:00Z',
        },
        {
          id: 'ses-unapproved-2',
          organization_id: 'org-test',
          session_code: 'SES-003',
          line_name: 'Polipapel',
          sku: 'CUP-12OZ-SW',
          status: 'STOPPED',
          started_at: '2026-10-03T08:00:00Z',
          total_person_hours: 8,
          segments: [],
          created_at: '2026-10-03T08:00:00Z',
          updated_at: '2026-10-03T08:00:00Z',
        },
      ];

      const calc = IndustrialProcessCostEngine.calculate({
        parameters: baseParams,
        fxRate,
        production: baseProduction,
        packingSessions: mixedSessions,
      });

      // Only the 16 approved person-hours from ses-1 participate!
      expect(calc.packing_labor.approved_person_hours).toBe(16);
      expect(calc.packing_labor.sessions_count).toBe(1);
    });

    it('manages packing stopwatch lifecycle in repository: start, change headcount, stop, approve', async () => {
      const session = await repository.startPackingSession({
        line_name: 'Polipapel',
        sku: 'CUP-12OZ-SW',
        initial_headcount: 3,
        reason: 'Inicio de turno',
      });

      expect(session.id).toBeDefined();
      expect(session.status).toBe('RUNNING');
      expect(session.segments.length).toBe(1);
      expect(session.segments[0].headcount).toBe(3);

      const changed = await repository.changePackingHeadcount(session.id, 5, 'Refuerzo');
      expect(changed.status).toBe('RUNNING');
      expect(changed.segments.length).toBe(2);
      expect(changed.segments[1].headcount).toBe(5);

      const stopped = await repository.stopPackingSession(session.id);
      expect(stopped.status).toBe('STOPPED');
      expect(stopped.stopped_at).toBeDefined();

      const approved = await repository.approvePackingSession(session.id, 'supervisor-id');
      expect(approved.status).toBe('APPROVED');
      expect(approved.approved_by).toBe('supervisor-id');
    });
  });

  // ========================================================
  // ESCENARIO 5 — PRORRATEO MULTISKU Y CONSERVACIÓN DE SUMA
  // ========================================================
  describe('ESCENARIO 5 — Prorrateo Multi-SKU y Conservación de Suma', () => {
    it('guarantees SUM(Allocated Cost) = Total Shared Cost across SKUs in a period', () => {
      // Specification Requirement #8:
      // Shared period cost: Gs. 12.000.000
      // SKU A: 100.000 good units
      // SKU B: 200.000 good units
      // Total period production: 300.000 units
      // Cost per unit = Gs. 40
      // SKU A allocation = Gs. 4.000.000
      // SKU B allocation = Gs. 8.000.000
      // Sum = Gs. 12.000.000 (Exact conservation!)
      const totalPeriodUnits = 300000;
      const skuAUnits = 100000;
      const skuBUnits = 200000;

      // Parameters producing forming total = 11.946.000 Gs., quality total = 5.219.200 Gs.
      // Total shared period operational cost = 17.165.200 Gs.
      const calcSKUA = IndustrialProcessCostEngine.calculate({
        parameters: baseParams,
        fxRate,
        production: {
          period: '2026-10',
          sku: 'SKU-A',
          good_units_produced: skuAUnits,
          total_period_units: totalPeriodUnits,
        },
      });

      const calcSKUB = IndustrialProcessCostEngine.calculate({
        parameters: baseParams,
        fxRate,
        production: {
          period: '2026-10',
          sku: 'SKU-B',
          good_units_produced: skuBUnits,
          total_period_units: totalPeriodUnits,
        },
      });

      // Total shared cost in period
      const totalSharedPyg = calcSKUA.forming.total_forming_pyg + calcSKUA.quality.assigned_monthly_pyg;
      const totalSharedUsd = calcSKUA.forming.total_forming_usd + calcSKUA.quality.assigned_usd;

      // Both SKUs have the exact same unit operational rate (cost per unit)
      expect(calcSKUA.true_unit_operational_usd).toBe(calcSKUB.true_unit_operational_usd);
      expect(calcSKUA.operational_total_usd_per_thousand).toBe(calcSKUB.operational_total_usd_per_thousand);

      // Allocated amounts
      const allocatedA_Pyg = calcSKUA.allocated_operational_pyg!;
      const allocatedB_Pyg = calcSKUB.allocated_operational_pyg!;
      const sumAllocatedPyg = allocatedA_Pyg + allocatedB_Pyg;

      // Exact conservation in PYG
      expect(sumAllocatedPyg).toBe(totalSharedPyg);

      // Exact conservation in USD
      const allocatedA_Usd = calcSKUA.allocated_operational_usd!;
      const allocatedB_Usd = calcSKUB.allocated_operational_usd!;
      expect(allocatedA_Usd + allocatedB_Usd).toBeCloseTo(totalSharedUsd, 2);

      // Proportion test: SKU B has twice the units of SKU A -> receives twice the allocation (within 1 Guaraní integer rounding)
      expect(Math.abs(allocatedB_Pyg - allocatedA_Pyg * 2)).toBeLessThanOrEqual(1);
      expect(allocatedB_Usd).toBeCloseTo(allocatedA_Usd * 2, 2);
    });
  });

  // ========================================================
  // ESCENARIO 6 — HOJA DE COSTOS E INDEPENDENCIA DE SWITCHES
  // ========================================================
  describe('ESCENARIO 6 — Hoja de Costos e Independencia de Switches', () => {
    const baseCostInput: IndustrialProductCostInput = {
      sku: 'CUP-12OZ-SW',
      batch_size: 100000,
      paper_formula: {
        cif_price_ton_usd: 1250,
        customs_dispatch_percent: 13,
        financial_cost_percent: 6,
        printing_method: 'OFFSET',
        sheet_width_mm: 720,
        sheet_height_mm: 1020,
        gsm: 210,
        coating_gsm: 15,
        units_per_sheet: 24,
        paper_yield_units_per_ton: 0,
      },
      bottom_formula: {
        cif_price_ton_usd: 1250,
        customs_dispatch_percent: 13,
        financial_cost_percent: 6,
        gsm: 190,
        coating_gsm: 15,
        units_per_m2: 180,
      },
      bottom_paper_cost_ton_usd: 1250,
      bottom_yield_units_per_ton: 0,
      quoted_printing_rate_usd: 4.5,
      printing_cost_mode: 'PER_THOUSAND',
      operational_cost_per_thousand_usd: 5.4,
      packaging_cost_per_thousand_usd: 2.2,
      machine_depreciation_per_thousand_usd: 1.5,
      scrap_rate_percent: 4.0,
      operational_process_enabled: false,
      packaging_process_enabled: false,
    };

    it('uses manual rates for operational and packaging when both switches are OFF', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseCostInput,
        operational_process_enabled: false,
        packaging_process_enabled: false,
      });

      expect(breakdown.cost_operational_usd).toBe(0.0054); // $5.40 / 1000
      expect(breakdown.cost_packaging_usd).toBe(0.0022);   // $2.20 / 1000
    });

    it('substitutes operational rate with process rate when operational switch is ON and leaves packaging manual', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseCostInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: 9.5362,
        packaging_process_enabled: false,
      });

      expect(breakdown.cost_operational_usd).toBeCloseTo(0.00954, 4);
      expect(breakdown.cost_packaging_usd).toBe(0.0022); // Packaging remains manual
    });

    it('substitutes packaging rate with process rate when packaging switch is ON and leaves operational manual', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseCostInput,
        operational_process_enabled: false,
        packaging_process_enabled: true,
        process_packaging_cost_per_thousand_usd: 3.645,
      });

      expect(breakdown.cost_operational_usd).toBe(0.0054); // Operational remains manual
      expect(breakdown.cost_packaging_usd).toBeCloseTo(0.00365, 4);
    });

    it('allows both switches ON simultaneously without summing manual cost', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseCostInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: 9.5362,
        packaging_process_enabled: true,
        process_packaging_cost_per_thousand_usd: 3.645,
      });

      expect(breakdown.cost_operational_usd).toBeCloseTo(0.00954, 4);
      expect(breakdown.cost_packaging_usd).toBeCloseTo(0.00365, 4);
      expect(breakdown.rubrics?.length).toBe(6);
    });

    it('excludes rubric from total when ACTIVO is unchecked regardless of switch state', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseCostInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: 9.5362,
        rubrics: {
          operational: { enabled: false, source: 'PROCESS', unit: 'PER_1000' },
        },
      });

      expect(breakdown.cost_operational_usd).toBe(0); // Excluded because ACTIVO is false
    });

    it('never silently uses manual cost when switch is ON but process calculation is missing', () => {
      const incomplete = {
        ...baseCostInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: 0,
      };

      const missing = IndustrialCostEngine.getMissingConfiguration(incomplete);
      expect(missing).toContain('Costos operativos (cálculo de Procesos pendiente o incompleto)');

      const breakdown = IndustrialCostEngine.calculateCost(incomplete);
      // Cost should be 0, NOT falling back silently to $5.40 manual!
      expect(breakdown.cost_operational_usd).toBe(0);
      expect(breakdown.configured).toBe(false);
    });
  });

  // ========================================================
  // ESCENARIO 7 — INTEGRACIÓN DB Y CONTRATO DE SNAPSHOT
  // ========================================================
  describe('ESCENARIO 7 — Integración DB y Contrato de Snapshot', () => {
    it('persists industrial process snapshot matching the SQL schema columns', async () => {
      const snapshot = await repository.saveIndustrialProcessSnapshot({
        organization_id: 'org-test-v2',
        sku: 'CUP-8OZ-TEST',
        period: '2026-10',
        detail_json: { status: 'COMPLETE', true_unit_cost: 0.05 },
        calculation_detail: { status: 'COMPLETE', true_unit_cost: 0.05 } as any,
        created_by: 'user-audit-1',
      });

      expect(snapshot.id).toBeDefined();
      expect(snapshot.sku).toBe('CUP-8OZ-TEST');
      expect(snapshot.period).toBe('2026-10');
      expect(snapshot.detail_json).toBeDefined();
      expect(snapshot.calculated_at).toBeDefined();
    });
  });

  // ========================================================
  // ESCENARIO 8 — TOKEN QR HMAC Y CONTRATOS
  // ========================================================
  describe('ESCENARIO 8 — Token QR HMAC y Contratos', () => {
    it('generates and verifies HMAC-SHA256 signed packing operator token with expiration', () => {
      const orgId = '00000000-0000-0000-0000-000000000001';
      const token = generatePackingToken(orgId, 'Polipapel', 7);

      expect(token).toBeDefined();
      expect(token).toContain('.');

      const payload = verifyPackingToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.org).toBe(orgId);
      expect(payload?.line).toBe('Polipapel');
      expect(payload?.role).toBe('packing_operator');
      expect(payload?.scope).toBe('planta_empaque');
      expect(payload?.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it('rejects tampered or malformed packing tokens', () => {
      const orgId = '00000000-0000-0000-0000-000000000001';
      const validToken = generatePackingToken(orgId, 'Polipapel', 7);
      const tamperedToken = validToken + 'tamper';

      expect(verifyPackingToken(tamperedToken)).toBeNull();
      expect(verifyPackingToken('invalid-token')).toBeNull();
      expect(verifyPackingToken('')).toBeNull();
    });
  });
});
