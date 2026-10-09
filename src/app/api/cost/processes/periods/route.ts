import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';

export async function GET(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get('sku')?.trim();
    const period = searchParams.get('period')?.trim();

    if (sku && period) {
      const match = await repository.getProductionPeriod(sku, period, identity.organizationId);
      return NextResponse.json({ success: true, period: match || null });
    }

    const periods = await repository.getProductionPeriods(identity.organizationId);
    const filtered = periods.filter((p) => {
      if (sku && p.sku !== sku) return false;
      if (period && p.period !== period) return false;
      return true;
    });

    return NextResponse.json({ success: true, periods: filtered });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    const body = await req.json();

    const sku = body.sku?.trim();
    const period = body.period?.trim();
    const good_units_produced = Number(body.good_units_produced);

    if (!sku || !period) {
      return NextResponse.json({ error: 'SKU_AND_PERIOD_REQUIRED' }, { status: 400 });
    }
    if (isNaN(good_units_produced) || good_units_produced < 0) {
      return NextResponse.json({ error: 'INVALID_UNITS_PRODUCED' }, { status: 400 });
    }

    const saved = await repository.saveProductionPeriod(
      {
        sku,
        period,
        good_units_produced,
        operating_hours: body.operating_hours !== undefined ? Number(body.operating_hours) : undefined,
        notes: body.notes?.trim() || undefined,
      },
      identity.organizationId
    );

    return NextResponse.json({ success: true, period: saved });
  } catch (error) {
    return authErrorResponse(error);
  }
}
