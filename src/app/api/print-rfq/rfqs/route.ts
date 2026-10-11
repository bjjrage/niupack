import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { createRfq, listRfqs } from '@/lib/print-rfq/service';

export async function GET(request: Request) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ rfqs: await listRfqs(identity.organizationId, { q: params.get('q') ?? undefined, status: params.get('status') ?? undefined }) });
  } catch (error) { return domainErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    return NextResponse.json(await createRfq(identity.organizationId, identity.profileId, await request.json().catch(() => ({}))), { status: 201 });
  } catch (error) { return domainErrorResponse(error); }
}
