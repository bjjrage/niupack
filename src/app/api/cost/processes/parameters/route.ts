import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { FxEngine } from '@/lib/fx/fx-provider';
import { PlantGeneralParameters } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const parameters = await repository.getPlantParameters(identity.organizationId);
    const fxQuote = await FxEngine.getEffectiveQuote();

    return NextResponse.json({
      success: true,
      parameters,
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
