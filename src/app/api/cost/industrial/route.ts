import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { CostSheetVersion, IndustrialProductCostInput } from '@/types';

function isCostInput(value: unknown): value is IndustrialProductCostInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<IndustrialProductCostInput>;
  return Boolean(input.sku && input.paper_formula && input.printing_cost_mode);
}

export async function GET(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get('sku')?.trim();
    if (!sku) return NextResponse.json({ error: 'SKU is required' }, { status: 400 });

    const skuMaster = (await repository.getSKUs(identity.organizationId)).find((candidate) => candidate.sku === sku);
    if (!skuMaster) return NextResponse.json({ error: 'SKU_NOT_IN_PRODUCT_MASTER' }, { status: 404 });

    const input = await repository.getIndustrialCostInput(sku, identity.organizationId);
    if (!input) {
      return NextResponse.json({ success: true, configured: false, sku, input: null, breakdown: null });
    }

    const breakdown = IndustrialCostEngine.calculateCost(input);
    return NextResponse.json({ success: true, configured: Boolean(breakdown.configured), sku, input, breakdown });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const input: unknown = await req.json();
    if (!isCostInput(input)) {
      return NextResponse.json({ error: 'INVALID_COST_CONFIGURATION' }, { status: 400 });
    }

    const skuMaster = (await repository.getSKUs(identity.organizationId)).find((candidate) => candidate.sku === input.sku);
    if (!skuMaster) return NextResponse.json({ error: 'SKU_NOT_IN_PRODUCT_MASTER' }, { status: 404 });

    const breakdown = IndustrialCostEngine.calculateCost(input);
    await repository.saveIndustrialCostInput(input, identity.organizationId, identity.profileId);

    let sheet: CostSheetVersion | undefined;
    if (breakdown.configured) {
      sheet = await repository.getActiveCostSheetForSKU(input.sku, identity.organizationId);
      if (!sheet) {
        sheet = {
          id: crypto.randomUUID(),
          organization_id: identity.organizationId,
          product_id: skuMaster.product_id,
          sku: input.sku,
          version: 1,
          name: `Hoja de costo V1 · ${input.sku}`,
          batch_size: input.batch_size,
          effective_date: new Date().toISOString().split('T')[0],
          status: 'ACTIVE',
          true_unit_cost_usd: breakdown.true_unit_cost_usd,
          minimum_sustainable_price_usd: breakdown.true_unit_cost_usd,
          break_even_units: 0,
          components: [],
        };
      }
      sheet.true_unit_cost_usd = breakdown.true_unit_cost_usd;
      sheet.batch_size = input.batch_size;
      sheet.minimum_sustainable_price_usd = breakdown.true_unit_cost_usd;
      sheet.components = IndustrialCostEngine.toV1CostComponents(breakdown, sheet.id);
      sheet.notes = 'Cost Intelligence V1: seis rubros configurables por SKU.';
      await repository.saveCostSheet(sheet, identity.organizationId);
    }

    return NextResponse.json({
      success: true,
      configured: Boolean(breakdown.configured),
      missing_configuration: breakdown.missing_configuration,
      input,
      breakdown,
      sheet,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
