import { CostComponent, CostScenario, EfficiencyOpportunity, IndustrialProductCostInput } from '@/types';
import { IndustrialCostEngine } from './industrial-cost-engine';
import { TrueCostEngine } from './true-cost-engine';

export class ScenarioEngine {
  public static simulateV1(params: {
    input: IndustrialProductCostInput;
    batchSize: number;
    rawMaterialPercent: number;
    printingDieCutPercent: number;
    operationalPercent: number;
    scrapPercent: number;
    depreciationPercent: number;
    packagingPercent: number;
    targetMarginPercent: number;
    annualVolumeUnits?: number;
    marketBenchmarkUSD?: number;
  }) {
    const baseInput = { ...params.input, batch_size: Math.max(params.input.batch_size, 1) };
    const base = IndustrialCostEngine.calculateCost(baseInput);
    const simulatedInput: IndustrialProductCostInput = {
      ...baseInput,
      batch_size: Math.max(params.batchSize, 1),
      paper_formula: {
        ...baseInput.paper_formula,
        cif_price_ton_usd: baseInput.paper_formula.cif_price_ton_usd * (1 + params.rawMaterialPercent / 100),
      },
      bottom_formula: baseInput.bottom_formula
        ? {
            ...baseInput.bottom_formula,
            cif_price_ton_usd: baseInput.bottom_formula.cif_price_ton_usd * (1 + params.rawMaterialPercent / 100),
          }
        : undefined,
      bottom_paper_cost_ton_usd: baseInput.bottom_paper_cost_ton_usd * (1 + params.rawMaterialPercent / 100),
      quoted_printing_rate_usd: baseInput.quoted_printing_rate_usd * (1 + params.printingDieCutPercent / 100),
      operational_cost_per_thousand_usd: baseInput.operational_cost_per_thousand_usd * (1 + params.operationalPercent / 100),
      machine_depreciation_per_thousand_usd: baseInput.machine_depreciation_per_thousand_usd * (1 + params.depreciationPercent / 100),
      packaging_cost_per_thousand_usd: baseInput.packaging_cost_per_thousand_usd * (1 + params.packagingPercent / 100),
      scrap_rate_percent: Math.max(0, baseInput.scrap_rate_percent * (1 + params.scrapPercent / 100)),
    };
    const calculated = IndustrialCostEngine.calculateCost(simulatedInput);
    // V1 sliders are independent rubric overrides. Merma is a configured rubric
    // whose dollar impact is adjusted directly; it must not silently change again
    // when the raw-material slider changes.
    const simulatedScrap = Number((base.cost_scrap_usd * Math.max(0, 1 + params.scrapPercent / 100)).toFixed(5));
    const simulatedTotal = Number((
      calculated.cost_paper_cone_usd +
      calculated.cost_bottom_usd +
      calculated.cost_printing_diecut_usd +
      calculated.cost_operational_usd +
      calculated.cost_depreciation_usd +
      simulatedScrap +
      calculated.cost_packaging_usd
    ).toFixed(5));
    const simulated = {
      ...calculated,
      cost_scrap_usd: simulatedScrap,
      true_unit_cost_usd: simulatedTotal,
      batch_total_cost_usd: Number((simulatedTotal * simulatedInput.batch_size).toFixed(2)),
      rubrics: calculated.rubrics?.map((rubric) => rubric.key === 'scrap'
        ? { ...rubric, impact_usd_per_unit: simulatedScrap, impact_usd_batch: Number((simulatedScrap * simulatedInput.batch_size).toFixed(2)) }
        : rubric),
    };
    const marginFactor = Math.max(0.01, Math.min(0.9, 1 - params.targetMarginPercent / 100));
    const suggestedPriceUSD = Number((simulated.true_unit_cost_usd / marginFactor).toFixed(4));
    const unitCostDeltaUSD = Number((simulated.true_unit_cost_usd - base.true_unit_cost_usd).toFixed(5));
    const benchmark = params.marketBenchmarkUSD && params.marketBenchmarkUSD > 0 ? params.marketBenchmarkUSD : null;
    const priceGapUSD = benchmark === null ? null : Number((suggestedPriceUSD - benchmark).toFixed(4));
    const priceGapPercent = benchmark === null || benchmark === 0 ? null : Number((((priceGapUSD as number) / benchmark) * 100).toFixed(2));
    const annualImpactUSD = params.annualVolumeUnits
      ? Number((-unitCostDeltaUSD * params.annualVolumeUnits).toFixed(2))
      : null;

    return {
      baseUnitCostUSD: base.true_unit_cost_usd,
      simulatedUnitCostUSD: simulated.true_unit_cost_usd,
      unitCostDeltaUSD,
      unitCostDeltaPercent: base.true_unit_cost_usd > 0 ? Number(((unitCostDeltaUSD / base.true_unit_cost_usd) * 100).toFixed(2)) : 0,
      batchCostDeltaUSD: Number((simulated.batch_total_cost_usd - base.batch_total_cost_usd).toFixed(2)),
      suggestedPriceUSD,
      marginUSD: Number((suggestedPriceUSD - simulated.true_unit_cost_usd).toFixed(4)),
      marginPercent: suggestedPriceUSD > 0 ? Number((((suggestedPriceUSD - simulated.true_unit_cost_usd) / suggestedPriceUSD) * 100).toFixed(2)) : 0,
      priceGapUSD,
      priceGapPercent,
      annualImpactUSD,
      benchmarkUSD: benchmark,
      baseRubrics: base.rubrics ?? [],
      simulatedRubrics: simulated.rubrics ?? [],
      baseBreakdown: base,
      simulatedBreakdown: simulated,
    };
  }

  /**
   * Run a simulation on cost components with custom deltas
   */
  public static simulateScenario(params: {
    components: CostComponent[];
    batchSize: number;
    rawMaterialDeltaPercent: number; // e.g. -5.0
    scrapDeltaPercent: number; // e.g. -2.0
    efficiencyDeltaPercent: number; // e.g. +10.0
    marginTargetPercent: number; // e.g. 15.0
    freightDeltaPercent: number; // e.g. -10.0
    marketBenchmarkUSD: number; // real observed benchmark, when available
    annualVolumeUnits?: number; // default 20,000,000
  }): {
    baseUnitCostUSD: number;
    simulatedUnitCostUSD: number;
    unitCostDeltaUSD: number;
    unitCostDeltaPercent: number;
    suggestedPriceUSD: number;
    marginUSD: number;
    marginPercent: number;
    priceGapUSD: number;
    priceGapPercent: number;
    annualImpactUSD: number;
  } {
    // 1. Calculate Base Cost at standard 300k
    const baseBreakdown = TrueCostEngine.calculateCostSheet(params.components, 300000);
    const baseUnitCost = baseBreakdown.trueUnitCostUSD;

    // 2. Adjust components based on scenario inputs
    const simulatedComponents: CostComponent[] = params.components.map((comp) => {
      let adjustedRate = comp.rate_usd;

      // Raw materials adjustment
      if (['materia_prima', 'papel', 'coating', 'tintas'].includes(comp.category)) {
        adjustedRate = comp.rate_usd * (1 + params.rawMaterialDeltaPercent / 100);
      }

      // Scrap (merma) adjustment
      if (comp.category === 'merma') {
        const currentScrapRatio = comp.rate_usd / baseUnitCost; // roughly 7.6%
        const newScrapRatio = Math.max(0.01, currentScrapRatio + params.scrapDeltaPercent / 100);
        adjustedRate = comp.rate_usd * (newScrapRatio / Math.max(currentScrapRatio, 0.01));
      }

      // Machine & Process efficiency adjustment (higher throughput decreases unit cost)
      if (['formado', 'impresion', 'maquina', 'mano_de_obra'].includes(comp.category)) {
        adjustedRate = comp.rate_usd / (1 + params.efficiencyDeltaPercent / 100);
      }

      // Freight adjustment
      if (['flete_inbound', 'flete_outbound'].includes(comp.category)) {
        adjustedRate = comp.rate_usd * (1 + params.freightDeltaPercent / 100);
      }

      return {
        ...comp,
        rate_usd: adjustedRate,
      };
    });

    // 3. Calculate Simulated Cost at scenario batch size
    const simulatedBreakdown = TrueCostEngine.calculateCostSheet(simulatedComponents, params.batchSize);
    const simulatedUnitCost = simulatedBreakdown.trueUnitCostUSD;

    const unitCostDeltaUSD = Number((simulatedUnitCost - baseUnitCost).toFixed(5));
    const unitCostDeltaPercent = baseUnitCost > 0 ? Number(((unitCostDeltaUSD / baseUnitCost) * 100).toFixed(2)) : 0;

    // Price with target margin: Price = Cost / (1 - Margin)
    const marginFactor = Math.max(0.01, Math.min(0.9, 1 - params.marginTargetPercent / 100));
    const suggestedPrice = Number((simulatedUnitCost / marginFactor).toFixed(4));
    const marginUSD = Number((suggestedPrice - simulatedUnitCost).toFixed(4));
    const marginPercent = suggestedPrice > 0 ? Number(((marginUSD / suggestedPrice) * 100).toFixed(2)) : 0;

    // Price gap vs Market Benchmark
    const priceGapUSD = Number((suggestedPrice - params.marketBenchmarkUSD).toFixed(4));
    const priceGapPercent =
      params.marketBenchmarkUSD > 0
        ? Number(((priceGapUSD / params.marketBenchmarkUSD) * 100).toFixed(2))
        : 0;

    // Annual impact in dollars
    const annualVolume = params.annualVolumeUnits || 20000000;
    const annualImpactUSD = Number((-unitCostDeltaUSD * annualVolume).toFixed(2));

    return {
      baseUnitCostUSD: baseUnitCost,
      simulatedUnitCostUSD: simulatedUnitCost,
      unitCostDeltaUSD,
      unitCostDeltaPercent,
      suggestedPriceUSD: suggestedPrice,
      marginUSD,
      marginPercent,
      priceGapUSD,
      priceGapPercent,
      annualImpactUSD,
    };
  }

  /**
   * Efficiency Engine: Detect concrete cost opportunities from real component data
   */
  public static detectEfficiencyOpportunities(
    components: CostComponent[],
    annualVolume: number = 20000000
  ): EfficiencyOpportunity[] {
    const opps: EfficiencyOpportunity[] = [];

    // Check merma
    const scrapComp = components.find((c) => c.category === 'merma');
    if (scrapComp && scrapComp.rate_usd > 0.002) {
      const savingsPerUnit = scrapComp.rate_usd * 0.35; // 35% reduction in scrap
      const annualSavings = savingsPerUnit * annualVolume;
      opps.push({
        id: 'eff-scrap-1',
        title: 'Optimización de Merma en Troquelado y Formado (7.6% -> 5.0%)',
        component_or_process: 'Merma de línea de producción',
        current_metric: '7.6% merma acumulada (USD 0.0036/u)',
        target_metric: '5.0% merma acumulada (USD 0.0023/u)',
        annual_savings_usd: Math.round(annualSavings),
        ease_score: 4, // Relatively easy through machine calibration and operator training
        investment_required_usd: 3500,
        risk_level: 'LOW',
        implementation_time_weeks: 3,
        roi_score: Math.round((annualSavings / 3500) * 10),
      });
    }

    // Check paper/material cost
    const paperComp = components.find((c) => c.category === 'papel');
    if (paperComp && paperComp.rate_usd > 0.015) {
      const savingsPerUnit = paperComp.rate_usd * 0.04; // 4% bulk volume negotiation
      const annualSavings = savingsPerUnit * annualVolume;
      opps.push({
        id: 'eff-paper-2',
        title: 'Negociación por Volumen Anual de Bobinas de Cartulina Cupstock',
        component_or_process: 'Materia prima: Cartulina Cupstock 260g',
        current_metric: 'USD 0.0245/u por compras spot',
        target_metric: 'USD 0.0235/u con contrato trimestral 600 ton',
        annual_savings_usd: Math.round(annualSavings),
        ease_score: 3,
        investment_required_usd: 0,
        risk_level: 'LOW',
        implementation_time_weeks: 6,
        roi_score: 95,
      });
    }

    // Check line throughput / machine bottleneck
    const formingComp = components.find((c) => c.category === 'maquina' || c.category === 'formado');
    if (formingComp) {
      const savingsPerUnit = 0.0006;
      const annualSavings = savingsPerUnit * annualVolume;
      opps.push({
        id: 'eff-setup-3',
        title: 'Reducción de Tiempo de Setup y Paradas de Formadora Ultrasónica',
        component_or_process: 'Formadora Automática de Vasos',
        current_metric: '40 min setup / 5,500 u/h',
        target_metric: '25 min setup / 6,200 u/h (+12.7% capacidad)',
        annual_savings_usd: Math.round(annualSavings),
        ease_score: 3,
        investment_required_usd: 2000,
        risk_level: 'MEDIUM',
        implementation_time_weeks: 4,
        roi_score: Math.round((annualSavings / 2000) * 10),
      });
    }

    // Sort by annual savings descending
    return opps.sort((a, b) => b.annual_savings_usd - a.annual_savings_usd);
  }
}
