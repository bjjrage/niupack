import { NextRequest, NextResponse } from 'next/server';
import { repository } from '@/lib/db/repository';
import { requirePersonnelAdminIdentity, personnelAuthErrorResponse } from '@/lib/auth/personnel-guard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const identity = await requirePersonnelAdminIdentity(req);
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'ID_REQUIRED' }, { status: 400 });
    }

    const band = await repository.getSalaryBand(id, identity.organizationId, false);
    if (!band) {
      return NextResponse.json({ error: 'BAND_NOT_FOUND' }, { status: 404 });
    }

    const rates = await repository.getSalaryBandRates(id, identity.organizationId);
    return NextResponse.json({
      success: true,
      band_id: id,
      rates,
    });
  } catch (error) {
    return personnelAuthErrorResponse(error);
  }
}
