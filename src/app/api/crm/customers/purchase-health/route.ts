import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { purchaseService } from '@/lib/crm/purchase-service';

/** Salud de recompra por cliente: totales, estados y próxima recompra. */
export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const health = await purchaseService.getHealth(identity.organizationId);
    return NextResponse.json({ health });
  } catch (error) {
    return authErrorResponse(error);
  }
}
