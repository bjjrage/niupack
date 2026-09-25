import { NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { TrueCostEngine } from '@/lib/engines/true-cost-engine';
import { CostComponent } from '@/types';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get('sku') || 'CUP-12OZ-SW';
    const sheet = await repository.getActiveCostSheetForSKU(sku);
    return NextResponse.json({ sheet });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sku, category, name, component_type, basis, rate_usd, quantity = 1 } = body;

    const sheet = await repository.getActiveCostSheetForSKU(sku);
    if (!sheet) {
      return NextResponse.json({ error: `No active sheet for SKU ${sku}` }, { status: 404 });
    }

    const newComponent: CostComponent = {
      id: crypto.randomUUID(),
      cost_sheet_id: sheet.id,
      category,
      name,
      component_type,
      basis,
      rate_usd: parseFloat(rate_usd),
      quantity: parseFloat(quantity),
      unit_of_measure: 'unit',
      effective_date: new Date().toISOString().split('T')[0],
    };

    sheet.components = [...(sheet.components || []), newComponent];

    // Recalculate true cost
    const breakdown = TrueCostEngine.calculateCostSheet(sheet.components, sheet.batch_size);
    sheet.true_unit_cost_usd = breakdown.trueUnitCostUSD;
    sheet.minimum_sustainable_price_usd = breakdown.minimumSustainablePriceUSD;
    sheet.break_even_units = breakdown.breakEvenUnits;

    await repository.saveCostSheet(sheet);

    return NextResponse.json({ sheet, breakdown });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
