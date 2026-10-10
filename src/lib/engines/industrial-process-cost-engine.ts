import {
  IndustrialProcessCalculationDetail,
  IndustrialSector,
  PackingLaborAllocation,
  PackingSession,
  PlantGeneralParameters,
  PlantProductionPeriod,
  SectorPersonnelSummary,
} from '@/types';

export interface IndustrialProcessEngineInput {
  parameters: Partial<PlantGeneralParameters>;
  fxRate: number;
  fxSource?: string;
  production: Partial<PlantProductionPeriod> & {
    total_period_units?: number;
  };
  packingSessions?: PackingSession[];
  calculationDate?: string;
  // Centralized Personnel Master & Salary Bands integration
  sectorPersonnelSummaries?: Record<IndustrialSector, SectorPersonnelSummary>;
  packingLaborAllocations?: PackingLaborAllocation[];
}

export class IndustrialProcessCostEngine {
  /**
   * Identifies missing configuration fields required for a valid industrial process calculation.
   */
  public static getMissingConfiguration(
    params: Partial<PlantGeneralParameters>,
    fxRate: number,
    sectorSummaries?: Record<IndustrialSector, SectorPersonnelSummary>
  ): string[] {
    const missing: string[] = [];

    if (!params.electricity_rate_pyg_kwh || params.electricity_rate_pyg_kwh <= 0) {
      missing.push('Tarifa eléctrica global (Gs./kWh)');
    }
    if (!params.monthly_salary_hours || params.monthly_salary_hours <= 0) {
      missing.push('Horas salariales mensuales (h/mes)');
    }
    if (!fxRate || fxRate <= 0) {
      missing.push('Tipo de cambio FX (USD/PYG)');
    }
    if (!(Number(params.packaging_materials_cost_per_thousand_usd) > 0)) {
      missing.push('Costo de materiales de empaque (USD/1.000)');
    }

    if (sectorSummaries) {
      if (!sectorSummaries.FORMADO?.is_configured || sectorSummaries.FORMADO.assigned_count <= 0) {
        missing.push('Personal de Formado con banda salarial vigente');
      }
      if (Number(params.quality_polypaper_percent || 0) > 0 &&
        (!sectorSummaries.CALIDAD?.is_configured || sectorSummaries.CALIDAD.assigned_count <= 0)) {
        missing.push('Personal de Calidad con banda salarial vigente');
      }
      if (!sectorSummaries.EMPAQUE?.is_configured || sectorSummaries.EMPAQUE.assigned_count <= 0) {
        missing.push('Personal de Empaque con banda salarial vigente');
      }
    } else {
      if (!params.operator_monthly_salary_pyg || params.operator_monthly_salary_pyg <= 0) {
        missing.push('Salario histórico de operador de formado (Gs./mes)');
      }
      if (!params.packer_monthly_salary_pyg || params.packer_monthly_salary_pyg <= 0) {
        missing.push('Salario histórico de empacador (Gs./mes)');
      }
      if (Number(params.quality_polypaper_percent || 0) > 0 &&
        (!(Number(params.quality_inspectors_count) > 0) || !(Number(params.quality_monthly_salary_pyg) > 0))) {
        missing.push('Personal de Calidad con banda salarial vigente');
      }
    }

    const hasGen1 = (params.gen1_machines_count ?? 0) > 0 && (params.gen1_power_kw ?? 0) > 0;
    const hasGen2 = (params.gen2_machines_count ?? 0) > 0 && (params.gen2_power_kw ?? 0) > 0;
    if (!hasGen1 && !hasGen2) {
      missing.push('Máquinas formadoras activas (Gen 1 o Gen 2)');
    }

    return missing;
  }

  /**
   * Deterministic calculation of industrial operational and packaging costs with multi-SKU shared prorating.
   * Guarantees exact conservation of total shared period costs across all produced SKUs.
   */
  public static calculate(input: IndustrialProcessEngineInput): IndustrialProcessCalculationDetail {
    const {
      parameters: p,
      fxRate,
      fxSource = 'FX_OS',
      production,
      packingSessions = [],
      sectorPersonnelSummaries,
      packingLaborAllocations = [],
    } = input;
    const calculationDate = input.calculationDate || new Date().toISOString();

    const missing = this.getMissingConfiguration(p, fxRate, sectorPersonnelSummaries);
    const goodUnits = Number(production.good_units_produced || 0);
    // Multi-SKU total production base: sum of good units across all SKUs in period (defaults to goodUnits)
    const totalPeriodUnits = Number(production.total_period_units || goodUnits);

    const monthlySalaryHours = Number(p.monthly_salary_hours || 0);
    const laborMultiplier = 1 + Number(p.labor_charges_percent || 0) / 100;
    const electricityRatePyg = Number(p.electricity_rate_pyg_kwh || 0);

    // 1. Formado de Vasos: Electricidad
    const gen1Machines = Number(p.gen1_machines_count || 0);
    const gen1PowerKw = Number(p.gen1_power_kw || 0);
    const gen1Hours = Number(p.gen1_operating_hours || 0);
    const energyKwhGen1 = gen1Machines * gen1PowerKw * gen1Hours;

    const gen2Machines = Number(p.gen2_machines_count || 0);
    const gen2PowerKw = Number(p.gen2_power_kw || 0);
    const gen2Hours = Number(p.gen2_operating_hours || 0);
    const energyKwhGen2 = gen2Machines * gen2PowerKw * gen2Hours;

    const totalEnergyKwh = energyKwhGen1 + energyKwhGen2;
    const electricityCostPyg = totalEnergyKwh * electricityRatePyg;

    // 1. Formado de Vasos: Operadores
    const legacyOperatorMonthlySalaryPyg = Number(p.operator_monthly_salary_pyg || 0);
    const legacyOperatorMonthlyTotalPyg = legacyOperatorMonthlySalaryPyg * laborMultiplier;
    const legacyOperatorHourlyCostPyg = monthlySalaryHours > 0 ? legacyOperatorMonthlyTotalPyg / monthlySalaryHours : 0;

    let gen1OperatorsCount = Number(p.gen1_operators_count || 0);
    let gen1OperatorsSalaryPyg = gen1OperatorsCount * legacyOperatorMonthlySalaryPyg;
    let modGen1CostPyg = 0;

    const formingSummary = sectorPersonnelSummaries?.FORMADO;
    if (sectorPersonnelSummaries) {
      const gen1People = (formingSummary?.personnel || [])
        .filter((person) => (person.generation_allocations?.GEN1 || 0) > 0);
      gen1OperatorsCount = gen1People.length;
      gen1OperatorsSalaryPyg = gen1People.reduce(
        (sum, person) => sum + person.monthly_salary_pyg * (person.generation_allocations?.GEN1 || 0) / 100,
        0
      );
      // A person is paid one monthly salary: their cost is that salary plus charges, split by
      // generation allocation. Machine operating hours never multiply a person's pay.
      modGen1CostPyg = gen1OperatorsSalaryPyg * laborMultiplier;
    } else {
      modGen1CostPyg = gen1OperatorsCount * gen1Hours * legacyOperatorHourlyCostPyg;
    }

    let gen2OperatorsCount = Number(p.gen2_operators_count || 0);
    let gen2OperatorsSalaryPyg = gen2OperatorsCount * legacyOperatorMonthlySalaryPyg;
    let modGen2CostPyg = 0;

    if (sectorPersonnelSummaries) {
      const gen2People = (formingSummary?.personnel || [])
        .filter((person) => (person.generation_allocations?.GEN2 || 0) > 0);
      gen2OperatorsCount = gen2People.length;
      gen2OperatorsSalaryPyg = gen2People.reduce(
        (sum, person) => sum + person.monthly_salary_pyg * (person.generation_allocations?.GEN2 || 0) / 100,
        0
      );
      modGen2CostPyg = gen2OperatorsSalaryPyg * laborMultiplier;
    } else {
      modGen2CostPyg = gen2OperatorsCount * gen2Hours * legacyOperatorHourlyCostPyg;
    }

    const modFormingCostPyg = modGen1CostPyg + modGen2CostPyg;
    const totalFormingPyg = electricityCostPyg + modFormingCostPyg;
    const totalFormingUsd = fxRate > 0 ? totalFormingPyg / fxRate : 0;

    // Forming hourly cost
    const formingLineHours = Math.max(gen1Hours, gen2Hours, 0);
    const formingHourlyCostPyg = formingLineHours > 0 ? totalFormingPyg / formingLineHours : 0;
    const totalOperatorHours = gen1OperatorsCount * gen1Hours + gen2OperatorsCount * gen2Hours;
    const operatorHourlyCostPyg = totalOperatorHours > 0
      ? modFormingCostPyg / totalOperatorHours
      : (sectorPersonnelSummaries ? 0 : legacyOperatorHourlyCostPyg);

    // 2. Control de Calidad
    let qualityInspectors = Number(p.quality_inspectors_count || 0);
    let qualitySalaryPyg = Number(p.quality_monthly_salary_pyg || 0);
    const qualityPolypaperPercent = Math.min(Math.max(Number(p.quality_polypaper_percent || 0), 0), 100);
    const qualityMultiplier = p.quality_labor_charges_included !== false ? laborMultiplier : 1;

    const qualitySummary = sectorPersonnelSummaries?.CALIDAD;
    let qualityAssignedMonthlyPyg = 0;
    if (sectorPersonnelSummaries) {
      qualityInspectors = qualitySummary?.assigned_count || 0;
      qualitySalaryPyg = qualitySummary?.monthly_salary_base_pyg || 0;
      qualityAssignedMonthlyPyg = qualitySalaryPyg * qualityMultiplier * (qualityPolypaperPercent / 100);
    } else if (qualitySummary && qualitySummary.is_configured && qualitySummary.personnel.length > 0) {
      qualityInspectors = qualitySummary.assigned_count;
      qualitySalaryPyg = qualitySummary.monthly_salary_base_pyg;
      qualityAssignedMonthlyPyg = qualitySalaryPyg * qualityMultiplier * (qualityPolypaperPercent / 100);
    } else {
      qualityAssignedMonthlyPyg = qualityInspectors * qualitySalaryPyg * qualityMultiplier * (qualityPolypaperPercent / 100);
    }
    const qualityAssignedUsd = fxRate > 0 ? qualityAssignedMonthlyPyg / fxRate : 0;

    // Total shared operational period cost (Forming + Quality)
    const totalOperationalSharedUsd = totalFormingUsd + qualityAssignedUsd;
    const totalOperationalSharedPyg = totalFormingPyg + qualityAssignedMonthlyPyg;

    // 3. Mano de Obra de Empaque (sólo sesiones con status APPROVED)
    const approvedSessions = packingSessions.filter((s) => s.status === 'APPROVED');
    // If sessions have SKU specified, filter by SKU; otherwise consider line-wide
    const relevantSessions = approvedSessions.filter(
      (s) => !production.sku || !s.sku || s.sku === production.sku
    );
    // A line-wide session contributes only this SKU's share of period production.
    // SKU-specific sessions remain fully assigned to their matching SKU.
    const lineWideCostShare = production.sku && totalPeriodUnits > 0
      ? Math.min(Math.max(goodUnits / totalPeriodUnits, 0), 1)
      : 1;
    const sessionCostShare = (session: PackingSession) => session.sku ? 1 : lineWideCostShare;
    const approvedPersonHours = relevantSessions.reduce(
      (acc, session) => acc + (session.total_person_hours || 0) * sessionCostShare(session),
      0
    );

    const legacyPackerMonthlySalaryPyg = Number(p.packer_monthly_salary_pyg || 0);
    const legacyPackerHourlyCostPyg = monthlySalaryHours > 0
      ? (legacyPackerMonthlySalaryPyg * laborMultiplier) / monthlySalaryHours
      : 0;

    const packingSummary = sectorPersonnelSummaries?.EMPAQUE;
    const packerHourlyCostPyg = sectorPersonnelSummaries
      ? (packingSummary?.is_configured ? packingSummary.hourly_rate_avg_pyg : 0)
      : legacyPackerHourlyCostPyg;

    let packingLaborPyg = 0;
    let allocationsAppliedCount = 0;
    let unallocatedSessionsCount = 0;
    let hasDiscrepancy = false;
    let discrepancyMessage = '';

    for (const session of relevantSessions) {
      const sessionAllocs = (packingLaborAllocations || []).filter((a) => a.session_id === session.id);
      const costShare = sessionCostShare(session);
      if (sessionAllocs.length > 0) {
        allocationsAppliedCount += sessionAllocs.length;
        for (const alloc of sessionAllocs) {
          packingLaborPyg += Number(alloc.calculated_cost_pyg || 0) * costShare;
        }
      } else {
        unallocatedSessionsCount += 1;
        packingLaborPyg += (session.total_person_hours || 0) * packerHourlyCostPyg * costShare;
      }

      // Discrepancy check: any segment with headcount > assigned packers
      if (packingSummary && packingSummary.is_configured && packingSummary.assigned_count > 0) {
        for (const seg of session.segments || []) {
          if (seg.headcount > packingSummary.assigned_count) {
            hasDiscrepancy = true;
            discrepancyMessage = `Dotación de sesión (${seg.headcount} personas) supera el personal configurado en Empaque (${packingSummary.assigned_count} personas).`;
          }
        }
      }
    }

    const packingLaborUsd = fxRate > 0 ? packingLaborPyg / fxRate : 0;
    const isEstimatedPacking = unallocatedSessionsCount > 0;

    // 4. Materiales de Embalaje
    const materialsCostPerThousandUsd = Number(p.packaging_materials_cost_per_thousand_usd || 0);

    // 5. Estado y Prorrateo
    let status: IndustrialProcessCalculationDetail['status'] = 'COMPLETE';
    if (missing.length > 0) {
      status = 'CONFIGURACION_INCOMPLETA';
    } else if (goodUnits <= 0 || totalPeriodUnits <= 0 || goodUnits > totalPeriodUnits) {
      status = 'SIN_BASE_PRORRATEO';
    }

    // Prorrateo unitario (por 1.000 unidades)
    let operationalTotalUsdPerThousand = 0;
    let packagingTotalUsdPerThousand = materialsCostPerThousandUsd;
    let trueUnitOperationalUsd = 0;
    let trueUnitPackagingUsd = materialsCostPerThousandUsd / 1000;

    let allocatedFormingPyg = 0;
    let allocatedFormingUsd = 0;
    let allocatedQualityPyg = 0;
    let allocatedQualityUsd = 0;
    let allocatedOperationalPyg = 0;
    let allocatedOperationalUsd = 0;

    const proratingUnitsBasis = totalPeriodUnits > 0 ? totalPeriodUnits : goodUnits;

    if (proratingUnitsBasis > 0 && status === 'COMPLETE') {
      // Unit rate based on total period units produced across line/plant
      trueUnitOperationalUsd = totalOperationalSharedUsd / proratingUnitsBasis;
      operationalTotalUsdPerThousand = trueUnitOperationalUsd * 1000;

      // Allocated amounts for this target SKU
      if (goodUnits > 0) {
        allocatedFormingUsd = (totalFormingUsd / proratingUnitsBasis) * goodUnits;
        allocatedFormingPyg = (totalFormingPyg / proratingUnitsBasis) * goodUnits;
        allocatedQualityUsd = (qualityAssignedUsd / proratingUnitsBasis) * goodUnits;
        allocatedQualityPyg = (qualityAssignedMonthlyPyg / proratingUnitsBasis) * goodUnits;
        allocatedOperationalUsd = trueUnitOperationalUsd * goodUnits;
        allocatedOperationalPyg = allocatedOperationalUsd * fxRate;
      }

      // Packing labor unit rate: allocated to SKU good units (or period units if line-wide)
      const packingLaborBasis = goodUnits > 0 ? goodUnits : proratingUnitsBasis;
      const packingLaborUnitUsd = packingLaborBasis > 0 ? packingLaborUsd / packingLaborBasis : 0;
      const materialsUnitUsd = materialsCostPerThousandUsd / 1000;
      trueUnitPackagingUsd = packingLaborUnitUsd + materialsUnitUsd;
      packagingTotalUsdPerThousand = trueUnitPackagingUsd * 1000;
    }

    const operationalTotalPygPerThousand = operationalTotalUsdPerThousand * fxRate;
    const packagingTotalPygPerThousand = packagingTotalUsdPerThousand * fxRate;

    return {
      period: production.period,
      sku: production.sku,
      calculation_date: calculationDate,
      fx_rate: fxRate,
      fx_source: fxSource,
      status,
      missing_fields: missing.length > 0
        ? missing
        : status === 'SIN_BASE_PRORRATEO'
          ? ['Base de producción ausente o inconsistente para el período']
          : undefined,
      good_units_basis: goodUnits,
      total_period_units: totalPeriodUnits,
      forming: {
        energy_kwh_gen1: Number(energyKwhGen1.toFixed(2)),
        energy_kwh_gen2: Number(energyKwhGen2.toFixed(2)),
        total_energy_kwh: Number(totalEnergyKwh.toFixed(2)),
        electricity_cost_pyg: Number(electricityCostPyg.toFixed(0)),
        operator_hourly_cost_pyg: Number(operatorHourlyCostPyg.toFixed(2)),
        mod_forming_cost_pyg: Number(modFormingCostPyg.toFixed(0)),
        total_forming_pyg: Number(totalFormingPyg.toFixed(0)),
        total_forming_usd: Number(totalFormingUsd.toFixed(4)),
        gen1_operators_count: gen1OperatorsCount,
        gen1_operators_salary_pyg: gen1OperatorsSalaryPyg,
        gen2_operators_count: gen2OperatorsCount,
        gen2_operators_salary_pyg: gen2OperatorsSalaryPyg,
        is_personnel_configured: Boolean(formingSummary?.is_configured),
      },
      forming_hourly_cost_pyg: Number(formingHourlyCostPyg.toFixed(0)),
      quality: {
        inspectors_count: qualityInspectors,
        monthly_salary_pyg: qualitySalaryPyg,
        polypaper_percent: qualityPolypaperPercent,
        assigned_monthly_pyg: Number(qualityAssignedMonthlyPyg.toFixed(0)),
        assigned_usd: Number(qualityAssignedUsd.toFixed(4)),
        is_personnel_configured: Boolean(qualitySummary?.is_configured),
      },
      packing_labor: {
        approved_person_hours: Number(approvedPersonHours.toFixed(2)),
        packer_hourly_cost_pyg: Number(packerHourlyCostPyg.toFixed(2)),
        packing_labor_pyg: Number(packingLaborPyg.toFixed(0)),
        packing_labor_usd: Number(packingLaborUsd.toFixed(4)),
        sessions_count: relevantSessions.length,
        is_personnel_configured: Boolean(packingSummary?.is_configured),
        is_estimated: isEstimatedPacking,
        has_discrepancy: hasDiscrepancy,
        discrepancy_message: hasDiscrepancy ? discrepancyMessage : undefined,
        allocations_count: allocationsAppliedCount,
      },
      packaging_materials: {
        cost_per_thousand_usd: Number(materialsCostPerThousandUsd.toFixed(4)),
      },
      personnel_summary: sectorPersonnelSummaries,
      allocated_forming_pyg: Number(allocatedFormingPyg.toFixed(0)),
      allocated_forming_usd: Number(allocatedFormingUsd.toFixed(4)),
      allocated_quality_pyg: Number(allocatedQualityPyg.toFixed(0)),
      allocated_quality_usd: Number(allocatedQualityUsd.toFixed(4)),
      allocated_operational_pyg: Number(allocatedOperationalPyg.toFixed(0)),
      allocated_operational_usd: Number(allocatedOperationalUsd.toFixed(4)),
      operational_total_usd_per_thousand: Number(operationalTotalUsdPerThousand.toFixed(5)),
      operational_total_pyg_per_thousand: Number(operationalTotalPygPerThousand.toFixed(0)),
      packaging_total_usd_per_thousand: Number(packagingTotalUsdPerThousand.toFixed(5)),
      packaging_total_pyg_per_thousand: Number(packagingTotalPygPerThousand.toFixed(0)),
      true_unit_operational_usd: Number(trueUnitOperationalUsd.toFixed(5)),
      true_unit_packaging_usd: Number(trueUnitPackagingUsd.toFixed(5)),
    };
  }

  /**
   * Fast inline provisional calculation for immediate UI preview as inputs change.
   */
  public static calculateProvisional(
    params: Partial<PlantGeneralParameters>,
    fxRate: number,
    options?: {
      goodUnits?: number;
      totalPeriodUnits?: number;
      approvedPersonHours?: number;
    }
  ) {
    const dummyProduction: PlantProductionPeriod = {
      period: 'PROVISIONAL',
      sku: 'PROVISIONAL',
      good_units_produced: options?.goodUnits || 0,
    };
    const dummySessions: PackingSession[] = (options?.approvedPersonHours ?? 0) > 0
      ? [
          {
            id: 'dummy',
            organization_id: 'dummy',
            status: 'APPROVED',
            started_at: new Date().toISOString(),
            total_person_hours: options!.approvedPersonHours!,
            segments: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]
      : [];

    return this.calculate({
      parameters: params,
      fxRate,
      production: {
        ...dummyProduction,
        total_period_units: options?.totalPeriodUnits,
      },
      packingSessions: dummySessions,
    });
  }
}
