import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { FxEngine } from '@/lib/fx/fx-provider';
import { IndustrialProcessCostEngine } from '@/lib/engines/industrial-process-cost-engine';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { CostSheetVersion } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get('sku')?.trim() || 'CUP-12OZ-SW';
    const period = searchParams.get('period')?.trim() || new Date().toISOString().slice(0, 7);

    return handleCalculation(identity, sku, period, false);
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const body = await req.json();
    const sku = body.sku?.trim() || 'CUP-12OZ-SW';
    const period = body.period?.trim() || new Date().toISOString().slice(0, 7);
    const applyToCostSheet = Boolean(body.apply_to_cost_sheet);
    const overrideGoodUnits = body.good_units_produced !== undefined ? Number(body.good_units_produced) : undefined;

    return handleCalculation(identity, sku, period, applyToCostSheet, overrideGoodUnits);
  } catch (error) {
    return authErrorResponse(error);
  }
}

async function handleCalculation(
  identity: { organizationId: string; profileId?: string },
  sku: string,
  period: string,
  applyToCostSheet: boolean,
  overrideGoodUnits?: number
) {
  const parameters = await repository.getPlantParameters(identity.organizationId);
  const fxQuote = await FxEngine.getEffectiveQuote();

  const periodRecord = await repository.getProductionPeriod(sku, period, identity.organizationId);
  const goodUnits = overrideGoodUnits !== undefined
    ? overrideGoodUnits
    : (periodRecord?.good_units_produced ?? 0);

  // Fetch approved packing sessions for period/sku
  const allSessions = await repository.getPackingSessions(
    { status: 'APPROVED', sku },
    identity.organizationId
  );
  const packingSessions = allSessions.filter((s) => !period || s.started_at.startsWith(period));

  const calculation = IndustrialProcessCostEngine.calculate({
    parameters,
    fxRate: fxQuote.costingRate,
    fxSource: fxQuote.quote.source,
    production: {
      period,
      sku,
      good_units_produced: goodUnits,
    },
    packingSessions,
  });

  // Persist snapshot
  await repository.saveIndustrialProcessSnapshot(
    {
      organization_id: identity.organizationId,
      sku,
      period,
      parameters_snapshot: parameters,
      calculation_detail: calculation,
      detail_json: calculation,
      created_by: identity.profileId,
    },
    identity.organizationId
  );

  let updatedCostInput = null;
  let updatedSheet = null;

  if (applyToCostSheet && calculation.status === 'COMPLETE') {
    const currentConfig = await repository.getCostV1Configuration(sku, identity.organizationId);
    if (currentConfig?.input) {
      const input = { ...currentConfig.input };
      input.operational_process_enabled = true;
      input.process_operational_cost_per_thousand_usd = calculation.operational_total_usd_per_thousand;
      input.packaging_process_enabled = true;
      input.process_packaging_cost_per_thousand_usd = calculation.packaging_total_usd_per_thousand;
      input.process_calculation_detail = calculation;

      const savedConfig = await repository.saveCostV1Configuration(
        {
          ...currentConfig,
          input,
          version: (currentConfig.version || 1) + 1,
        },
        identity.organizationId,
        identity.profileId
      );
      updatedCostInput = savedConfig.input;

      // Recalculate true cost and synchronize CostSheetVersion
      const breakdown = IndustrialCostEngine.calculateCost(input);
      if (breakdown.configured) {
        let sheet = await repository.getActiveCostSheetForSKU(sku, identity.organizationId);
        const skuMaster = (await repository.getSKUs(identity.organizationId)).find((c) => c.sku === sku);
        if (skuMaster) {
          if (!sheet) {
            sheet = {
              id: crypto.randomUUID(),
              organization_id: identity.organizationId,
              product_id: skuMaster.product_id,
              sku,
              version: 1,
              name: `Hoja de costo V1 · ${sku}`,
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
          sheet.minimum_sustainable_price_usd = breakdown.true_unit_cost_usd;
          sheet.components = IndustrialCostEngine.toV1CostComponents(breakdown, sheet.id);
          sheet.notes = 'Cost Intelligence V1: sincronizado desde Procesos Industriales V2.';
          updatedSheet = await repository.saveCostSheet(sheet, identity.organizationId);
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    sku,
    period,
    calculation,
    applied: applyToCostSheet,
    updated_cost_input: updatedCostInput,
    updated_sheet: updatedSheet,
  });
}
