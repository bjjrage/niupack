import {
  ContainerSpec,
  ContainerType,
  FclLogisticsInput,
  FclLogisticsResult,
  LandedCostBreakdown,
  LclLogisticsInput,
  LclLogisticsResult,
  LogisticsBreakEvenPoint,
  LogisticsBreakEvenResult,
  ProductPackagingSpec,
} from '@/types';

export const STANDARD_CONTAINERS: Record<ContainerType, ContainerSpec> = {
  '20FT': {
    type: '20FT',
    name: 'Container 20ft Standard Dry',
    usable_m3: 33.0,
    max_payload_kg: 25000,
    default_freight_usd: 1850,
  },
  '40FT': {
    type: '40FT',
    name: 'Container 40ft Standard Dry',
    usable_m3: 67.0,
    max_payload_kg: 27600,
    default_freight_usd: 2850,
  },
  '40HC': {
    type: '40HC',
    name: 'Container 40ft High Cube',
    usable_m3: 76.0,
    max_payload_kg: 28000,
    default_freight_usd: 3200,
  },
  'CUSTOM': {
    type: 'CUSTOM',
    name: 'Custom Container / Truck',
    usable_m3: 85.0,
    max_payload_kg: 30000,
    default_freight_usd: 3500,
  },
};

export class ExportLogisticsEngine {
  /**
   * Calculate box volume in m3 from dimensions in centimeters
   * box_m3 = (length_cm / 100) * (width_cm / 100) * (height_cm / 100)
   */
  public static calculateBoxVolume(lengthCm: number, widthCm: number, heightCm: number): number {
    const lM = lengthCm / 100;
    const wM = widthCm / 100;
    const hM = heightCm / 100;
    return Number((lM * wM * hM).toFixed(4));
  }

  /**
   * Calculate LCL (Less than Container Load) costs based on m3 volume and rates
   */
  public static calculateLclCost(input: LclLogisticsInput): LclLogisticsResult {
    const { packaging } = input;
    const boxM3 =
      packaging.box_volume_m3 > 0
        ? packaging.box_volume_m3
        : this.calculateBoxVolume(packaging.box_length_cm, packaging.box_width_cm, packaging.box_height_cm);

    let numBoxes = 0;
    let totalUnits = 0;

    if (input.number_of_boxes && input.number_of_boxes > 0) {
      numBoxes = Math.ceil(input.number_of_boxes);
      totalUnits = numBoxes * packaging.units_per_box;
    } else if (input.number_of_units && input.number_of_units > 0) {
      totalUnits = input.number_of_units;
      numBoxes = Math.ceil(totalUnits / packaging.units_per_box);
    } else {
      numBoxes = 1;
      totalUnits = packaging.units_per_box;
    }

    const totalM3 = Number((numBoxes * boxM3).toFixed(4));
    const calculatedFreight = totalM3 * input.freight_cost_per_m3_usd;

    const minimumCharge = input.minimum_charge_usd || 0;
    const minimumApplied = minimumCharge > 0 && calculatedFreight < minimumCharge;
    const freightSubtotal = Number((minimumApplied ? minimumCharge : calculatedFreight).toFixed(2));

    const otherCharges =
      (input.origin_charges_usd || 0) +
      (input.destination_charges_usd || 0) +
      (input.documentation_usd || 0) +
      (input.customs_usd || 0) +
      (input.insurance_usd || 0) +
      (input.other_export_costs_usd || 0);

    const totalLclCost = Number((freightSubtotal + otherCharges).toFixed(2));
    const freightPerBox = numBoxes > 0 ? Number((freightSubtotal / numBoxes).toFixed(4)) : 0;
    const freightPerUnit = totalUnits > 0 ? Number((freightSubtotal / totalUnits).toFixed(5)) : 0;
    const totalCostPerBox = numBoxes > 0 ? Number((totalLclCost / numBoxes).toFixed(4)) : 0;
    const totalCostPerUnit = totalUnits > 0 ? Number((totalLclCost / totalUnits).toFixed(5)) : 0;

    return {
      number_of_boxes: numBoxes,
      total_units: totalUnits,
      box_volume_m3: boxM3,
      total_m3: totalM3,
      freight_rate_per_m3_usd: input.freight_cost_per_m3_usd,
      minimum_charge_applied: minimumApplied,
      freight_subtotal_usd: freightSubtotal,
      freight_cost_per_box_usd: freightPerBox,
      freight_cost_per_unit_usd: freightPerUnit,
      other_charges_subtotal_usd: Number(otherCharges.toFixed(2)),
      total_lcl_cost_usd: totalLclCost,
      total_cost_per_box_usd: totalCostPerBox,
      total_cost_per_unit_usd: totalCostPerUnit,
    };
  }

  /**
   * Calculate FCL (Full Container Load) capacity, utilization and unit logistics cost
   */
  public static calculateFclCost(input: FclLogisticsInput): FclLogisticsResult {
    const { packaging, container_type } = input;
    const spec = STANDARD_CONTAINERS[container_type] || STANDARD_CONTAINERS['40HC'];

    const usableM3 = input.usable_m3 || spec.usable_m3;
    const maxPayloadKg = input.max_weight_kg || spec.max_payload_kg;

    const boxM3 =
      packaging.box_volume_m3 > 0
        ? packaging.box_volume_m3
        : this.calculateBoxVolume(packaging.box_length_cm, packaging.box_width_cm, packaging.box_height_cm);

    const boxesByVolume = boxM3 > 0 ? Math.floor(usableM3 / boxM3) : 0;
    const boxesByWeight =
      packaging.box_weight_kg > 0 ? Math.floor(maxPayloadKg / packaging.box_weight_kg) : boxesByVolume;

    const isManualOverride = typeof input.actual_boxes_per_container === 'number' && input.actual_boxes_per_container > 0;
    const usableBoxes = isManualOverride
      ? (input.actual_boxes_per_container as number)
      : Math.min(boxesByVolume, boxesByWeight);

    const unitsPerContainer = usableBoxes * packaging.units_per_box;
    const volumeUtilization = usableM3 > 0 ? Number(((usableBoxes * boxM3 / usableM3) * 100).toFixed(1)) : 0;
    const weightUtilization =
      maxPayloadKg > 0 && packaging.box_weight_kg > 0
        ? Number(((usableBoxes * packaging.box_weight_kg / maxPayloadKg) * 100).toFixed(1))
        : 0;

    const freightCost = input.container_freight_cost_usd;
    const freightPerBox = usableBoxes > 0 ? Number((freightCost / usableBoxes).toFixed(4)) : 0;
    const freightPerUnit = unitsPerContainer > 0 ? Number((freightCost / unitsPerContainer).toFixed(5)) : 0;

    const originCharges = input.origin_charges_usd || 0;
    const docCharges = input.documentation_usd || 0;
    const insuranceCharges = input.insurance_usd || 0;
    const customsCharges = input.customs_usd || 0;
    const otherCharges = (input.other_export_costs_usd || 0) + (input.destination_charges_usd || 0);

    const originPerUnit = unitsPerContainer > 0 ? Number((originCharges / unitsPerContainer).toFixed(5)) : 0;
    const docPerUnit = unitsPerContainer > 0 ? Number((docCharges / unitsPerContainer).toFixed(5)) : 0;
    const insurancePerUnit = unitsPerContainer > 0 ? Number((insuranceCharges / unitsPerContainer).toFixed(5)) : 0;
    const customsPerUnit = unitsPerContainer > 0 ? Number((customsCharges / unitsPerContainer).toFixed(5)) : 0;
    const otherPerUnit = unitsPerContainer > 0 ? Number((otherCharges / unitsPerContainer).toFixed(5)) : 0;

    const totalExportCostPerUnit = Number(
      (freightPerUnit + originPerUnit + docPerUnit + insurancePerUnit + customsPerUnit + otherPerUnit).toFixed(5)
    );

    const totalContainerCost = Number(
      (freightCost + originCharges + docCharges + insuranceCharges + customsCharges + otherCharges).toFixed(2)
    );

    return {
      container_type,
      box_volume_m3: boxM3,
      boxes_by_volume: boxesByVolume,
      boxes_by_weight: boxesByWeight,
      usable_boxes: usableBoxes,
      is_manual_override: isManualOverride,
      units_per_container: unitsPerContainer,
      volume_utilization_percent: volumeUtilization,
      weight_utilization_percent: weightUtilization,
      freight_cost_per_box_usd: freightPerBox,
      freight_cost_per_unit_usd: freightPerUnit,
      origin_cost_per_unit_usd: originPerUnit,
      documentation_cost_per_unit_usd: docPerUnit,
      insurance_cost_per_unit_usd: insurancePerUnit,
      customs_cost_per_unit_usd: customsPerUnit,
      other_cost_per_unit_usd: otherPerUnit,
      total_export_cost_per_unit_usd: totalExportCostPerUnit,
      total_container_cost_usd: totalContainerCost,
    };
  }

  /**
   * Compare LCL vs FCL (20FT and 40HC) across volume tiers and identify the exact break-even volume
   */
  public static calculateLogisticsBreakEven(
    packaging: ProductPackagingSpec,
    lclRatePerM3USD: number = 180,
    fcl20FreightUSD: number = 1850,
    fcl40HcFreightUSD: number = 3200
  ): LogisticsBreakEvenResult {
    const boxM3 = packaging.box_volume_m3 > 0
      ? packaging.box_volume_m3
      : this.calculateBoxVolume(packaging.box_length_cm, packaging.box_width_cm, packaging.box_height_cm);

    // Calculate FCL units per container
    const fcl20 = this.calculateFclCost({
      container_type: '20FT',
      packaging,
      container_freight_cost_usd: fcl20FreightUSD,
    });

    const fcl40 = this.calculateFclCost({
      container_type: '40HC',
      packaging,
      container_freight_cost_usd: fcl40HcFreightUSD,
    });

    // Break-even for 20FT vs LCL:
    // When LCL freight (total_m3 * lclRate) >= fcl20FreightUSD
    // boxes * boxM3 * lclRate >= fcl20Freight
    // boxes = fcl20Freight / (boxM3 * lclRate)
    const costPerBoxLcl = boxM3 * lclRatePerM3USD;
    const breakEvenBoxes20ft = costPerBoxLcl > 0 ? Math.ceil(fcl20FreightUSD / costPerBoxLcl) : 0;
    const breakEvenUnits20ft = breakEvenBoxes20ft * packaging.units_per_box;

    const breakEvenBoxes40hc = costPerBoxLcl > 0 ? Math.ceil(fcl40HcFreightUSD / costPerBoxLcl) : 0;
    const breakEvenUnits40hc = breakEvenBoxes40hc * packaging.units_per_box;

    // Build volume tiers
    const tiers = [50000, 100000, 200000, 300000, 500000, 1000000];
    const volumeBreakdown: LogisticsBreakEvenPoint[] = tiers.map((volume) => {
      const boxes = Math.ceil(volume / packaging.units_per_box);
      const totalM3 = Number((boxes * boxM3).toFixed(2));
      const lclCost = Number((totalM3 * lclRatePerM3USD).toFixed(2));
      const lclUnit = volume > 0 ? Number((lclCost / volume).toFixed(5)) : 0;

      // For FCL, calculate how many containers needed or cost to book container
      const num20ft = Math.max(1, Math.ceil(boxes / Math.max(1, fcl20.usable_boxes)));
      const fcl20Cost = num20ft * fcl20FreightUSD;
      const fcl20Unit = Number((fcl20Cost / volume).toFixed(5));

      const num40hc = Math.max(1, Math.ceil(boxes / Math.max(1, fcl40.usable_boxes)));
      const fcl40Cost = num40hc * fcl40HcFreightUSD;
      const fcl40Unit = Number((fcl40Cost / volume).toFixed(5));

      let bestMethod: 'LCL' | '20FT' | '40HC' = 'LCL';
      if (fcl40Unit < fcl20Unit && fcl40Unit < lclUnit) {
        bestMethod = '40HC';
      } else if (fcl20Unit < lclUnit) {
        bestMethod = '20FT';
      }

      return {
        volume_units: volume,
        boxes,
        total_m3: totalM3,
        lcl_cost_usd: lclCost,
        lcl_unit_cost_usd: lclUnit,
        fcl_20ft_cost_usd: fcl20Cost,
        fcl_20ft_unit_cost_usd: fcl20Unit,
        fcl_40hc_cost_usd: fcl40Cost,
        fcl_40hc_unit_cost_usd: fcl40Unit,
        best_method: bestMethod,
      };
    });

    const summaryMessage = `A partir de aproximadamente ${breakEvenUnits20ft.toLocaleString('es-PY')} unidades (${breakEvenBoxes20ft.toLocaleString('es-PY')} cajas), el contenedor FCL 20FT resulta más económico que LCL consolidado. Para despachos superiores a ${breakEvenUnits40hc.toLocaleString('es-PY')} unidades (${breakEvenBoxes40hc.toLocaleString('es-PY')} cajas), el contenedor 40HC ofrece el menor costo logístico por unidad.`;

    return {
      break_even_units_20ft: breakEvenUnits20ft,
      break_even_boxes_20ft: breakEvenBoxes20ft,
      break_even_units_40hc: breakEvenUnits40hc,
      break_even_boxes_40hc: breakEvenBoxes40hc,
      summary_message: summaryMessage,
      volume_breakdown: volumeBreakdown,
    };
  }

  /**
   * Complete Landed Cost calculation: EXW -> FOB -> CIF -> LANDED in dual currency
   */
  public static calculateLandedCost(params: {
    sku: string;
    factoryUnitCostUSD: number;
    exportPackagingUSD?: number;
    originLogisticsUSD?: number;
    documentationUSD?: number;
    freightUnitUSD: number;
    insuranceUSD?: number;
    destinationChargesUSD?: number;
    dutiesPercent?: number; // e.g. 10 for 10%
    fxRate: number;
  }): LandedCostBreakdown {
    const {
      sku,
      factoryUnitCostUSD,
      exportPackagingUSD = 0,
      originLogisticsUSD = 0,
      documentationUSD = 0,
      freightUnitUSD,
      insuranceUSD = 0,
      destinationChargesUSD = 0,
      dutiesPercent = 0,
      fxRate,
    } = params;

    // 1. EXW (Ex Works): Factory Cost
    const exwUSD = Number(factoryUnitCostUSD.toFixed(5));

    // 2. FOB (Free on Board): EXW + Export Packaging + Origin Logistics + Export Documentation
    const fobUSD = Number((exwUSD + exportPackagingUSD + originLogisticsUSD + documentationUSD).toFixed(5));

    // 3. CIF (Cost, Insurance & Freight): FOB + Freight + Insurance
    const cifUSD = Number((fobUSD + freightUnitUSD + insuranceUSD).toFixed(5));

    // 4. LANDED: CIF + Destination Charges + Import Duties/Taxes (applied on CIF)
    const dutiesAmountUSD = Number((cifUSD * (dutiesPercent / 100)).toFixed(5));
    const landedUSD = Number((cifUSD + destinationChargesUSD + dutiesAmountUSD).toFixed(5));

    // Dual currency PYG conversions
    const exwPYG = Math.round(exwUSD * fxRate);
    const fobPYG = Math.round(fobUSD * fxRate);
    const cifPYG = Math.round(cifUSD * fxRate);
    const landedPYG = Math.round(landedUSD * fxRate);

    return {
      sku,
      factory_cost_usd: exwUSD,
      export_packaging_usd: exportPackagingUSD,
      origin_logistics_usd: originLogisticsUSD,
      documentation_usd: documentationUSD,
      freight_usd: freightUnitUSD,
      insurance_usd: insuranceUSD,
      destination_charges_usd: destinationChargesUSD,
      duties_taxes_usd: dutiesAmountUSD,
      exw_unit_usd: exwUSD,
      fob_unit_usd: fobUSD,
      cif_unit_usd: cifUSD,
      landed_unit_usd: landedUSD,
      fx_rate_used: fxRate,
      exw_unit_pyg: exwPYG,
      fob_unit_pyg: fobPYG,
      cif_unit_pyg: cifPYG,
      landed_unit_pyg: landedPYG,
    };
  }
}
