import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { purchaseService } from '@/lib/crm/purchase-service';

/** Alertas de recompra CONTACT_SOON + OVERDUE con responsable y valor esperado. */
export async function GET() {
  try {
    const identity = await requireNiuIdentity();
    const alerts = await purchaseService.getAlerts(identity.organizationId);
    return NextResponse.json({ alerts });
  } catch (error) {
    return authErrorResponse(error);
  }
}
