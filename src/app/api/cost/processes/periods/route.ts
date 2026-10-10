import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { authErrorResponse } from '@/lib/auth/identity';
import { requirePersonnelAdminIdentity } from '@/lib/auth/personnel-guard';

export async function GET(req: NextRequest) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
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
    const identity = await requirePersonnelAdminIdentity(req);
    const body = await req.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
    }

    // The persisted production-period schema stores only SKU, period and good
    // units. Reject legacy/unsupported fields rather than acknowledging values
    // that cannot survive a reload.
    if (Object.hasOwn(body, 'operating_hours') || Object.hasOwn(body, 'notes')) {
      return NextResponse.json({ error: 'UNSUPPORTED_PRODUCTION_PERIOD_FIELDS' }, { status: 400 });
    }

    const sku = body.sku?.trim();
    const period = body.period?.trim();
    const good_units_produced = Number(body.good_units_produced);

    if (!sku || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period || '')) {
      return NextResponse.json({ error: 'SKU_AND_PERIOD_REQUIRED' }, { status: 400 });
    }
    if (!Number.isFinite(good_units_produced) || !Number.isInteger(good_units_produced) || good_units_produced < 0) {
      return NextResponse.json({ error: 'INVALID_UNITS_PRODUCED' }, { status: 400 });
    }

    const saved = await repository.saveProductionPeriod(
      {
        sku,
        period,
        good_units_produced,
      },
      identity.organizationId
    );

    return NextResponse.json({ success: true, period: saved });
  } catch (error) {
    return authErrorResponse(error);
  }
}
