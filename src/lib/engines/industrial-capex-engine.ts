import {
  IndustrialCostBreakdown,
  IndustrialScenarioComparison,
  IndustrialCapexConfig,
  IndustrialScenarioId,
} from '@/types';
import { NestingEngine } from './nesting-engine';

export class IndustrialCapexEngine {
  /**
   * Default CAPEX configurations for machines
   */
  public static defaultPrinterCapex: IndustrialCapexConfig = {
    machine_name: 'Impresora Flexográfica de Banda Ancha (6 colores, 850mm)',
    capex_investment_usd: 180000,
    lifespan_years: 7,
    annual_maintenance_usd: 7200,
    operator_labor_hourly_usd: 16,
    energy_kwh_cost_usd: 0.12,
    power_kw: 35,
    speed_units_per_hour: 35000,
    plates_clises_cost_per_job_usd: 450,
    inks_cost_per_thousand_usd: 0.85,
    setup_waste_sheets: 50,
    annual_working_hours: 2400,
  };

  public static defaultDieCutterCapex: IndustrialCapexConfig = {
    machine_name: 'Troqueladora Automática de Bobina / Pliego de Alta Velocidad',
    capex_investment_usd: 120000,
    lifespan_years: 7,
    annual_maintenance_usd: 4800,
    operator_labor_hourly_usd: 12,
    energy_kwh_cost_usd: 0.12,
    power_kw: 22,
    speed_units_per_hour: 40000,
    plates_clises_cost_per_job_usd: 600,
    inks_cost_per_thousand_usd: 0,
    setup_waste_sheets: 30,
    annual_working_hours: 2400,
  };

  /**
   * Evaluate all 4 Industrial Scenarios against current baseline
   */
  public static evaluateScenarios(params: {
    currentBreakdown: IndustrialCostBreakdown;
    marketBenchmarkUSD: number;
    annualVolumeUnits?: number;
    customPrinterCapex?: Partial<IndustrialCapexConfig>;
    customDieCutterCapex?: Partial<IndustrialCapexConfig>;
  }): IndustrialScenarioComparison[] {
    const annualVolume = params.annualVolumeUnits || 20_000_000;
    const benchmark = params.marketBenchmarkUSD || 0.0490;
    const base = params.currentBreakdown;

    // Standard paper cost with narrow web
    const baseUnitCost = base.true_unit_cost_usd || 0.0501;

    // Calculate exact paper saving between 90x100 (narrow) and 75x100 (wide)
    const formatComp = NestingEngine.compareFormats({});
    const paperSavingUSD = formatComp.unitCostSavingUSD || 0.00438;

    // Third-party outsourced costs vs internal costs
    const outsourcedPrintingUSD = base.cost_printing_diecut_usd > 0
      ? Number((base.cost_printing_diecut_usd * 0.65).toFixed(5)) // ~65% of print+diecut is printing ($0.0045/u)
      : 0.0045;
    const outsourcedDieCuttingUSD = base.cost_printing_diecut_usd > 0
      ? Number((base.cost_printing_diecut_usd * 0.35).toFixed(5)) // ~35% is die-cutting ($0.0025/u)
      : 0.0025;

    // Internal printing cost estimation
    // Direct materials (ink: $0.85/1000u) + Labor ($16/hr / 35,000u/hr) + Power ($4.2/hr / 35,000u/hr) + Maintenance
    const internalPrintingDirectUSD = 0.00085 + 16 / 35000 + (35 * 0.12) / 35000 + 7200 / annualVolume;
    const printerDepreciationPerUnitUSD = 180000 / (7 * annualVolume);
    const internalPrintingTotalUSD = Number((internalPrintingDirectUSD + printerDepreciationPerUnitUSD).toFixed(5)); // ~$0.00295/u

    // Internal die-cutting cost estimation
    const internalDieCuttingDirectUSD = 12 / 40000 + (22 * 0.12) / 40000 + 4800 / annualVolume;
    const dieCutterDepreciationPerUnitUSD = 120000 / (7 * annualVolume);
    const internalDieCuttingTotalUSD = Number((internalDieCuttingDirectUSD + dieCutterDepreciationPerUnitUSD).toFixed(5)); // ~$0.00185/u

    const scenarios: IndustrialScenarioComparison[] = [];

    // ==========================================
    // SCENARIO A: CURRENT (Outsourced Narrow Web)
    // ==========================================
    const gapA = Number((((baseUnitCost - benchmark) / benchmark) * 100).toFixed(2));
    const marginAtBenchmarkA = Number((((benchmark - baseUnitCost) / benchmark) * 100).toFixed(2));

    scenarios.push({
      id: 'SCENARIO_A_OUTSOURCED_NARROW',
      title: 'A — Actual: Tercerizado Banda Angosta',
      technology_description: 'Pliegos 900×1000 mm en imprenta externa con troquelado tercerizado.',
      format_label: '900 × 1000 mm (Banda Angosta)',
      printing_model: 'OUTSOURCED',
      die_cutting_model: 'OUTSOURCED',
      unit_cost_usd: baseUnitCost,
      unit_saving_vs_current_usd: 0,
      cost_gap_vs_benchmark_percent: gapA,
      margin_at_benchmark_percent: marginAtBenchmarkA,
      capex_investment_usd: 0,
      annual_saving_at_volume_usd: 0,
      break_even_volume_annual: 0,
      payback_years: 0,
      roi_percent: 0,
      feasibility_status: 'CURRENT',
      recommendation: 'Línea base actual. Alta merma de papel en pliego 900x1000 y dependencia de cotizaciones externas de imprenta.',
    });

    // ==========================================
    // SCENARIO B: OUTSOURCED OPTIMIZED (Wide Web Supplier)
    // ==========================================
    const unitCostB = Number((baseUnitCost - paperSavingUSD - 0.0003).toFixed(5));
    const savingB = Number((baseUnitCost - unitCostB).toFixed(5));
    const annualSavingB = Number((savingB * annualVolume).toFixed(2));
    const gapB = Number((((unitCostB - benchmark) / benchmark) * 100).toFixed(2));
    const marginAtBenchmarkB = Number((((benchmark - unitCostB) / benchmark) * 100).toFixed(2));

    scenarios.push({
      id: 'SCENARIO_B_OUTSOURCED_WIDE',
      title: 'B — Tercerizado Optimizado (Banda Ancha)',
      technology_description: 'Cambio de proveedor o formato a pliego 750×1000 mm. Mismo número de conos (18) con 16.7% menos papel.',
      format_label: '750 × 1000 mm (Banda Ancha Tercerizada)',
      printing_model: 'OUTSOURCED',
      die_cutting_model: 'OUTSOURCED',
      unit_cost_usd: unitCostB,
      unit_saving_vs_current_usd: savingB,
      cost_gap_vs_benchmark_percent: gapB,
      margin_at_benchmark_percent: marginAtBenchmarkB,
      capex_investment_usd: 0,
      annual_saving_at_volume_usd: annualSavingB,
      break_even_volume_annual: 0,
      payback_years: 0,
      roi_percent: 0,
      feasibility_status: 'IMMEDIATE',
      recommendation: 'Implementación inmediata sin inversión de capital (CAPEX $0). Ahorra de entrada ~USD 0.0047/u reduciendo el gap contra Brasil.',
    });

    // ==========================================
    // SCENARIO C: PARTIAL INTEGRATION (Own Wide-Web Flexo Printing)
    // ==========================================
    const printingSavingUSD = Math.max(0, outsourcedPrintingUSD - internalPrintingTotalUSD);
    const unitCostC = Number((unitCostB - printingSavingUSD).toFixed(5));
    const savingC = Number((baseUnitCost - unitCostC).toFixed(5));
    const annualSavingC = Number((savingC * annualVolume).toFixed(2));
    const gapC = Number((((unitCostC - benchmark) / benchmark) * 100).toFixed(2));
    const marginAtBenchmarkC = Number((((benchmark - unitCostC) / benchmark) * 100).toFixed(2));
    const capexC = 180000;
    const paybackC = annualSavingC > 0 ? Number((capexC / annualSavingC).toFixed(2)) : 99;
    const roiC = capexC > 0 ? Number(((annualSavingC / capexC) * 100).toFixed(1)) : 0;
    const breakEvenC = savingC > 0 ? Math.round(capexC / savingC) : 0;

    scenarios.push({
      id: 'SCENARIO_C_PARTIAL_INTEGRATION',
      title: 'C — Integración Parcial (Impresora Flexo Propia)',
      technology_description: 'Adquisición de impresora flexográfica central drum de banda ancha. Troquelado sigue tercerizado.',
      format_label: 'Bobina / Pliego 750 mm (Flexo Interna)',
      printing_model: 'INTERNAL',
      die_cutting_model: 'OUTSOURCED',
      unit_cost_usd: unitCostC,
      unit_saving_vs_current_usd: savingC,
      cost_gap_vs_benchmark_percent: gapC,
      margin_at_benchmark_percent: marginAtBenchmarkC,
      capex_investment_usd: capexC,
      annual_saving_at_volume_usd: annualSavingC,
      break_even_volume_annual: breakEvenC,
      payback_years: paybackC,
      roi_percent: roiC,
      feasibility_status: 'CAPEX_VIABLE',
      recommendation: `Alta viabilidad para volúmenes superiores a ${(breakEvenC / 1_000_000).toFixed(1)}M u. Repago estimado en ${paybackC} años con ROI de ${roiC}% anual.`,
    });

    // ==========================================
    // SCENARIO D: FULL INTEGRATION (Own Flexo + Own Die Cutter)
    // ==========================================
    const dieCuttingSavingUSD = Math.max(0, outsourcedDieCuttingUSD - internalDieCuttingTotalUSD);
    const unitCostD = Number((unitCostC - dieCuttingSavingUSD).toFixed(5));
    const savingD = Number((baseUnitCost - unitCostD).toFixed(5));
    const annualSavingD = Number((savingD * annualVolume).toFixed(2));
    const gapD = Number((((unitCostD - benchmark) / benchmark) * 100).toFixed(2));
    const marginAtBenchmarkD = Number((((benchmark - unitCostD) / benchmark) * 100).toFixed(2));
    const capexD = 300000;
    const paybackD = annualSavingD > 0 ? Number((capexD / annualSavingD).toFixed(2)) : 99;
    const roiD = capexD > 0 ? Number(((annualSavingD / capexD) * 100).toFixed(1)) : 0;
    const breakEvenD = savingD > 0 ? Math.round(capexD / savingD) : 0;

    scenarios.push({
      id: 'SCENARIO_D_FULL_INTEGRATION',
      title: 'D — Integración Total (Impresión + Troquelado Propio)',
      technology_description: 'Planta 100% autosuficiente con línea integrada de impresión flexo y troquelado rotativo.',
      format_label: 'Planta Totalmente Integrada',
      printing_model: 'INTERNAL',
      die_cutting_model: 'INTERNAL',
      unit_cost_usd: unitCostD,
      unit_saving_vs_current_usd: savingD,
      cost_gap_vs_benchmark_percent: gapD,
      margin_at_benchmark_percent: marginAtBenchmarkD,
      capex_investment_usd: capexD,
      annual_saving_at_volume_usd: annualSavingD,
      break_even_volume_annual: breakEvenD,
      payback_years: paybackD,
      roi_percent: roiD,
      feasibility_status: 'LONG_TERM',
      recommendation: `Máxima rentabilidad a escala (>25M u/año). Rompe la barrera del benchmark con margen superior al ${marginAtBenchmarkD}% a precios de mercado.`,
    });

    return scenarios;
  }
}
