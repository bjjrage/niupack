import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { FxEngine } from '@/lib/fx/fx-provider';
import { PlantGeneralParameters } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const targetDate = new URL(req.url).searchParams.get('target_date') || undefined;
    if (targetDate) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? new Date(`${targetDate}T00:00:00.000Z`) : null;
      if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== targetDate) {
        return NextResponse.json({ error: 'INVALID_TARGET_DATE' }, { status: 400 });
      }
    }
    const parameters = await repository.getPlantParameters(identity.organizationId);
    const fxQuote = await FxEngine.getEffectiveQuote();

    const sectorPersonnelSummaries = await repository.getSectorPersonnelSummary(
      identity.organizationId,
      targetDate,
      Number(parameters.monthly_salary_hours) || 200,
      Number(parameters.labor_charges_percent) || 0
    );

    return NextResponse.json({
      success: true,
      parameters,
      sectorPersonnelSummaries,
      fx: {
        rate: fxQuote.costingRate,
        mode: fxQuote.settings.costing_rate_mode,
        source: fxQuote.quote.source,
        effective_at: fxQuote.quote.effectiveAt,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const body = (await req.json()) as Partial<PlantGeneralParameters>;

    const updated = await repository.updatePlantParameters(
      body,
      identity.organizationId,
      identity.profileId
    );
    const fxQuote = await FxEngine.getEffectiveQuote();

    return NextResponse.json({
      success: true,
      parameters: updated,
      fx: {
        rate: fxQuote.costingRate,
        mode: fxQuote.settings.costing_rate_mode,
        source: fxQuote.quote.source,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
