import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { listQuotes, saveQuote } from '@/lib/sales-quotes/service';

export async function GET(request: Request) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const params = new URL(request.url).searchParams;
    return NextResponse.json({ quotes: await listQuotes(identity.organizationId, { q: params.get('q') ?? undefined, status: params.get('status') ?? undefined }) });
  } catch (error) { return domainErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    return NextResponse.json(await saveQuote(identity.organizationId, identity.profileId, await request.json().catch(() => ({}))), { status: 201 });
  } catch (error) { return domainErrorResponse(error); }
}
