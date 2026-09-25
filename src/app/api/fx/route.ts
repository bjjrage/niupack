import { NextRequest, NextResponse } from 'next/server';
import { FxEngine } from '@/lib/fx/fx-provider';
import { repository } from '@/lib/db/repository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const result = await FxEngine.getEffectiveQuote(forceRefresh);
    const history = await repository.getFxRateHistory(15);

    return NextResponse.json({
      success: true,
      quote: result.quote,
      status: result.status,
      costingRate: result.costingRate,
      settings: result.settings,
      history,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch FX rates' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if updating settings
    if (body.costing_rate_mode || body.manual_rate !== undefined || body.refresh_interval_minutes) {
      const updatedSettings = await repository.updateFxSettings({
        costing_rate_mode: body.costing_rate_mode,
        manual_rate: body.manual_rate !== undefined ? Number(body.manual_rate) : undefined,
        custom_margin_percent: body.custom_margin_percent !== undefined ? Number(body.custom_margin_percent) : undefined,
        refresh_interval_minutes: body.refresh_interval_minutes !== undefined ? Number(body.refresh_interval_minutes) : undefined,
      });

      const effective = await FxEngine.getEffectiveQuote(true);

      return NextResponse.json({
        success: true,
        message: 'FX Settings updated successfully',
        settings: updatedSettings,
        quote: effective.quote,
        costingRate: effective.costingRate,
      });
    }

    // Default force refresh
    const effective = await FxEngine.getEffectiveQuote(true);
    return NextResponse.json({
      success: true,
      message: 'FX rate refreshed',
      quote: effective.quote,
      status: effective.status,
      costingRate: effective.costingRate,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update FX settings' },
      { status: 500 }
    );
  }
}
