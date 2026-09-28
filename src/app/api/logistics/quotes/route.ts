import { NextRequest, NextResponse } from 'next/server';
import { logisticsRepository } from '@/lib/logistics/repository';
import { authErrorResponse, requireNiuIdentity } from '@/lib/auth/identity';

export async function GET(request: NextRequest) {
  try {
    const identity = await requireNiuIdentity();
    return NextResponse.json({ quotes: await logisticsRepository.listQuotes(request.nextUrl.searchParams.get('rfqId') || undefined, identity.organizationId) });
  } catch (error) { return authErrorResponse(error); }
}
