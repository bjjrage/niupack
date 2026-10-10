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
    const officialSheet = await repository.getActiveCostSheetForSKU(sku, identity.organizationId);

    if (!input) {
      return NextResponse.json({
        success: true,
        configured: false,
        sku,
        input: null,
        breakdown: null,
        officialSheet: officialSheet || null,
      });
    }

    const breakdown = IndustrialCostEngine.calculateCost(input);
    return NextResponse.json({
      success: true,
      configured: Boolean(breakdown.configured),
      sku,
      input,
      breakdown,
      officialSheet: officialSheet || null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const rawBody: unknown = await req.json();

    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
    }

    const bodyObj = rawBody as Record<string, unknown>;
    const input: unknown = bodyObj.input || rawBody;
    const publishOfficial = Boolean(bodyObj.publishOfficial);

    if (!isCostInput(input)) {
      return NextResponse.json({ error: 'INVALID_COST_CONFIGURATION' }, { status: 400 });
    }

    const skuMaster = (await repository.getSKUs(identity.organizationId)).find((candidate) => candidate.sku === input.sku);
    if (!skuMaster) return NextResponse.json({ error: 'SKU_NOT_IN_PRODUCT_MASTER' }, { status: 404 });

    const breakdown = IndustrialCostEngine.calculateCost(input);

    // Save draft configuration in cost_v1_configurations
    await repository.saveIndustrialCostInput(input, identity.organizationId, identity.profileId);

    let sheet: CostSheetVersion | undefined;
    if (publishOfficial) {
      if (!breakdown.configured) {
        return NextResponse.json(
          {
            error: 'CANNOT_PUBLISH_INCOMPLETE',
            message: 'No se puede publicar la hoja oficial: faltan parámetros requeridos.',
            missing_configuration: breakdown.missing_configuration,
          },
          { status: 400 }
        );
      }

      sheet = await repository.publishOfficialCostSheet(
        {
          sku: input.sku,
          batchSize: input.batch_size,
          breakdown,
          fxRate: input.fx_rate_applied,
          actorId: identity.profileId,
        },
        identity.organizationId
      );
    }

    return NextResponse.json({
      success: true,
      saved: publishOfficial ? 'OFFICIAL' : 'DRAFT',
      configured: Boolean(breakdown.configured),
      missing_configuration: breakdown.missing_configuration,
      input,
      breakdown,
      sheet: sheet || null,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
