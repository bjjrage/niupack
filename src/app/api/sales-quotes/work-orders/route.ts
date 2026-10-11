import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { listWorkOrders } from '@/lib/sales-quotes/service';

export async function GET() {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    return NextResponse.json({ work_orders: await listWorkOrders(identity.organizationId) });
  } catch (error) { return domainErrorResponse(error); }
}
