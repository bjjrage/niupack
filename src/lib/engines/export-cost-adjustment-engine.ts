import { ExportCostInput, ExportCostResult } from '@/lib/logistics/domain';

const round = (value: number, digits = 6) => Number(value.toFixed(digits));

export class ExportCostAdjustmentEngine {
  static calculate(input: ExportCostInput): ExportCostResult {
    if (input.quantity <= 0) throw new Error('quantity must be greater than zero');
    if (input.fx_rate <= 0) throw new Error('fx_rate must be greater than zero');

    const cashCost = input.manufacturing_components.reduce((sum, component) => sum + component.amount, 0);
    const recoverableTax = input.manufacturing_components.reduce((sum, component) => {
      if (component.tax_treatment === 'RECOVERABLE') return sum + component.amount;
      if (component.tax_treatment === 'PARTIALLY_RECOVERABLE') {
        const percent = Math.min(100, Math.max(0, component.recoverable_percent ?? 0));
        return sum + component.amount * (percent / 100);
      }
      return sum;
    }, 0);

    const logisticsCost = input.logistics_rate?.amount ?? 0;
    const economicCost = cashCost - recoverableTax + input.export_specific_costs + logisticsCost;
    const boxes = Math.ceil(input.quantity / Math.max(1, input.units_per_box));
    const pallets = input.boxes_per_pallet ? Math.ceil(boxes / input.boxes_per_pallet) : undefined;

    return {
      cash_cost: round(cashCost),
      recoverable_tax: round(recoverableTax),
      export_specific_cost: round(input.export_specific_costs),
      logistics_cost: round(logisticsCost),
      economic_export_cost: round(economicCost),
      freight_per_unit: round(logisticsCost / input.quantity),
      freight_per_box: round(logisticsCost / boxes),
      freight_per_pallet: pallets ? round(logisticsCost / pallets) : undefined,
      freight_per_m3: input.total_m3 > 0 ? round(logisticsCost / input.total_m3) : 0,
      freight_per_kg: input.total_weight_kg > 0 ? round(logisticsCost / input.total_weight_kg) : 0,
      unclassified_component_ids: input.manufacturing_components
        .filter((component) => component.tax_treatment === 'UNCLASSIFIED')
        .map((component) => component.id),
    };
  }
}
