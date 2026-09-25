import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { IndustrialProductCostInput } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get('sku') || 'CUP-12OZ-SW';

    let input = await repository.getIndustrialCostInput(sku);
    if (!input) {
      // Default fallback
      input = {
        sku,
        paper_formula: {
          cif_price_ton_usd: 1250,
          customs_dispatch_ton_usd: 150,
          printing_method: 'OFFSET',
          sheet_width_mm: 700,
          sheet_height_mm: 1000,
          gsm: 260,
          coating_gsm: 18,
          units_per_sheet: 11,
          paper_yield_units_per_ton: 56500,
        },
        bottom_paper_cost_ton_usd: 1350,
        bottom_yield_units_per_ton: 350000,
        printing_cost_mode: 'PER_THOUSAND',
        quoted_printing_rate_usd: 4.50,
        operational_cost_per_thousand_usd: 5.40,
        machine_depreciation_per_thousand_usd: 3.50,
        scrap_rate_percent: 6.5,
        packaging_cost_per_thousand_usd: 2.20,
        batch_size: 300000,
      };
    }

    const breakdown = IndustrialCostEngine.calculateCost(input);

    return NextResponse.json({
      success: true,
      input,
      breakdown,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error fetching industrial cost' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const input: IndustrialProductCostInput = await req.json();

    if (!input.sku) {
      return NextResponse.json({ error: 'SKU is required' }, { status: 400 });
    }

    // Calculate industrial cost breakdown
    const breakdown = IndustrialCostEngine.calculateCost(input);

    // Save input in repository
    await repository.saveIndustrialCostInput(input);

    // Synchronize with active CostSheetVersion
    const sheet = await repository.getActiveCostSheetForSKU(input.sku);
    if (sheet) {
      sheet.true_unit_cost_usd = breakdown.true_unit_cost_usd;
      sheet.batch_size = input.batch_size;
      sheet.minimum_sustainable_price_usd = Number((breakdown.true_unit_cost_usd * 1.10).toFixed(5));
      sheet.components = IndustrialCostEngine.toCostComponents(breakdown, sheet.id);
      await repository.saveCostSheet(sheet);
    }

    return NextResponse.json({
      success: true,
      input,
      breakdown,
      sheet,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error saving industrial cost' }, { status: 500 });
  }
}
