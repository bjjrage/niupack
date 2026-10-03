import { NextResponse } from 'next/server';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';
import { purchaseService } from '@/lib/crm/purchase-service';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireNiuIdentity();
    const { id } = await params;
    const purchases = await purchaseService.getPurchases(identity.organizationId, id, 500);
    return NextResponse.json({ purchases });
  } catch (error) {
    if (error instanceof Error && error.message === 'CROSS_TENANT_REFERENCE') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return authErrorResponse(error);
  }
}
