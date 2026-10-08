import { describe, it, expect, beforeEach } from 'vitest';
import { IndustrialProcessCostEngine } from '@/lib/engines/industrial-process-cost-engine';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { repository } from '@/lib/db/repository';
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
    packer_monthly_salary_pyg: 2800000,
    gen1_machines_count: 4,
    gen1_power_kw: 4.5,
    gen1_operators_count: 2,
    gen1_operating_hours: 160,
    gen2_machines_count: 2,
    gen2_power_kw: 6.0,
    gen2_operators_count: 1,
    gen2_operating_hours: 160,
    quality_inspectors_count: 2,
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

  it('includes ONLY approved packing sessions into packing labor cost', () => {
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
      {
        id: 'ses-unapproved-3',
        organization_id: 'org-test',
        session_code: 'SES-004',
        line_name: 'Polipapel',
        sku: 'CUP-12OZ-SW',
        status: 'VOIDED',
        started_at: '2026-10-04T08:00:00Z',
        total_person_hours: 5,
        segments: [],
        created_at: '2026-10-04T08:00:00Z',
        updated_at: '2026-10-04T08:00:00Z',
      },
    ];

    const calc = IndustrialProcessCostEngine.calculate({
      parameters: baseParams,
      fxRate,
      production: baseProduction,
      packingSessions: mixedSessions,
    });

    // Only ses-1 (16 person-hours) is approved
    expect(calc.packing_labor.approved_person_hours).toBe(16);
    expect(calc.packing_labor.sessions_count).toBe(1);

    // Packer hourly cost = 2.800.000 * 1.165 / 200 = 16.310 Gs./h
    expect(calc.packing_labor.packer_hourly_cost_pyg).toBe(16310);
    // Packing labor Pyg = 16 * 16310 = 260.960 Gs.
    expect(calc.packing_labor.packing_labor_pyg).toBe(260960);
    // Packing labor Usd = 260.960 / 6000 = 43.4933 USD
    expect(calc.packing_labor.packing_labor_usd).toBeCloseTo(43.4933, 3);
  });

  it('prorates operational and packaging costs per 1,000 units and unit cost correctly', () => {
    const calc = IndustrialProcessCostEngine.calculate({
      parameters: baseParams,
      fxRate,
      production: baseProduction, // 300.000 good units
      packingSessions: approvedSessions,
    });

    // Operational total USD = Forming (1991.00) + Quality (869.8667) = 2860.8667 USD
    // Unit operational USD = 2860.8667 / 300.000 = 0.009536 USD/u
    // Operational USD/1.000 = 9.5362 USD
    expect(calc.operational_total_usd_per_thousand).toBeCloseTo(9.5362, 2);
    expect(calc.true_unit_operational_usd).toBeCloseTo(0.00954, 4);

    // Packaging:
    // MO packing unit USD = 43.4933 / 300.000 = 0.000145 USD/u ($0.1450 USD/1.000)
    // Packaging materials USD/1.000 = 3.50 USD
    // Total packaging USD/1.000 = 3.50 + 0.1450 = 3.6450 USD/1.000
    // Total packaging unit USD = 0.003645 USD/u
    expect(calc.packaging_total_usd_per_thousand).toBeCloseTo(3.645, 2);
    expect(calc.true_unit_packaging_usd).toBeCloseTo(0.003645, 4);
  });

  it('handles zero production basis with SIN_BASE_PRORRATEO without dividing by zero', () => {
    const calc = IndustrialProcessCostEngine.calculate({
      parameters: baseParams,
      fxRate,
      production: { period: '2026-10', sku: 'CUP-12OZ-SW', good_units_produced: 0 },
      packingSessions: approvedSessions,
    });

    expect(calc.status).toBe('SIN_BASE_PRORRATEO');
    expect(calc.good_units_basis).toBe(0);
    expect(calc.operational_total_usd_per_thousand).toBe(0);
    expect(calc.true_unit_operational_usd).toBe(0);
    expect(Number.isFinite(calc.operational_total_usd_per_thousand)).toBe(true);
  });

  it('identifies missing required parameters with CONFIGURACION_INCOMPLETA', () => {
    const incompleteParams: Partial<PlantGeneralParameters> = {
      electricity_rate_pyg_kwh: 0,
      monthly_salary_hours: 0,
    };

    const calc = IndustrialProcessCostEngine.calculate({
      parameters: incompleteParams,
      fxRate: 0,
      production: baseProduction,
    });

    expect(calc.status).toBe('CONFIGURACION_INCOMPLETA');
    expect(calc.missing_fields).toBeDefined();
    expect(calc.missing_fields).toContain('Tarifa eléctrica global (Gs./kWh)');
    expect(calc.missing_fields).toContain('Horas salariales mensuales (h/mes)');
    expect(calc.missing_fields).toContain('Tipo de cambio FX (USD/PYG)');
  });

  describe('Cost Intelligence V1 Integration & Switches', () => {
    const baseCostInput: IndustrialProductCostInput = {
      sku: 'CUP-12OZ-SW',
      paper_formula: {
        cif_price_ton_usd: 1250,
        printing_method: 'OFFSET',
        sheet_width_mm: 700,
        sheet_height_mm: 1000,
        gsm: 260,
        coating_gsm: 18,
        units_per_sheet: 11,
        paper_yield_units_per_ton: 0,
      },
      bottom_paper_cost_ton_usd: 1350,
      bottom_yield_units_per_ton: 350000,
      printing_cost_mode: 'PER_THOUSAND',
      quoted_printing_rate_usd: 4.5,
      operational_cost_per_thousand_usd: 5.4, // Manual: $5.40 / 1.000 ($0.00540/u)
      machine_depreciation_per_thousand_usd: 3.5,
      scrap_rate_percent: 6.5,
      packaging_cost_per_thousand_usd: 2.2, // Manual: $2.20 / 1.000 ($0.00220/u)
      batch_size: 300000,
      rubrics: {
        raw_material: { enabled: true, source: 'FORMULA', unit: 'PER_UNIT' },
        printing_die_cut: { enabled: true, source: 'QUOTE', unit: 'PER_1000' },
        operational: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
        scrap: { enabled: true, source: 'MANUAL', unit: 'PERCENT' },
        depreciation: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
        packaging: { enabled: true, source: 'MANUAL', unit: 'PER_1000' },
      },
    };

    it('uses exact manual rates when switches are OFF without modifying them', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseCostInput,
        operational_process_enabled: false,
        packaging_process_enabled: false,
      });

      expect(breakdown.cost_operational_usd).toBe(0.0054);
      expect(breakdown.cost_packaging_usd).toBe(0.0022);

      const opRubric = breakdown.rubrics?.find((r) => r.key === 'operational');
      const packRubric = breakdown.rubrics?.find((r) => r.key === 'packaging');
      expect(opRubric?.source).toBe('MANUAL');
      expect(packRubric?.source).toBe('MANUAL');
    });

    it('substitutes operational rate with process rate when switch is ON and labels source as PROCESS', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseCostInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: 9.5362,
        packaging_process_enabled: false,
      });

      // Does NOT sum manual ($5.40) + process ($9.5362). It replaces it!
      expect(breakdown.cost_operational_usd).toBeCloseTo(0.00954, 4);
      expect(breakdown.cost_operational_usd).not.toBe(0.0054);

      const opRubric = breakdown.rubrics?.find((r) => r.key === 'operational');
      expect(opRubric?.source).toBe('PROCESS');
      expect(opRubric?.impact_usd_per_unit).toBeCloseTo(0.00954, 4);

      // Packaging remains manual
      expect(breakdown.cost_packaging_usd).toBe(0.0022);
      const packRubric = breakdown.rubrics?.find((r) => r.key === 'packaging');
      expect(packRubric?.source).toBe('MANUAL');
    });

    it('substitutes packaging rate with process rate when switch is ON without summing manual cost', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseCostInput,
        operational_process_enabled: false,
        packaging_process_enabled: true,
        process_packaging_cost_per_thousand_usd: 3.645,
      });

      // Does NOT sum manual ($2.20) + process ($3.645). Replaces it!
      expect(breakdown.cost_packaging_usd).toBeCloseTo(0.00365, 4);
      expect(breakdown.cost_packaging_usd).not.toBe(0.0022);

      const packRubric = breakdown.rubrics?.find((r) => r.key === 'packaging');
      expect(packRubric?.source).toBe('PROCESS');

      // Operational remains manual
      expect(breakdown.cost_operational_usd).toBe(0.0054);
    });

    it('allows both switches ON simultaneously and maintains exactly six rubrics', () => {
      const breakdown = IndustrialCostEngine.calculateCost({
        ...baseCostInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: 9.5362,
        packaging_process_enabled: true,
        process_packaging_cost_per_thousand_usd: 3.645,
      });

      expect(breakdown.rubrics?.length).toBe(6);
      expect(breakdown.rubrics?.map((r) => r.key)).toEqual([
        'raw_material',
        'printing_die_cut',
        'operational',
        'scrap',
        'depreciation',
        'packaging',
      ]);

      const opRubric = breakdown.rubrics?.find((r) => r.key === 'operational');
      const packRubric = breakdown.rubrics?.find((r) => r.key === 'packaging');
      expect(opRubric?.source).toBe('PROCESS');
      expect(packRubric?.source).toBe('PROCESS');

      // True cost includes the process values
      expect(breakdown.true_unit_cost_usd).toBeGreaterThan(0.04);
    });

    it('marks configuration as incomplete when switch is ON but process value is missing', () => {
      const incomplete = {
        ...baseCostInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: 0,
      };

      const missing = IndustrialCostEngine.getMissingConfiguration(incomplete);
      expect(missing).toContain('Costos operativos (cálculo de Procesos pendiente o incompleto)');

      const breakdown = IndustrialCostEngine.calculateCost(incomplete);
      expect(breakdown.configured).toBe(false);
    });

    it('preserves manual rates in input payload when toggling switch back to OFF', () => {
      const toggledOn: IndustrialProductCostInput = {
        ...baseCostInput,
        operational_process_enabled: true,
        process_operational_cost_per_thousand_usd: 9.5362,
      };

      // Toggling back to OFF
      const toggledOff: IndustrialProductCostInput = {
        ...toggledOn,
        operational_process_enabled: false,
      };

      const breakdownOff = IndustrialCostEngine.calculateCost(toggledOff);
      // The original manual rate ($5.40 / 1.000) was preserved and is restored immediately!
      expect(breakdownOff.cost_operational_usd).toBe(0.0054);
    });
  });

  describe('Repository Stopwatch Workflow', () => {
    it('manages packing stopwatch lifecycle: start, dynamic headcount change, stop, approve', async () => {
      // 1. Start session
      const session = await repository.startPackingSession({
        line_name: 'Polipapel',
        sku: 'CUP-12OZ-SW',
        production_order: 'OP-TEST-99',
        initial_headcount: 2,
        reason: 'Inicio de turno',
      });

      expect(session.id).toBeDefined();
      expect(session.status).toBe('RUNNING');
      expect(session.segments.length).toBe(1);
      expect(session.segments[0].headcount).toBe(2);
      expect(session.segments[0].segment_order).toBe(1);

      // 2. Change headcount to 3 without stopping the session
      const updatedSession = await repository.changePackingHeadcount(
        session.id,
        3,
        'Refuerzo de empaque por aceleración de línea'
      );

      expect(updatedSession.status).toBe('RUNNING');
      expect(updatedSession.segments.length).toBe(2);
      expect(updatedSession.segments[0].ended_at).toBeDefined();
      expect(updatedSession.segments[1].headcount).toBe(3);
      expect(updatedSession.segments[1].segment_order).toBe(2);

      // 3. Stop session
      const stoppedSession = await repository.stopPackingSession(session.id);
      expect(stoppedSession.status).toBe('STOPPED');
      expect(stoppedSession.stopped_at).toBeDefined();
      expect(stoppedSession.segments[1].ended_at).toBeDefined();

      // 4. Approve session
      const approved = await repository.approvePackingSession(session.id, 'supervisor-user-1');
      expect(approved.status).toBe('APPROVED');
      expect(approved.approved_at).toBeDefined();
      expect(approved.approved_by).toBe('supervisor-user-1');

      // 5. Correct session
      const corrected = await repository.correctPackingSession(session.id, {
        total_person_hours: 18.5,
        notes: 'Ajuste auditado por gerencia de planta',
      });
      expect(corrected.status).toBe('CORRECTED');
      expect(corrected.total_person_hours).toBe(18.5);
      expect(corrected.notes).toContain('Ajuste auditado');
    });
  });
});
