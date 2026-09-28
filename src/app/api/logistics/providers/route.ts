import { NextResponse } from 'next/server';
import { logisticsRepository } from '@/lib/logistics/repository';
import { logisticsAuthErrorResponse, requireLogisticsIdentity } from '@/lib/auth/logistics-auth';

export async function GET() {
  try {
    const identity = await requireLogisticsIdentity();
    const providers = await logisticsRepository.listProviders(identity.organizationId);
    return NextResponse.json({ providers });
  } catch (error) {
    return logisticsAuthErrorResponse(error);
  }
}
