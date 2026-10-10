import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { authErrorResponse } from '@/lib/auth/identity';
import { requirePersonnelAdminIdentity } from '@/lib/auth/personnel-guard';
import { FxEngine } from '@/lib/fx/fx-provider';
import { PlantGeneralParameters } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
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
    const identity = await requirePersonnelAdminIdentity(req);
    const body = (await req.json()) as Partial<PlantGeneralParameters> & { expected_updated_at?: string };
    const expectedUpdatedAt = body.expected_updated_at || body.updated_at;
    if (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      return NextResponse.json({ success: false, error: 'PARAMETER_VERSION_REQUIRED' }, { status: 400 });
    }

    const updated = await repository.updatePlantParameters(
      body,
      identity.organizationId,
      identity.profileId,
      expectedUpdatedAt
    );

    return NextResponse.json({
      success: true,
      parameters: updated,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PLANT_PARAMETERS_VERSION_CONFLICT') {
      return NextResponse.json({
        success: false,
        error: error.message,
        message: 'Los parámetros cambiaron en otra sesión. Recarga los datos antes de volver a guardar.',
      }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
