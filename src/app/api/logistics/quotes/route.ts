import { NextRequest, NextResponse } from 'next/server';
import { logisticsRepository } from '@/lib/logistics/repository';
import { logisticsAuthErrorResponse, requireLogisticsIdentity } from '@/lib/auth/logistics-auth';

export async function GET(request: NextRequest) {
  try {
    const identity = await requireLogisticsIdentity();
    return NextResponse.json({ quotes: await logisticsRepository.listQuotes(request.nextUrl.searchParams.get('rfqId') || undefined, identity.organizationId) });
  } catch (error) { return logisticsAuthErrorResponse(error); }
}
