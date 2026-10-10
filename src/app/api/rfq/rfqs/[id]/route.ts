import { NextResponse } from 'next/server';
import { z } from 'zod';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole } from '@/lib/auth/role-guard';
import { getRfqDetail } from '@/lib/rfq/service';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const { id } = await context.params;
    const rfqId = z.string().uuid().parse(id);
    return NextResponse.json(await getRfqDetail(identity.organizationId, rfqId));
  } catch (error) {
    return domainErrorResponse(error);
  }
}
