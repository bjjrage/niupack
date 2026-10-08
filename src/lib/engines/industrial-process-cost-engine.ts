import {
  IndustrialProcessCalculationDetail,
  PackingSession,
  PlantGeneralParameters,
  PlantProductionPeriod,
} from '@/types';

export interface IndustrialProcessEngineInput {
  parameters: Partial<PlantGeneralParameters>;
  fxRate: number;
  fxSource?: string;
  production: Partial<PlantProductionPeriod>;
  packingSessions?: PackingSession[];
  calculationDate?: string;
}

export class IndustrialProcessCostEngine {
  /**
   * Identifies missing configuration fields required for a valid industrial process calculation.
   */
  public static getMissingConfiguration(
    params: Partial<PlantGeneralParameters>,
    fxRate: number
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
    if (!params.operator_monthly_salary_pyg || params.operator_monthly_salary_pyg <= 0) {
      missing.push('Salario operador de formado (Gs./mes)');
    }
    if (!params.packer_monthly_salary_pyg || params.packer_monthly_salary_pyg <= 0) {
      missing.push('Salario mensual de empacador (Gs./mes)');
    }

    const hasGen1 = (params.gen1_machines_count ?? 0) > 0 && (params.gen1_power_kw ?? 0) > 0;
    const hasGen2 = (params.gen2_machines_count ?? 0) > 0 && (params.gen2_power_kw ?? 0) > 0;
    if (!hasGen1 && !hasGen2) {
      missing.push('Máquinas formadoras activas (Gen 1 o Gen 2)');
    }

    return missing;
  }

  /**
   * Deterministic calculation of industrial operational and packaging costs.
   */
  public static calculate(input: IndustrialProcessEngineInput): IndustrialProcessCalculationDetail {
    const { parameters: p, fxRate, fxSource = 'FX_OS', production, packingSessions = [] } = input;
    const calculationDate = input.calculationDate || new Date().toISOString();

    const missing = this.getMissingConfiguration(p, fxRate);
    const goodUnits = Number(production.good_units_produced || 0);

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
    const operatorMonthlySalaryPyg = Number(p.operator_monthly_salary_pyg || 0);
    const operatorMonthlyTotalPyg = operatorMonthlySalaryPyg * laborMultiplier;
    const operatorHourlyCostPyg = monthlySalaryHours > 0 ? operatorMonthlyTotalPyg / monthlySalaryHours : 0;

    const gen1Operators = Number(p.gen1_operators_count || 0);
    const gen2Operators = Number(p.gen2_operators_count || 0);
    const operatorHours = gen1Operators * gen1Hours + gen2Operators * gen2Hours;
    const modFormingCostPyg = operatorHours * operatorHourlyCostPyg;

    const totalFormingPyg = electricityCostPyg + modFormingCostPyg;
    const totalFormingUsd = fxRate > 0 ? totalFormingPyg / fxRate : 0;

    // 2. Control de Calidad
    const qualityInspectors = Number(p.quality_inspectors_count || 0);
    const qualitySalaryPyg = Number(p.quality_monthly_salary_pyg || 0);
    const qualityPolypaperPercent = Math.min(Math.max(Number(p.quality_polypaper_percent || 0), 0), 100);
    const qualityMultiplier = p.quality_labor_charges_included !== false ? laborMultiplier : 1;
    const qualityAssignedMonthlyPyg =
      qualityInspectors * qualitySalaryPyg * qualityMultiplier * (qualityPolypaperPercent / 100);
    const qualityAssignedUsd = fxRate > 0 ? qualityAssignedMonthlyPyg / fxRate : 0;

    // 3. Mano de Obra de Empaque (sólo sesiones con status APPROVED)
    const approvedSessions = packingSessions.filter((s) => s.status === 'APPROVED');
    const approvedPersonHours = approvedSessions.reduce((acc, s) => acc + (s.total_person_hours || 0), 0);

    const packerMonthlySalaryPyg = Number(p.packer_monthly_salary_pyg || 0);
    const packerMonthlyTotalPyg = packerMonthlySalaryPyg * laborMultiplier;
    const packerHourlyCostPyg = monthlySalaryHours > 0 ? packerMonthlyTotalPyg / monthlySalaryHours : 0;
    const packingLaborPyg = approvedPersonHours * packerHourlyCostPyg;
    const packingLaborUsd = fxRate > 0 ? packingLaborPyg / fxRate : 0;

    // 4. Materiales de Embalaje
    const materialsCostPerThousandUsd = Number(p.packaging_materials_cost_per_thousand_usd || 0);

    // 5. Estado y Prorrateo
    let status: IndustrialProcessCalculationDetail['status'] = 'COMPLETE';
    if (missing.length > 0) {
      status = 'CONFIGURACION_INCOMPLETA';
    } else if (goodUnits <= 0) {
      status = 'SIN_BASE_PRORRATEO';
    }

    // Prorrateo unitario (por 1.000 unidades)
    let operationalTotalUsdPerThousand = 0;
    let packagingTotalUsdPerThousand = materialsCostPerThousandUsd;
    let trueUnitOperationalUsd = 0;
    let trueUnitPackagingUsd = materialsCostPerThousandUsd / 1000;

    if (goodUnits > 0 && status === 'COMPLETE') {
      const operationalTotalUsd = totalFormingUsd + qualityAssignedUsd;
      trueUnitOperationalUsd = operationalTotalUsd / goodUnits;
      operationalTotalUsdPerThousand = trueUnitOperationalUsd * 1000;

      const packingLaborUnitUsd = packingLaborUsd / goodUnits;
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
      missing_fields: missing.length > 0 ? missing : undefined,
      good_units_basis: goodUnits,
      forming: {
        energy_kwh_gen1: Number(energyKwhGen1.toFixed(2)),
        energy_kwh_gen2: Number(energyKwhGen2.toFixed(2)),
        total_energy_kwh: Number(totalEnergyKwh.toFixed(2)),
        electricity_cost_pyg: Number(electricityCostPyg.toFixed(0)),
        operator_hourly_cost_pyg: Number(operatorHourlyCostPyg.toFixed(2)),
        mod_forming_cost_pyg: Number(modFormingCostPyg.toFixed(0)),
        total_forming_pyg: Number(totalFormingPyg.toFixed(0)),
        total_forming_usd: Number(totalFormingUsd.toFixed(4)),
      },
      quality: {
        inspectors_count: qualityInspectors,
        monthly_salary_pyg: qualitySalaryPyg,
        polypaper_percent: qualityPolypaperPercent,
        assigned_monthly_pyg: Number(qualityAssignedMonthlyPyg.toFixed(0)),
        assigned_usd: Number(qualityAssignedUsd.toFixed(4)),
      },
      packing_labor: {
        approved_person_hours: Number(approvedPersonHours.toFixed(2)),
        packer_hourly_cost_pyg: Number(packerHourlyCostPyg.toFixed(2)),
        packing_labor_pyg: Number(packingLaborPyg.toFixed(0)),
        packing_labor_usd: Number(packingLaborUsd.toFixed(4)),
        sessions_count: approvedSessions.length,
      },
      packaging_materials: {
        cost_per_thousand_usd: Number(materialsCostPerThousandUsd.toFixed(4)),
      },
      operational_total_usd_per_thousand: Number(operationalTotalUsdPerThousand.toFixed(5)),
      operational_total_pyg_per_thousand: Number(operationalTotalPygPerThousand.toFixed(0)),
      packaging_total_usd_per_thousand: Number(packagingTotalUsdPerThousand.toFixed(5)),
      packaging_total_pyg_per_thousand: Number(packagingTotalPygPerThousand.toFixed(0)),
      true_unit_operational_usd: Number(trueUnitOperationalUsd.toFixed(5)),
      true_unit_packaging_usd: Number(trueUnitPackagingUsd.toFixed(5)),
    };
  }
}
