import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { FxEngine } from '@/lib/fx/fx-provider';
import { IndustrialProcessCostEngine } from '@/lib/engines/industrial-process-cost-engine';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';

/**
 * GET is strictly read-only: calculates industrial processes cost preview.
 * Never mutates database state, never saves snapshots automatically.
 */
export async function GET(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get('sku')?.trim() || '';
    const period = searchParams.get('period')?.trim() || new Date().toISOString().slice(0, 7);
    const totalPeriodUnitsParam = searchParams.get('total_period_units');
    const overrideGoodUnitsParam = searchParams.get('good_units_produced');

    const totalPeriodUnits = totalPeriodUnitsParam !== null && totalPeriodUnitsParam !== undefined
      ? Number(totalPeriodUnitsParam)
      : undefined;
    const overrideGoodUnits = overrideGoodUnitsParam !== null && overrideGoodUnitsParam !== undefined
      ? Number(overrideGoodUnitsParam)
      : undefined;

    return handleCalculation({
      identity,
      sku,
      period,
      applyToCostSheet: false,
      persistSnapshot: false,
      overrideGoodUnits,
      totalPeriodUnits,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * POST triggers official calculation: optionally saves snapshot and optionally applies
 * to Cost Intelligence according to independent user switch choices.
 */
export async function POST(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const body = await req.json();
    const sku = body.sku?.trim() || '';
    const period = body.period?.trim() || new Date().toISOString().slice(0, 7);
    const applyToCostSheet = Boolean(body.apply_to_cost_sheet);
    const persistSnapshot = body.persist_snapshot !== false; // Default true on official POST
    const overrideGoodUnits = body.good_units_produced !== undefined ? Number(body.good_units_produced) : undefined;
    const totalPeriodUnits = body.total_period_units !== undefined ? Number(body.total_period_units) : undefined;
    const enableOperational = body.enable_operational !== undefined ? Boolean(body.enable_operational) : undefined;
    const enablePackaging = body.enable_packaging !== undefined ? Boolean(body.enable_packaging) : undefined;

    return handleCalculation({
      identity,
      sku,
      period,
      applyToCostSheet,
      persistSnapshot,
      overrideGoodUnits,
      totalPeriodUnits,
      enableOperational,
      enablePackaging,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

async function handleCalculation({
  identity,
  sku,
  period,
  applyToCostSheet,
  persistSnapshot,
  overrideGoodUnits,
  totalPeriodUnits,
  enableOperational,
  enablePackaging,
}: {
  identity: { organizationId: string; profileId?: string };
  sku: string;
  period: string;
  applyToCostSheet: boolean;
  persistSnapshot: boolean;
  overrideGoodUnits?: number;
  totalPeriodUnits?: number;
  enableOperational?: boolean;
  enablePackaging?: boolean;
}) {
  const parameters = await repository.getPlantParameters(identity.organizationId);
  const fxQuote = await FxEngine.getEffectiveQuote();

  const periodRecord = sku && period ? await repository.getProductionPeriod(sku, period, identity.organizationId) : undefined;
  let goodUnits = overrideGoodUnits !== undefined && overrideGoodUnits > 0
    ? overrideGoodUnits
    : (periodRecord?.good_units_produced ?? 0);

  // If period record does not exist or has 0 units, fallback to SKU batch_size or default standard batch (100,000)
  if (!goodUnits || goodUnits <= 0) {
    if (sku) {
      const currentConfig = await repository.getCostV1Configuration(sku, identity.organizationId);
      if (currentConfig?.input?.batch_size && currentConfig.input.batch_size > 0) {
        goodUnits = currentConfig.input.batch_size;
      }
    }
    if (!goodUnits || goodUnits <= 0) {
      goodUnits = 100000;
    }
  }

  // Multi-SKU period basis resolution:
  let effectiveTotalUnits = totalPeriodUnits;
  if (!effectiveTotalUnits || effectiveTotalUnits <= 0) {
    const allPeriods = await repository.getProductionPeriods(identity.organizationId);
    const periodUnitsSum = allPeriods
      .filter((p) => p.period === period)
      .reduce((sum, p) => sum + (p.good_units_produced || 0), 0);
    effectiveTotalUnits = periodUnitsSum > 0 ? periodUnitsSum : goodUnits;
  }
  if (effectiveTotalUnits < goodUnits) {
    effectiveTotalUnits = goodUnits;
  }

  // Fetch approved packing sessions for period/sku
  const allSessions = await repository.getPackingSessions(
    { status: 'APPROVED' },
    identity.organizationId
  );
  const packingSessions = allSessions.filter(
    (s) => (!period || s.started_at.startsWith(period)) && (!sku || !s.sku || s.sku === sku)
  );

  const calculation = IndustrialProcessCostEngine.calculate({
    parameters,
    fxRate: fxQuote.costingRate,
    fxSource: fxQuote.quote.source,
    production: {
      period,
      sku,
      good_units_produced: goodUnits,
      total_period_units: effectiveTotalUnits,
    },
    packingSessions,
  });

  // Only persist snapshot if explicitly requested (e.g. POST), NEVER on read-only GET!
  let savedSnapshot = null;
  if (persistSnapshot && sku && period) {
    savedSnapshot = await repository.saveIndustrialProcessSnapshot(
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
  }

  let updatedCostInput = null;
  let updatedSheet = null;

  // Apply to Cost Intelligence ONLY if explicitly requested and calculation is valid
  if (applyToCostSheet && calculation.status === 'COMPLETE' && sku) {
    const currentConfig = await repository.getCostV1Configuration(sku, identity.organizationId);
    if (currentConfig?.input) {
      const input = { ...currentConfig.input };

      // Update calculated rates
      input.process_operational_cost_per_thousand_usd = calculation.operational_total_usd_per_thousand;
      input.process_packaging_cost_per_thousand_usd = calculation.packaging_total_usd_per_thousand;
      input.process_calculation_detail = calculation;

      // Update switch states independently — DO NOT force both ON!
      if (enableOperational !== undefined) {
        input.operational_process_enabled = enableOperational;
      }
      if (enablePackaging !== undefined) {
        input.packaging_process_enabled = enablePackaging;
      }

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
    snapshot: savedSnapshot,
    applied: applyToCostSheet,
    updated_cost_input: updatedCostInput,
    updated_sheet: updatedSheet,
  });
}
