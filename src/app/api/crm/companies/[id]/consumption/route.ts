import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { purchaseService } from '@/lib/crm/purchase-service';

/** Consumo por cliente × SKU: stats, totales, mensual 12m e historial. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const consumption = await purchaseService.getConsumption(identity.organizationId, id);
    return NextResponse.json(consumption);
  } catch (error) {
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return authErrorResponse(error);
  }
}
