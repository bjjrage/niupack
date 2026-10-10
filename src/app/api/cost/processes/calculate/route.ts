import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { repository } from '@/lib/db/repository';
import { authErrorResponse } from '@/lib/auth/identity';
import { requirePersonnelAdminIdentity } from '@/lib/auth/personnel-guard';
import { FxEngine } from '@/lib/fx/fx-provider';
import { IndustrialProcessCostEngine } from '@/lib/engines/industrial-process-cost-engine';
import { IndustrialCostEngine } from '@/lib/engines/industrial-cost-engine';
import { IndustrialSector, SectorPersonnelSummary } from '@/types';

/**
 * GET is strictly read-only: calculates industrial processes cost preview.
 * Never mutates database state, never saves snapshots automatically.
 */
export async function GET(req: NextRequest) {
  try {
    // The response includes individual payroll summaries; restrict it to the same
    // authorized audience as salary management, even when it is a read-only preview.
    const identity = await requirePersonnelAdminIdentity(req);
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
    const identity = await requirePersonnelAdminIdentity(req);
    const body = await req.json();
    const sku = body.sku?.trim() || '';
    const period = body.period?.trim() || new Date().toISOString().slice(0, 7);
    const applyToCostSheet = Boolean(body.apply_to_cost_sheet);
    const persistSnapshot = body.persist_snapshot !== false; // Default true on official POST
    const overrideGoodUnits = body.good_units_produced !== undefined ? Number(body.good_units_produced) : undefined;
    const totalPeriodUnits = body.total_period_units !== undefined ? Number(body.total_period_units) : undefined;
    const enableOperational = body.enable_operational !== undefined ? Boolean(body.enable_operational) : undefined;
    const enablePackaging = body.enable_packaging !== undefined ? Boolean(body.enable_packaging) : undefined;
    const requestId = body.request_id;
    if ((persistSnapshot || applyToCostSheet) &&
      (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))) {
      return NextResponse.json({ success: false, error: 'IDEMPOTENCY_REQUEST_ID_REQUIRED' }, { status: 400 });
    }

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
      requestId,
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
  requestId,
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
  requestId?: string;
}) {
  const isOfficialOperation = persistSnapshot || applyToCostSheet;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return NextResponse.json({ success: false, error: 'INVALID_PRODUCTION_PERIOD' }, { status: 400 });
  }
  const parameters = await repository.getPlantParameters(identity.organizationId);
  const fxQuote = await FxEngine.getEffectiveQuote();

  const periodRecord = sku && period ? await repository.getProductionPeriod(sku, period, identity.organizationId) : undefined;
  if (overrideGoodUnits !== undefined && (!Number.isFinite(overrideGoodUnits) || overrideGoodUnits <= 0)) {
    return NextResponse.json({ success: false, error: 'INVALID_GOOD_UNITS' }, { status: 400 });
  }
  if (totalPeriodUnits !== undefined && (!Number.isFinite(totalPeriodUnits) || totalPeriodUnits <= 0)) {
    return NextResponse.json({ success: false, error: 'INVALID_TOTAL_PERIOD_UNITS' }, { status: 400 });
  }
  const persistedGoodUnits = Number(periodRecord?.good_units_produced || 0);
  const goodUnits = isOfficialOperation ? persistedGoodUnits : (overrideGoodUnits ?? persistedGoodUnits);
  const hasConfirmedProductionBase = Number.isFinite(persistedGoodUnits) && persistedGoodUnits > 0;

  if (persistSnapshot && (!sku || !period)) {
    return NextResponse.json({ success: false, error: 'SNAPSHOT_REQUIRES_SKU_AND_PERIOD' }, { status: 400 });
  }
  if (applyToCostSheet && !sku) {
    return NextResponse.json({ success: false, error: 'COST_APPLY_REQUIRES_SKU' }, { status: 400 });
  }
  if ((persistSnapshot || applyToCostSheet) && !hasConfirmedProductionBase) {
    return NextResponse.json({
      success: false,
      error: 'PRODUCTION_BASE_NOT_CONFIGURED',
      message: 'Registre la producción del SKU y período antes de guardar o aplicar un cálculo oficial.',
    }, { status: 409 });
  }
  if (isOfficialOperation && overrideGoodUnits !== undefined && overrideGoodUnits !== persistedGoodUnits) {
    return NextResponse.json({
      success: false,
      error: 'PRODUCTION_INPUT_NOT_SAVED',
      message: 'Guarda las unidades del SKU antes de confirmar un cálculo oficial.',
    }, { status: 409 });
  }

  // Multi-SKU period basis resolution:
  let effectiveTotalUnits = totalPeriodUnits;
  if (effectiveTotalUnits === undefined || isOfficialOperation) {
    const allPeriods = await repository.getProductionPeriods(identity.organizationId);
    const periodUnitsSum = allPeriods
      .filter((p) => p.period === period)
      .reduce((sum, p) => sum + (p.good_units_produced || 0), 0);
    if (isOfficialOperation && totalPeriodUnits !== undefined && totalPeriodUnits !== periodUnitsSum) {
      return NextResponse.json({ success: false, error: 'PERIOD_TOTAL_NOT_MATCHING_PERSISTED_PRODUCTION' }, { status: 409 });
    }
    effectiveTotalUnits = periodUnitsSum > 0 ? periodUnitsSum : (hasConfirmedProductionBase ? goodUnits : 0);
  }
  if (hasConfirmedProductionBase && effectiveTotalUnits < goodUnits) {
    return NextResponse.json({ success: false, error: 'TOTAL_PERIOD_UNITS_BELOW_SKU_UNITS' }, { status: 400 });
  }

  // Fetch approved packing sessions for period/sku
  const allSessions = await repository.getPackingSessions(
    { status: 'APPROVED' },
    identity.organizationId
  );
  const packingSessions = allSessions.filter(
    (s) => (!period || s.started_at.startsWith(period)) && (!sku || !s.sku || s.sku === sku)
  );

  const targetDate = period ? `${period}-01` : undefined;
  const sectorPersonnelSummaries = await repository.getSectorPersonnelSummary(
    identity.organizationId,
    targetDate,
    Number(parameters.monthly_salary_hours) || 200,
    Number(parameters.labor_charges_percent) || 0
  );

  const sessionIds = packingSessions.map((s) => s.id);
  const packingLaborAllocations = sessionIds.length > 0
    ? await repository.getPackingLaborAllocations(sessionIds, identity.organizationId)
    : [];

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
    sectorPersonnelSummaries,
    packingLaborAllocations,
  });

  if ((persistSnapshot || applyToCostSheet) && calculation.status !== 'COMPLETE') {
    return NextResponse.json({
      success: false,
      error: 'INDUSTRIAL_CALCULATION_INCOMPLETE',
      calculation,
    }, { status: 422 });
  }

  // Idempotency fingerprints contain only stable user intent, never calculation
  // timestamps or generated component IDs, so an uncertain retry is safe.
  const requestFingerprint = createHash('sha256').update(JSON.stringify({
    operation: applyToCostSheet ? 'APPLY_COST' : 'SAVE_SNAPSHOT',
    sku,
    period,
    persistSnapshot,
    applyToCostSheet,
    enableOperational: enableOperational ?? null,
    enablePackaging: enablePackaging ?? null,
  })).digest('hex');
  const persistedSnapshotInput = {
    organization_id: identity.organizationId,
    sku,
    period,
    parameters_snapshot: parameters,
    calculation_detail: calculation,
    detail_json: calculation,
    created_by: identity.profileId,
  };
  let savedSnapshot = null;
  let updatedCostInput = null;
  let updatedSheet = null;

  if (applyToCostSheet) {
    const currentConfig = await repository.getCostV1Configuration(sku, identity.organizationId);
    if (!currentConfig?.input) {
      return NextResponse.json({ success: false, error: 'COST_V1_CONFIGURATION_NOT_FOUND' }, { status: 409 });
    }
    const input = { ...currentConfig.input };
    input.process_operational_cost_per_thousand_usd = calculation.operational_total_usd_per_thousand;
    input.process_packaging_cost_per_thousand_usd = calculation.packaging_total_usd_per_thousand;
    input.process_calculation_detail = calculation;
    if (enableOperational !== undefined) input.operational_process_enabled = enableOperational;
    if (enablePackaging !== undefined) input.packaging_process_enabled = enablePackaging;

    const breakdown = IndustrialCostEngine.calculateCost(input);
    if (!breakdown.configured) {
      return NextResponse.json({
        success: false,
        error: 'COST_V1_CONFIGURATION_INCOMPLETE',
        missing_configuration: breakdown.missing_configuration,
      }, { status: 422 });
    }
    const components = IndustrialCostEngine.toV1CostComponents(breakdown, 'atomic-version-pending');
    const result = await repository.applyIndustrialProcessCostAtomic({
      organizationId: identity.organizationId,
      requestId: requestId!,
      requestFingerprint,
      sku,
      period,
      calculation,
      parametersSnapshot: parameters,
      input,
      expectedConfigurationVersion: currentConfig.version || 1,
      trueUnitCostUsd: breakdown.true_unit_cost_usd,
      minimumSustainablePriceUsd: breakdown.true_unit_cost_usd,
      breakEvenUnits: 0,
      batchSize: input.batch_size,
      fxRate: fxQuote.costingRate,
      sheetName: `Hoja de costo V1 · ${sku}`,
      notes: 'Cost Intelligence V1: sincronizado desde Procesos Industriales V2.',
      components,
      actorProfileId: identity.profileId || '',
      persistSnapshot,
    });
    savedSnapshot = result.snapshot || null;
    updatedCostInput = result.configuration?.input || null;
    updatedSheet = result.cost_sheet || null;
  } else if (persistSnapshot) {
    savedSnapshot = await repository.saveIndustrialProcessSnapshotAtomic(
      persistedSnapshotInput,
      identity.organizationId,
      requestId!,
      requestFingerprint
    );
  }

  return NextResponse.json({
    success: true,
    sku,
    period,
    calculation,
    snapshot: savedSnapshot,
    applied: applyToCostSheet && Boolean(updatedSheet),
    updated_cost_input: updatedCostInput,
    updated_sheet: updatedSheet,
  });
}
