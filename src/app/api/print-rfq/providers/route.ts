import { NextResponse } from 'next/server';
import { domainErrorResponse, READ_ROLES, requireIdentityWithRole, WRITE_ROLES } from '@/lib/auth/role-guard';
import { listProviders, saveProvider } from '@/lib/print-rfq/service';

export async function GET(request: Request) {
  try {
    const identity = await requireIdentityWithRole(READ_ROLES);
    const all = new URL(request.url).searchParams.get('all') === '1';
    return NextResponse.json({ providers: await listProviders(identity.organizationId, all) });
  } catch (error) { return domainErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentityWithRole(WRITE_ROLES);
    return NextResponse.json({ provider: await saveProvider(identity.organizationId, await request.json().catch(() => ({}))) }, { status: 201 });
  } catch (error) { return domainErrorResponse(error); }
}
