import { describe, it, expect } from 'vitest';
import { ExportLogisticsEngine, STANDARD_CONTAINERS } from '@/lib/engines/export-logistics-engine';
import { ProductPackagingSpec } from '@/types';

describe('Export Logistics Engine (FCL, LCL, Break-Even & Landed Cost)', () => {
  const standardPackaging: ProductPackagingSpec = {
    sku: 'CUP-12OZ-SW',
    units_per_box: 1000,
    box_length_cm: 50,
    box_width_cm: 40,
    box_height_cm: 45,
    box_weight_kg: 9.5,
    box_volume_m3: 0.09,
  };

  // CASE 2: Box 50x40x45 cm -> Expected 0.09 m3, LCL 180 USD/m3 -> freight/box 16.20 USD, 1000 u/box -> 0.0162 USD/u
  it('CASE 2: should calculate exact box volume, LCL freight per box, and freight per unit', () => {
    // 1. Box volume formula: (length_cm / 100) * (width_cm / 100) * (height_cm / 100)
    const boxM3 = ExportLogisticsEngine.calculateBoxVolume(50, 40, 45);
    expect(boxM3).toBe(0.09);

    // 2. LCL Calculation
    const result = ExportLogisticsEngine.calculateLclCost({
      packaging: standardPackaging,
      number_of_boxes: 1,
      freight_cost_per_m3_usd: 180,
    });

    // 0.09 m3 * 180 USD/m3 = 16.20 USD/caja
    expect(result.freight_cost_per_box_usd).toBe(16.2);
    // 16.20 USD / 1000 units = 0.0162 USD/unit
    expect(result.freight_cost_per_unit_usd).toBe(0.0162);
  });

  // CASE 3: 100 boxes -> 9 m3 -> at 180/m3: 1620 USD before other charges
  it('CASE 3: should calculate total volume and freight for 100 boxes', () => {
    const result = ExportLogisticsEngine.calculateLclCost({
      packaging: standardPackaging,
      number_of_boxes: 100,
      freight_cost_per_m3_usd: 180,
    });

    expect(result.total_m3).toBe(9.0);
    // 9.0 m3 * 180 USD/m3 = 1620 USD
    expect(result.freight_subtotal_usd).toBe(1620.0);
    expect(result.total_units).toBe(100000);
    expect(result.freight_cost_per_unit_usd).toBe(0.0162);
  });

  it('should enforce LCL minimum charge when freight is below threshold', () => {
    // 1 box = 0.09 m3 -> 0.09 * 180 = 16.20 USD < minimum charge 250 USD
    const result = ExportLogisticsEngine.calculateLclCost({
      packaging: standardPackaging,
      number_of_boxes: 1,
      freight_cost_per_m3_usd: 180,
      minimum_charge_usd: 250,
    });

    expect(result.minimum_charge_applied).toBe(true);
    expect(result.freight_subtotal_usd).toBe(250.0);
    expect(result.freight_cost_per_unit_usd).toBe(0.25);
  });

  it('should calculate FCL container capacity by volume and by weight limit', () => {
    // 20FT has 33 m3 usable, max payload 25,000 kg
    const fcl20 = ExportLogisticsEngine.calculateFclCost({
      container_type: '20FT',
      packaging: standardPackaging,
      container_freight_cost_usd: 1850,
    });

    // 33.0 / 0.09 = 366.66 -> Math.floor = 366 boxes
    expect(fcl20.boxes_by_volume).toBe(366);
    // 25,000 kg / 9.5 kg = 2631 boxes
    expect(fcl20.boxes_by_weight).toBe(2631);
    // Usable is min(366, 2631) = 366 boxes
    expect(fcl20.usable_boxes).toBe(366);
    expect(fcl20.units_per_container).toBe(366000);

    // 40HC has 76 m3 usable
    const fcl40 = ExportLogisticsEngine.calculateFclCost({
      container_type: '40HC',
      packaging: standardPackaging,
      container_freight_cost_usd: 3200,
    });
    // 76.0 / 0.09 = 844 boxes
    expect(fcl40.boxes_by_volume).toBe(844);
    expect(fcl40.usable_boxes).toBe(844);
    expect(fcl40.units_per_container).toBe(844000);
  });

  it('should support manual override of container box count', () => {
    const fclOverride = ExportLogisticsEngine.calculateFclCost({
      container_type: '20FT',
      packaging: standardPackaging,
      container_freight_cost_usd: 1850,
      actual_boxes_per_container: 320, // Real operational stacking constraint
    });

    expect(fclOverride.is_manual_override).toBe(true);
    expect(fclOverride.usable_boxes).toBe(320);
    expect(fclOverride.units_per_container).toBe(320000);
    // 1850 / 320,000 = 0.00578 USD/unit
    expect(fclOverride.freight_cost_per_unit_usd).toBeCloseTo(0.00578, 4);
  });

  it('should calculate logistics break-even point where FCL becomes cheaper than LCL', () => {
    // LCL = $180/m3 -> 0.09 m3 * 180 = $16.20/box -> $0.0162/u
    // FCL 20FT = $1,850 freight
    // Break-even boxes = ceil(1850 / 16.20) = ceil(114.19) = 115 boxes = 115,000 units
    const breakEven = ExportLogisticsEngine.calculateLogisticsBreakEven(
      standardPackaging,
      180,
      1850,
      3200
    );

    expect(breakEven.break_even_boxes_20ft).toBe(115);
    expect(breakEven.break_even_units_20ft).toBe(115000);
    expect(breakEven.volume_breakdown.length).toBeGreaterThan(0);

    // At 50,000 units (50 boxes), LCL should be best
    const tier50k = breakEven.volume_breakdown.find((t) => t.volume_units === 50000);
    expect(tier50k?.best_method).toBe('LCL');

    // At 500,000 units (500 boxes), 40HC should be best
    const tier500k = breakEven.volume_breakdown.find((t) => t.volume_units === 500000);
    expect(tier500k?.best_method).toBe('40HC');
  });

  it('should calculate complete Landed Cost cascade (EXW -> FOB -> CIF -> LANDED) in dual currency', () => {
    const landed = ExportLogisticsEngine.calculateLandedCost({
      sku: 'CUP-12OZ-SW',
      factoryUnitCostUSD: 0.04609,
      exportPackagingUSD: 0.002,
      originLogisticsUSD: 0.0015,
      documentationUSD: 0.0005,
      freightUnitUSD: 0.0162,
      insuranceUSD: 0.0005,
      destinationChargesUSD: 0.002,
      dutiesPercent: 10,
      fxRate: 6010,
    });

    // EXW = 0.04609
    expect(landed.exw_unit_usd).toBe(0.04609);
    // FOB = 0.04609 + 0.002 + 0.0015 + 0.0005 = 0.05009
    expect(landed.fob_unit_usd).toBe(0.05009);
    // CIF = 0.05009 + 0.0162 + 0.0005 = 0.06679
    expect(landed.cif_unit_usd).toBe(0.06679);
    // Duties = 0.06679 * 0.10 = 0.00668
    // LANDED = 0.06679 + 0.002 + 0.00668 = 0.07547
    expect(landed.landed_unit_usd).toBe(0.07547);

    // Dual currency check
    expect(landed.exw_unit_pyg).toBe(Math.round(0.04609 * 6010));
    expect(landed.landed_unit_pyg).toBe(Math.round(0.07547 * 6010));
  });
});
