import { NextRequest, NextResponse } from 'next/server';
import { ExportLogisticsEngine, STANDARD_CONTAINERS } from '@/lib/engines/export-logistics-engine';
import { repository } from '@/lib/db/repository';
import { FxEngine } from '@/lib/fx/fx-provider';
import { ContainerType } from '@/types';

export async function GET() {
  try {
    const packagingSpecs = await repository.getPackagingSpecs();
    const fxInfo = await FxEngine.getEffectiveQuote();

    return NextResponse.json({
      success: true,
      containers: STANDARD_CONTAINERS,
      packagingSpecs,
      fxCostingRate: fxInfo.costingRate,
      fxStatus: fxInfo.status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch logistics specs' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action = 'CALCULATE_ALL', sku = 'CUP-12OZ-SW' } = body;

    const packaging = (await repository.getPackagingSpec(sku)) || {
      sku,
      units_per_box: 1000,
      box_length_cm: 50,
      box_width_cm: 40,
      box_height_cm: 45,
      box_weight_kg: 9.5,
      box_volume_m3: 0.09,
    };

    const fxInfo = await FxEngine.getEffectiveQuote();
    const fxRate = body.fxRate || fxInfo.costingRate;

    // 1. Calculate LCL
    const lclInput = {
      packaging,
      number_of_boxes: body.number_of_boxes,
      number_of_units: body.number_of_units || 100000,
      freight_cost_per_m3_usd: body.freight_cost_per_m3_usd || 180,
      minimum_charge_usd: body.minimum_charge_usd || 250,
      origin_charges_usd: body.origin_charges_usd || 120,
      destination_charges_usd: body.destination_charges_usd || 150,
      documentation_usd: body.documentation_usd || 80,
      customs_usd: body.customs_usd || 90,
      insurance_usd: body.insurance_usd || 45,
    };
    const lclResult = ExportLogisticsEngine.calculateLclCost(lclInput);

    // 2. Calculate FCL
    const containerType: ContainerType = (body.container_type as ContainerType) || '40HC';
    const containerFreight = body.container_freight_cost_usd || STANDARD_CONTAINERS[containerType]?.default_freight_usd || 3200;
    const fclInput = {
      container_type: containerType,
      packaging,
      container_freight_cost_usd: containerFreight,
      origin_charges_usd: body.origin_charges_usd || 250,
      documentation_usd: body.documentation_usd || 120,
      insurance_usd: body.insurance_usd || 80,
      customs_usd: body.customs_usd || 180,
      actual_boxes_per_container: body.actual_boxes_per_container,
    };
    const fclResult = ExportLogisticsEngine.calculateFclCost(fclInput);

    // 3. Calculate Break-Even
    const breakEven = ExportLogisticsEngine.calculateLogisticsBreakEven(
      packaging,
      lclInput.freight_cost_per_m3_usd,
      body.fcl20Freight || 1850,
      containerFreight
    );

    // 4. Calculate Landed Cost
    const factoryCost = body.factoryUnitCostUSD || 0.04609;
    const landedCost = ExportLogisticsEngine.calculateLandedCost({
      sku,
      factoryUnitCostUSD: factoryCost,
      exportPackagingUSD: 0.002,
      originLogisticsUSD: 0.0015,
      documentationUSD: 0.0005,
      freightUnitUSD: body.useLcl ? lclResult.freight_cost_per_unit_usd : fclResult.freight_cost_per_unit_usd,
      insuranceUSD: 0.0005,
      destinationChargesUSD: 0.002,
      dutiesPercent: body.dutiesPercent !== undefined ? body.dutiesPercent : 10,
      fxRate,
    });

    return NextResponse.json({
      success: true,
      sku,
      packaging,
      fxRate,
      lclResult,
      fclResult,
      breakEven,
      landedCost,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to calculate logistics' },
      { status: 500 }
    );
  }
}
