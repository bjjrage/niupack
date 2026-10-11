import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { listPurchaseOrders } from '@/lib/print-rfq/service';

export async function GET() {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    return NextResponse.json({ orders: await listPurchaseOrders(identity.organizationId) });
  } catch (error) { return domainErrorResponse(error); }
}
