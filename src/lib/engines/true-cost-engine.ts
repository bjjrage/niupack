import { CostComponent, CostSheetVersion, ProcessDefinition, ProcessStep } from '@/types';

export interface CostBreakdown {
  trueUnitCostUSD: number;
  variableCostPerUnitUSD: number;
  fixedCostPerUnitUSD: number;
  materialCostPerUnitUSD: number;
  processCostPerUnitUSD: number;
  scrapCostPerUnitUSD: number;
  overheadCostPerUnitUSD: number;
  freightCostPerUnitUSD: number;
  batchTotalCostUSD: number;
  minimumSustainablePriceUSD: number; // 10% safety margin floor
  breakEvenUnits: number;
  volumeCurve: Array<{ quantity: number; unitCostUSD: number; batchCostUSD: number }>;
}

export class TrueCostEngine {
  /**
   * Calculate full industrial true cost from cost components and batch size
   */
  public static calculateCostSheet(
    components: CostComponent[],
    batchSize: number = 300000,
    targetPriceForBreakEven: number = 0.055
  ): CostBreakdown {
    let variablePerUnit = 0;
    let fixedBatchTotal = 0;

    let materialCost = 0;
    let scrapCost = 0;
    let overheadCost = 0;
    let processCost = 0;
    let freightCost = 0;

    for (const comp of components) {
      const compUnitRate = comp.rate_usd * comp.quantity;

      if (comp.basis === 'PER_UNIT') {
        if (comp.component_type === 'VARIABLE') {
          variablePerUnit += compUnitRate;
        } else {
          // Fixed per unit allocated
          fixedBatchTotal += compUnitRate * batchSize;
        }

        // Categorize
        if (['materia_prima', 'papel', 'coating', 'tintas'].includes(comp.category)) {
          materialCost += compUnitRate;
        } else if (comp.category === 'merma') {
          scrapCost += compUnitRate;
        } else if (['overhead', 'setup', 'herramental', 'financiero'].includes(comp.category)) {
          overheadCost += compUnitRate;
        } else if (['impresion', 'formado', 'mano_de_obra', 'maquina', 'energia'].includes(comp.category)) {
          processCost += compUnitRate;
        } else if (['flete_inbound', 'flete_outbound', 'aduana'].includes(comp.category)) {
          freightCost += compUnitRate;
        }
      } else {
        // PER_BATCH
        fixedBatchTotal += compUnitRate;
        const allocatedPerUnit = batchSize > 0 ? compUnitRate / batchSize : 0;

        if (['overhead', 'setup', 'herramental', 'financiero'].includes(comp.category)) {
          overheadCost += allocatedPerUnit;
        } else if (['impresion', 'formado', 'mano_de_obra', 'maquina', 'energia'].includes(comp.category)) {
          processCost += allocatedPerUnit;
        } else {
          materialCost += allocatedPerUnit;
        }
      }
    }

    const fixedPerUnit = batchSize > 0 ? fixedBatchTotal / batchSize : 0;
    const trueUnitCost = Number((variablePerUnit + fixedPerUnit).toFixed(5));
    const batchTotalCost = Number((trueUnitCost * batchSize).toFixed(2));
    const minimumSustainablePrice = Number((trueUnitCost * 1.10).toFixed(5));

    // Break-even units: Fixed / (Price - Variable)
    const contributionMargin = targetPriceForBreakEven - variablePerUnit;
    const breakEvenUnits =
      contributionMargin > 0 ? Math.ceil(fixedBatchTotal / contributionMargin) : 0;

    // Volume curve (50k, 100k, 300k, 500k, 1M, 2M)
    const quantities = [50000, 100000, 300000, 500000, 1000000, 2000000];
    const volumeCurve = quantities.map((qty) => {
      const unitCost = Number((variablePerUnit + fixedBatchTotal / qty).toFixed(5));
      return {
        quantity: qty,
        unitCostUSD: unitCost,
        batchCostUSD: Number((unitCost * qty).toFixed(2)),
      };
    });

    return {
      trueUnitCostUSD: trueUnitCost,
      variableCostPerUnitUSD: Number(variablePerUnit.toFixed(5)),
      fixedCostPerUnitUSD: Number(fixedPerUnit.toFixed(5)),
      materialCostPerUnitUSD: Number(materialCost.toFixed(5)),
      processCostPerUnitUSD: Number(processCost.toFixed(5)),
      scrapCostPerUnitUSD: Number(scrapCost.toFixed(5)),
      overheadCostPerUnitUSD: Number(overheadCost.toFixed(5)),
      freightCostPerUnitUSD: Number(freightCost.toFixed(5)),
      batchTotalCostUSD: batchTotalCost,
      minimumSustainablePriceUSD: minimumSustainablePrice,
      breakEvenUnits,
      volumeCurve,
    };
  }

  /**
   * Calculate cumulative scrap rate and throughput from process steps
   */
  public static calculateProcessMetrics(steps: ProcessStep[]): {
    cumulativeScrapRatePercent: number;
    overallYieldPercent: number;
    totalCycleTimeSeconds: number;
    totalSetupTimeMinutes: number;
    bottleneckStep: ProcessStep | null;
    totalHourlyCostUSD: number;
    maxLineCapacityPerHour: number;
  } {
    if (steps.length === 0) {
      return {
        cumulativeScrapRatePercent: 0,
        overallYieldPercent: 100,
        totalCycleTimeSeconds: 0,
        totalSetupTimeMinutes: 0,
        bottleneckStep: null,
        totalHourlyCostUSD: 0,
        maxLineCapacityPerHour: 0,
      };
    }

    let yieldMultiplier = 1.0;
    let totalCycle = 0;
    let totalSetup = 0;
    let totalHourlyCost = 0;
    let minCapacity = steps[0].capacity_units_per_hour;
    let bottleneck = steps[0];

    for (const step of steps) {
      const stepYield = (100 - step.scrap_rate_percent) / 100;
      yieldMultiplier *= stepYield;
      totalCycle += step.cycle_time_seconds;
      totalSetup += step.setup_time_minutes;
      totalHourlyCost += step.hourly_cost_usd;

      if (step.capacity_units_per_hour < minCapacity) {
        minCapacity = step.capacity_units_per_hour;
        bottleneck = step;
      }
    }

    const overallYield = Number((yieldMultiplier * 100).toFixed(2));
    const cumulativeScrap = Number((100 - overallYield).toFixed(2));

    return {
      cumulativeScrapRatePercent: cumulativeScrap,
      overallYieldPercent: overallYield,
      totalCycleTimeSeconds: Number(totalCycle.toFixed(2)),
      totalSetupTimeMinutes: totalSetup,
      bottleneckStep: bottleneck,
      totalHourlyCostUSD: totalHourlyCost,
      maxLineCapacityPerHour: minCapacity,
    };
  }
}
